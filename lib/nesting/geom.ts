/**
 * Pure 2D ring helpers for the nesting tool. mm units, SVG-style y-down.
 * DOM-free so Vitest (node env) can exercise everything.
 */

import type { NestPiece, Pt, Ring } from './types';

/** Shoelace signed area. Sign depends on winding; callers mostly want |area|. */
export function signedArea(ring: Ring): number {
    let s = 0;
    for (let i = 0; i < ring.length; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[(i + 1) % ring.length];
        s += x1 * y2 - x2 * y1;
    }
    return s / 2;
}

export interface BBox {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export function ringsBBox(rings: Ring[]): BBox {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const ring of rings) {
        for (const [x, y] of ring) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }
    }
    if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    return { minX, minY, maxX, maxY };
}

/**
 * Normalise a ring: drop a duplicated closing point and consecutive
 * near-coincident points (flattening noise). Returns [] if degenerate.
 */
export function normalizeRing(ring: Ring, eps = 1e-3): Ring {
    const out: Ring = [];
    for (const p of ring) {
        const q = out[out.length - 1];
        if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > eps) out.push(p);
    }
    while (
        out.length > 1 &&
        Math.hypot(
            out[0][0] - out[out.length - 1][0],
            out[0][1] - out[out.length - 1][1],
        ) <= eps
    ) {
        out.pop();
    }
    return out.length >= 3 ? out : [];
}

/** Standard even-odd ray cast. Points exactly on an edge are unspecified. */
export function pointInRing(pt: Pt, ring: Ring): boolean {
    let inside = false;
    let j = ring.length - 1;
    for (let i = 0; i < ring.length; i++) {
        const xi = ring[i][0];
        const yi = ring[i][1];
        const xj = ring[j][0];
        const yj = ring[j][1];
        if (
            yi > pt[1] !== yj > pt[1] &&
            pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi || 1e-12) + xi
        ) {
            inside = !inside;
        }
        j = i;
    }
    return inside;
}

/**
 * Is ring `inner` inside ring `outer`? Valid glyph contours never cross, so
 * testing one representative vertex suffices. We use inner's leftmost vertex
 * (an extreme point of its hull) — generic position, very unlikely to sit
 * exactly on outer's boundary; a midpoint of two extremes is the tie-breaker.
 */
export function ringInsideRing(inner: Ring, outer: Ring): boolean {
    if (inner.length === 0 || outer.length < 3) return false;
    let leftmost = inner[0];
    for (const p of inner) {
        if (p[0] < leftmost[0] || (p[0] === leftmost[0] && p[1] < leftmost[1])) {
            leftmost = p;
        }
    }
    if (pointInRing(leftmost, outer)) return true;
    // Tie-breaker for the on-edge corner case: probe a second spot.
    const second = inner[Math.floor(inner.length / 2)];
    const probe: Pt = [
        (leftmost[0] + second[0]) / 2,
        (leftmost[1] + second[1]) / 2,
    ];
    return pointInRing(probe, outer);
}

export function rotateRing(ring: Ring, deg: number): Ring {
    if (deg === 0) return ring.map(([x, y]) => [x, y]);
    const r = (deg * Math.PI) / 180;
    const cos = Math.cos(r);
    const sin = Math.sin(r);
    return ring.map(([x, y]) => [x * cos - y * sin, x * sin + y * cos]);
}

export function translateRing(ring: Ring, dx: number, dy: number): Ring {
    return ring.map(([x, y]) => [x + dx, y + dy]);
}

export interface OrientedRings {
    outer: Ring;
    holes: Ring[];
    widthMm: number;
    heightMm: number;
}

/**
 * THE canonical placement transform (see Placement in types.ts): rotate the
 * piece's rings about the origin, then shift so the rotated bounding box's
 * min corner is exactly (0,0). A Placement then just adds (xMm, yMm).
 */
