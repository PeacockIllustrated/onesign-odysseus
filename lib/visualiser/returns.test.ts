import { describe, it, expect } from 'vitest';
import {
    analyzeReturns,
    segmentContour,
    DEFAULT_RETURNS_CONFIG,
    type ReturnsConfig,
    type Pt,
} from './returns';
import { buildReturnsNestSvg } from './returns-export';
import type { FlatPath } from './types';

const cfg: ReturnsConfig = { ...DEFAULT_RETURNS_CONFIG };

function square(size = 100, x = 0, y = 0): Pt[] {
    return [
        [x, y],
        [x + size, y],
        [x + size, y + size],
        [x, y + size],
        [x, y], // exporters repeat the first point — dedupe drops it
    ];
}

function circle(r = 50, cx = 0, cy = 0, segs = 64): Pt[] {
    const pts: Pt[] = [];
    for (let a = 0; a <= segs; a++) {
        const t = (a / segs) * Math.PI * 2;
        pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
    }
    return pts;
}

const closedPath = (points: Pt[]): FlatPath => ({ points, closed: true });

describe('segmentContour', () => {
    it('breaks a square into one welded strip per sharp corner', () => {
        const seg = segmentContour(square(100), true, cfg);
        expect(seg.strips).toHaveLength(4);
        expect(seg.corners).toHaveLength(4);
        expect(seg.weldPoints).toHaveLength(4);
        expect(seg.strips.every((s) => s.endReason === 'corner')).toBe(true);
        // Each side is one stock-length-fitting strip of 100 mm.
        expect(seg.strips.map((s) => Math.round(s.lengthMm))).toEqual([
            100, 100, 100, 100,
        ]);
    });

    it('bends straight through a smooth loop — one strip, one closing weld', () => {
        const seg = segmentContour(circle(50), true, cfg);
        expect(seg.corners).toHaveLength(0);
        expect(seg.strips).toHaveLength(1);
        expect(seg.strips[0].endReason).toBe('closing');
        expect(seg.weldPoints).toHaveLength(1); // the butt weld where ends meet
        // 64-gon perimeter ≈ circumference (within ~0.5 mm).
        expect(seg.strips[0].lengthMm).toBeCloseTo(2 * Math.PI * 50, 0);
    });

    it('adds butt-weld joins when a run exceeds the stock length', () => {
        // 6 m square sides at a 2.5 m stock → ceil(6000/2500) = 3 strips/side.
        const seg = segmentContour(square(6000), true, {
            ...cfg,
            stockLengthMm: 2500,
        });
        expect(seg.strips).toHaveLength(12); // 4 sides × 3
        // 2 stock joins per side + 4 corners.
        expect(seg.weldPoints).toHaveLength(12);
        const stock = seg.strips.filter((s) => s.endReason === 'stock');
        const corner = seg.strips.filter((s) => s.endReason === 'corner');
        expect(stock).toHaveLength(8);
        expect(corner).toHaveLength(4);
        expect(seg.strips.every((s) => s.lengthMm <= 2500 + 1e-6)).toBe(true);
    });

    it('treats every break point as a weld (closed ⇒ welds == strips)', () => {
        for (const pts of [square(100), circle(50), square(6000)]) {
            const seg = segmentContour(pts, true, { ...cfg, stockLengthMm: 2500 });
            expect(seg.weldPoints).toHaveLength(seg.strips.length);
        }
    });

    it('leaves the free ends of an open contour unwelded', () => {
        // An open right-angle: one interior corner, two ends.
        const open: Pt[] = [
            [0, 0],
            [100, 0],
            [100, 100],
        ];
        const seg = segmentContour(open, false, cfg);
        expect(seg.corners).toHaveLength(1);
        expect(seg.strips).toHaveLength(2);
        expect(seg.weldPoints).toHaveLength(1); // open ⇒ welds == strips - 1
    });

    it('respects the corner-angle threshold', () => {
        // A single ~20° bend (atan2(36,100) ≈ 19.8°): below the 30° default…
        const bend: Pt[] = [
            [0, 0],
            [100, 0],
            [200, 36],
        ];
        expect(segmentContour(bend, false, cfg).corners).toHaveLength(0);
        // …but a 10° threshold catches it.
        expect(
            segmentContour(bend, false, { ...cfg, breakAngleDeg: 10 }).corners,
        ).toHaveLength(1);
    });
});

