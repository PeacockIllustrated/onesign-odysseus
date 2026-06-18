import { describe, it, expect } from 'vitest';
import {
    buildFilledSvg,
    buildRectSvg,
    luminance,
    contrastingBackground,
} from './piece-display';
import type { FlatPath } from './types';

function rect(x0: number, y0: number, x1: number, y1: number): FlatPath {
    return {
        closed: true,
        points: [
            [x0, y0],
            [x1, y0],
            [x1, y1],
            [x0, y1],
            [x0, y0],
        ],
    };
}

describe('luminance + contrastingBackground', () => {
    it('reads white as light and black as dark', () => {
        expect(luminance('#ffffff')).toBeGreaterThan(0.9);
        expect(luminance('#000000')).toBeLessThan(0.1);
    });
    it('puts a light fill on a dark background and vice-versa', () => {
        expect(contrastingBackground('#ffffff')).toBe('#262b30');
        expect(contrastingBackground('#101010')).toBe('#f4f6f7');
    });
});

describe('buildFilledSvg', () => {
    it('fills shapes in their material colour and reports the mm size', () => {
        const out = buildFilledSvg({
            layers: [{ pieces: [{ path: rect(0, 0, 100, 50) }], fill: '#ff8800' }],
        });
        expect(out.svg).toContain('fill="#ff8800"');
        expect(out.svg).toContain('fill-rule="evenodd"');
        // no hairline-only stroke styling — it's a filled drawing
        expect(out.svg).not.toContain('fill="none"');
        expect(out.widthMm).toBe(100);
        expect(out.heightMm).toBe(50);
        // true mm units
        expect(out.svg).toMatch(/width="\d+(\.\d+)?mm"/);
    });

    it('punches counters out with even-odd (a hole)', () => {
        const out = buildFilledSvg({
            layers: [
                {
                    pieces: [{ path: rect(0, 0, 100, 100), holes: [rect(30, 30, 70, 70)] }],
                    fill: '#222222',
                },
            ],
        });
        // outer + hole in one compound path
        const d = out.svg.match(/d="([^"]+)"/)?.[1] ?? '';
        expect((d.match(/Z/g) ?? []).length).toBe(2);
    });

    it('auto-picks a contrasting background for a light fill', () => {
        const out = buildFilledSvg({
            layers: [{ pieces: [{ path: rect(0, 0, 10, 10) }], fill: '#ffffff' }],
        });
        expect(out.svg).toContain('#262b30'); // dark bg so white reads on paper
    });

    it('honours an explicit background (the panel colour for a face)', () => {
        const out = buildFilledSvg({
            layers: [{ pieces: [{ path: rect(0, 0, 10, 10) }], fill: '#ffffff' }],
            background: '#1a1f23',
        });
        expect(out.svg).toContain('#1a1f23');
    });
});

describe('buildRectSvg', () => {
    it('draws a single filled rectangle at the requested mm size', () => {
        const out = buildRectSvg({ widthMm: 800, heightMm: 300 });
        expect(out.widthMm).toBe(800);
        expect(out.heightMm).toBe(300);
        expect(out.svg).toContain('<rect');
    });
});
