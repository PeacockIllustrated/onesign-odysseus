/**
 * Nesting-SVG import.
 *
 * Same discipline as the visualiser's importer (lib/visualiser/svg-import.ts):
 * bake every transform into absolute mm coordinates and flatten every shape
 * to plain polylines. The one thing nesting needs that the visualiser
 * doesn't is PROVENANCE — which named <g> (Illustrator layer/group) and
 * which source element each contour came from — so the piece list can show
 * "RETAIL" as one hoverable group. Curve flattening itself is shared:
 * `parsePathData` is imported from the visualiser module.
 *
 * Browser-only (uses DOMParser). Callers are client components.
 */

import { parsePathData } from '@/lib/visualiser/svg-import';
import { ringsBBox } from './geom';
import type { ImportedNestSvg, NestPath, Ring } from './types';

type Matrix = [number, number, number, number, number, number]; // a b c d e f

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function mul(m1: Matrix, m2: Matrix): Matrix {
    return [
        m1[0] * m2[0] + m1[2] * m2[1],
        m1[1] * m2[0] + m1[3] * m2[1],
        m1[0] * m2[2] + m1[2] * m2[3],
        m1[1] * m2[2] + m1[3] * m2[3],
        m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
        m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
    ];
}

function apply(m: Matrix, x: number, y: number): [number, number] {
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function parseTransform(t: string | null): Matrix {
    if (!t) return IDENTITY;
    let m: Matrix = IDENTITY;
    const re = /(\w+)\s*\(([^)]*)\)/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(t)) !== null) {
        const fn = match[1];
        const a = match[2]
            .split(/[\s,]+/)
            .map(Number)
            .filter((n) => !Number.isNaN(n));
        if (fn === 'matrix' && a.length === 6) {
            m = mul(m, a as Matrix);
        } else if (fn === 'translate') {
            m = mul(m, [1, 0, 0, 1, a[0] || 0, a[1] || 0]);
        } else if (fn === 'scale') {
            m = mul(m, [a[0] || 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0]);
        } else if (fn === 'rotate') {
            const r = ((a[0] || 0) * Math.PI) / 180;
            const cos = Math.cos(r);
            const sin = Math.sin(r);
            if (a.length === 3) {
                m = mul(m, [1, 0, 0, 1, a[1], a[2]]);
                m = mul(m, [cos, sin, -sin, cos, 0, 0]);
                m = mul(m, [1, 0, 0, 1, -a[1], -a[2]]);
            } else {
                m = mul(m, [cos, sin, -sin, cos, 0, 0]);
            }
        }
    }
    return m;
}

function readLengthMm(v: string | null): number | null {
    if (!v) return null;
    const m = v.match(/^([\d.]+)\s*(mm|cm|in|px|pt)?$/);
    if (!m) return null;
    const n = parseFloat(m[1]);
    switch (m[2]) {
        case 'cm':
            return n * 10;
        case 'in':
            return n * 25.4;
        case 'pt':
            return (n / 72) * 25.4;
        case 'px':
        case undefined:
        case '':
        default:
            return n; // treat user units as mm
    }
}

/**
 * Illustrator escapes group names into ids as `_xNN_` hex pairs (e.g.
 * "OPENING HOURS" → "OPENING_x20_HOURS") and stores the original in
 * data-name when it had to mangle. Prefer data-name, else decode the id.
 */
function decodeGroupName(el: Element): string | null {
    const dataName = el.getAttribute('data-name');
    if (dataName && dataName.trim()) return dataName.trim();
    const id = el.getAttribute('id');
    if (!id || !id.trim()) return null;
    return id
        .replace(/_x([0-9A-Fa-f]{2})_/g, (_, hex) =>
            String.fromCharCode(parseInt(hex, 16)),
        )
        .trim();
}

/**
 * Parse + flatten an uploaded SVG into absolute-mm contours with group
 * provenance. @throws if the string is not parseable as SVG.
 */