describe('analyzeReturns', () => {
    it('totals every contour and counts faces', () => {
        // Keep the two shapes clearly apart so neither centroid lands on the
        // other's boundary (which would make the even-odd test ambiguous).
        const res = analyzeReturns(
            [closedPath(square(100)), closedPath(circle(50, 300, 50))],
            cfg,
        );
        expect(res.contours).toHaveLength(2);
        expect(res.faceCount).toBe(2);
        expect(res.stripCount).toBe(5); // 4 (square) + 1 (circle)
        expect(res.weldCount).toBe(5);
        expect(res.totalReturnLengthMm).toBeCloseTo(400 + 2 * Math.PI * 50, 0);
    });

    it('returns the inner counter as well as the outer edge', () => {
        // Outer letter box with a small counter near a corner (so the even-odd
        // centroid test labels them unambiguously).
        const outer = closedPath(square(100));
        const counter = closedPath(square(20, 10, 10));
        const res = analyzeReturns([outer, counter], cfg);

        expect(res.contours).toHaveLength(2);
        const kinds = res.contours.map((c) => c.kind).sort();
        expect(kinds).toEqual(['counter', 'outer']);
        // One letter face; the counter is a hole, not a face.
        expect(res.faceCount).toBe(1);
        // Both contours produce returns (the counter is wrapped too).
        expect(res.contours.every((c) => c.strips.length === 4)).toBe(true);
        expect(res.totalReturnLengthMm).toBeCloseTo(400 + 80, 1);
    });

    it('drops degenerate sub-1mm contours as flattening noise', () => {
        const speck = closedPath([
            [0, 0],
            [0.1, 0],
            [0.1, 0.1],
            [0, 0.1],
            [0, 0],
        ]);
        const res = analyzeReturns([closedPath(square(100)), speck], cfg);
        expect(res.contours).toHaveLength(1);
    });
});

describe('buildReturnsNestSvg', () => {
    it('emits FACES + RETURNS groups with one rectangle per welded strip', () => {
        const analysis = analyzeReturns(
            [closedPath(square(100)), closedPath(circle(50, 300, 50))],
            cfg,
        );
        const svg = buildReturnsNestSvg({
            analysis,
            returnDepthMm: 50,
            title: 'Test',
        });

        expect(svg).toContain('<g id="FACES">');
        expect(svg).toContain('<g id="RETURNS">');
        // One <rect> per strip (4 square sides + 1 circle loop).
        const rects = svg.match(/<rect /g) ?? [];
        expect(rects).toHaveLength(analysis.stripCount);
        // One face <path> per contour.
        const paths = svg.match(/<path /g) ?? [];
        expect(paths).toHaveLength(analysis.contours.length);
        // True mm output.
        expect(svg).toMatch(/width="\d+mm" height="\d+mm"/);
    });

    it('tiles the return strips below the faces (never inside a face)', () => {
        const analysis = analyzeReturns([closedPath(square(100))], cfg);
        const svg = buildReturnsNestSvg({
            analysis,
            returnDepthMm: 40,
            title: 'Below',
        });
        // Every strip rectangle starts below the faces' max Y (100).
        const ys = [...svg.matchAll(/<rect [^>]*y="([\d.]+)"/g)].map((m) =>
            parseFloat(m[1]),
        );
        expect(ys.length).toBeGreaterThan(0);
        expect(ys.every((y) => y >= 100)).toBe(true);
    });
});
