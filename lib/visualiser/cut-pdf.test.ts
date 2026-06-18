import { describe, it, expect } from 'vitest';
import zlib from 'node:zlib';
import { cutToPdf } from './cut-pdf';
import type { Ring } from './cut-export';

/** Inflate the PDF's content stream so we can inspect the path operators. */
function streamOps(bytes: Uint8Array): { m: number; l: number; h: number } {
    const buf = Buffer.from(bytes);
    const s = buf.toString('latin1');
    const start = s.indexOf('stream');
    const end = s.indexOf('endstream', start);
    const raw = buf.subarray(start + 'stream'.length, end);
    let off = 0;
    while (raw[off] === 0x0d || raw[off] === 0x0a) off++;
    let content: string;
    try {
        content = zlib.inflateSync(raw.subarray(off)).toString('latin1');
    } catch {
        content = raw.toString('latin1');
    }
    return {
        m: (content.match(/\bm\b/g) ?? []).length,
        l: (content.match(/\bl\b/g) ?? []).length,
        h: (content.match(/\bh\b/g) ?? []).length,
    };
}

describe('cutToPdf', () => {
    it('draws each ring as ONE connected closed path (not separate segments)', () => {
        // A triangle: one moveto, two linetos, one closepath — a single cuttable
        // contour. The old per-segment draw would emit three separate movetos.
        const tri: Ring = [[0, 0], [100, 200], [200, 0]];
        const ops = streamOps(cutToPdf({ cut: [tri] }));
        expect(ops.m).toBe(1);
        expect(ops.l).toBe(2);
        expect(ops.h).toBeGreaterThanOrEqual(1);
    });

    it('emits one closed path per ring (letter outline + its counter)', () => {
        const outline: Ring = [[0, 0], [100, 200], [200, 0], [160, 0], [100, 120], [40, 0]];
        const counter: Ring = [[80, 40], [100, 90], [120, 40]];
        const ops = streamOps(cutToPdf({ cut: [outline, counter] }));
        // Two rings → two movetos, two closepaths.
        expect(ops.m).toBe(2);
        expect(ops.h).toBeGreaterThanOrEqual(2);
    });

    it('produces a non-empty PDF', () => {
        const bytes = cutToPdf({ cut: [[[0, 0], [10, 0], [10, 10], [0, 10]]] });
        expect(bytes.length).toBeGreaterThan(200);
        // PDF header.
        expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe('%PDF-');
    });
});