export function transformPieceRings(
    piece: Pick<NestPiece, 'outer' | 'holes'>,
    rotationDeg: number,
): OrientedRings {
    const outer = rotateRing(piece.outer, rotationDeg);
    const holes = piece.holes.map((h) => rotateRing(h, rotationDeg));
    const bb = ringsBBox([outer, ...holes]);
    return {
        outer: translateRing(outer, -bb.minX, -bb.minY),
        holes: holes.map((h) => translateRing(h, -bb.minX, -bb.minY)),
        widthMm: bb.maxX - bb.minX,
        heightMm: bb.maxY - bb.minY,
    };
}

/**
 * Orient a CLUSTER of pieces (a "kept" group) as one rigid body: rotate every
 * member's rings about the origin by the same angle, then snap the combined
 * bounding box's min corner to (0,0). Members keep their original relative
 * arrangement (their rings share the artwork coordinate space).
 *
 * Returns the combined rings (for rasterising the footprint) and, per member,
 * the offset of its own bbox-min within the oriented unit. The engine adds the
 * unit's sheet position to that offset to get each member's absolute
 * placement — so a clustered member reconstructs through the SAME
 * `placedPieceRings(piece, {xMm,yMm,rotationDeg})` path as a free piece, with
 * no special-casing downstream. A single-piece cluster degenerates to the
 * usual per-piece transform (offset 0,0).
 */
export interface OrientedCluster {
    /** All member rings (outer + holes), snapped to (0,0). */
    rings: Ring[];
    /** Member outer rings only — used when hole-nesting is off. */
    outers: Ring[];
    widthMm: number;
    heightMm: number;
    members: { pieceId: string; offX: number; offY: number }[];
}

export function transformClusterRings(
    members: Pick<NestPiece, 'id' | 'outer' | 'holes'>[],
    rotationDeg: number,
): OrientedCluster {
    const rotated = members.map((m) => ({
        id: m.id,
        outer: rotateRing(m.outer, rotationDeg),
        holes: m.holes.map((h) => rotateRing(h, rotationDeg)),
    }));
    const bb = ringsBBox(rotated.flatMap((r) => [r.outer, ...r.holes]));
    const dx = -bb.minX;
    const dy = -bb.minY;
    const rings: Ring[] = [];
    const outers: Ring[] = [];
    const memberInfos: OrientedCluster['members'] = [];
    for (const r of rotated) {
        const mb = ringsBBox([r.outer]); // holes ⊂ outer, so outer = member bbox
        memberInfos.push({ pieceId: r.id, offX: mb.minX + dx, offY: mb.minY + dy });
        const o = translateRing(r.outer, dx, dy);
        outers.push(o);
        rings.push(o);
        for (const h of r.holes) rings.push(translateRing(h, dx, dy));
    }
    return {
        rings,
        outers,
        widthMm: bb.maxX - bb.minX,
        heightMm: bb.maxY - bb.minY,
        members: memberInfos,
    };
}

/** Rings of a piece in final sheet coordinates for a given placement. */
export function placedPieceRings(
    piece: Pick<NestPiece, 'outer' | 'holes'>,
    placement: { xMm: number; yMm: number; rotationDeg: number },
): { outer: Ring; holes: Ring[] } {
    const o = transformPieceRings(piece, placement.rotationDeg);
    return {
        outer: translateRing(o.outer, placement.xMm, placement.yMm),
        holes: o.holes.map((h) => translateRing(h, placement.xMm, placement.yMm)),
    };
}

/** Compact SVG path data for a piece's rings (outer + holes, even-odd). */
export function ringsToPathData(rings: Ring[], decimals = 3): string {
    const f = (n: number) => {
        const s = n.toFixed(decimals);
        // Trim trailing zeros to keep cut files small.
        return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
    };
    return rings
        .filter((r) => r.length >= 3)
        .map((r) => {
            const [first, ...rest] = r;
            return (
                `M ${f(first[0])} ${f(first[1])} ` +
                rest.map(([x, y]) => `L ${f(x)} ${f(y)}`).join(' ') +
                ' Z'
            );
        })
        .join(' ');
}