export function importNestSvg(svgText: string): ImportedNestSvg {
    if (typeof DOMParser === 'undefined') {
        throw new Error('importNestSvg must run in the browser');
    }
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const root = doc.querySelector('svg');
    if (!root || doc.querySelector('parsererror')) {
        throw new Error('Could not parse SVG file');
    }

    // Unit scale: map the SVG coordinate system to mm (same rule as the
    // visualiser importer — width/height with units against the viewBox).
    const vb = (root.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
    const wMm = readLengthMm(root.getAttribute('width'));
    const hMm = readLengthMm(root.getAttribute('height'));
    let unit = 1;
    if (vb.length === 4 && wMm && vb[2]) unit = wMm / vb[2];
    else if (vb.length === 4 && hMm && vb[3]) unit = hMm / vb[3];
    const unitM: Matrix = [unit, 0, 0, unit, 0, 0];

    const warnings: string[] = [];
    const paths: NestPath[] = [];
    const SKIP = new Set(['DEFS', 'CLIPPATH', 'MASK', 'USE', 'SYMBOL', 'PATTERN']);
    let textSeen = 0;
    let imageSeen = 0;
    let sourceIndex = -1;
    let gCounter = 0;

    const walk = (
        el: Element,
        parent: Matrix,
        groupKey: string | undefined,
        groupName: string | undefined,
    ) => {
        const tag = el.tagName.toUpperCase();
        if (SKIP.has(tag)) return;
        if (tag === 'TEXT' || tag === 'TSPAN') {
            textSeen++;
            return;
        }
        if (tag === 'IMAGE') {
            imageSeen++;
            return;
        }
        const m = mul(parent, parseTransform(el.getAttribute('transform')));

        // A drawable belongs to its IMMEDIATE enclosing <g> (the section).
        // Entering a <g> mints a new group id for its children; its own name
        // (if any) becomes their label. Crucially the name does NOT inherit —
        // an anonymous sub-group is its own section, not lumped under an outer
        // named layer (which is why a single "Layer 1" wrapper no longer
        // collapses every piece into one group).
        let childKey = groupKey;
        let childName = groupName;
        if (tag === 'G') {
            gCounter += 1;
            childKey = `g${gCounter}`;
            childName = decodeGroupName(el) ?? undefined;
        }

        const isShape =
            tag === 'PATH' ||
            tag === 'RECT' ||
            tag === 'CIRCLE' ||
            tag === 'ELLIPSE' ||
            tag === 'LINE' ||
            tag === 'POLYLINE' ||
            tag === 'POLYGON';
        if (isShape) sourceIndex++;

        const push = (raw: number[][], closed: boolean) => {
            const points = raw.map(([x, y]) => apply(m, x, y)) as Ring;
            if (points.length > 1) {
                paths.push({
                    points,
                    closed,
                    groupKey,
                    groupLabel: groupName,
                    sourceIndex,
                });
            }
        };
        const n = (a: string) => parseFloat(el.getAttribute(a) || '0');

        if (tag === 'PATH') {
            for (const sp of parsePathData(el.getAttribute('d') || '')) {
                push(sp.pts, sp.closed);
            }
        } else if (tag === 'RECT') {
            const x = n('x');
            const y = n('y');
            const w = n('width');
            const h = n('height');
            push(
                [
                    [x, y],
                    [x + w, y],
                    [x + w, y + h],
                    [x, y + h],
                    [x, y],
                ],
                true,
            );
        } else if (tag === 'CIRCLE' || tag === 'ELLIPSE') {
            const cx = n('cx');
            const cy = n('cy');
            const rx = tag === 'CIRCLE' ? n('r') : n('rx');
            const ry = tag === 'CIRCLE' ? n('r') : n('ry');
            const ring: number[][] = [];
            for (let a = 0; a <= 64; a++) {
                const t = (a / 64) * Math.PI * 2;
                ring.push([cx + Math.cos(t) * rx, cy + Math.sin(t) * ry]);
            }
            push(ring, true);
        } else if (tag === 'LINE') {
            push(
                [
                    [n('x1'), n('y1')],
                    [n('x2'), n('y2')],
                ],
                false,
            );
        } else if (tag === 'POLYLINE' || tag === 'POLYGON') {
            const nums = (el.getAttribute('points') || '')
                .split(/[\s,]+/)
                .map(Number)
                .filter((v) => !Number.isNaN(v));
            const ring: number[][] = [];
            for (let k = 0; k + 1 < nums.length; k += 2) {
                ring.push([nums[k], nums[k + 1]]);
            }
            if (tag === 'POLYGON' && ring.length) ring.push(ring[0]);
            push(ring, tag === 'POLYGON');
        }

        for (const child of Array.from(el.children))
            walk(child, m, childKey, childName);
    };

    walk(root, unitM, undefined, undefined);

    if (textSeen > 0) {
        warnings.push(
            'Live text found and ignored — convert it to outlines first (Illustrator: Type → Create Outlines) and re-export.',
        );
    }
    if (imageSeen > 0) {
        warnings.push(
            'Bitmap image(s) in the file were ignored — only vector outlines can be nested.',
        );
    }
    if (unit === 1 && !wMm && !hMm) {
        warnings.push(
            'The SVG has no physical units — 1 unit is being read as 1mm. Check the artwork width below and rescale if needed.',
        );
    }

    const allRings = paths.map((p) => p.points);
    const bb = ringsBBox(allRings);
    return {
        paths,
        bbox: { x: bb.minX, y: bb.minY, w: bb.maxX - bb.minX, h: bb.maxY - bb.minY },
        warnings,
    };
}
