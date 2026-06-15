import { describe, it, expect } from 'vitest';
import { SYMBOLS, driverBlock, WIRING_LEGEND } from './wiring-symbols';

describe('wiring symbols', () => {
    it('defines the core IEC-style glyphs', () => {
        expect(Object.keys(SYMBOLS).sort()).toEqual([
            'earth',
            'fuse',
            'junction',
            'mains',
            'terminal',
        ]);
        // earth = stem + three bars
        expect(SYMBOLS.earth.prims.filter((p) => p.k === 'line')).toHaveLength(4);
        // junction = a filled dot
        expect(SYMBOLS.junction.prims[0]).toMatchObject({ k: 'circle', fill: true });
        // terminal = an open circle
        expect(SYMBOLS.terminal.prims[0]).toMatchObject({ k: 'circle' });
        expect(SYMBOLS.terminal.prims[0]).not.toMatchObject({ fill: true });
        // fuse = a rect with a line through it
        expect(SYMBOLS.fuse.prims.some((p) => p.k === 'rect')).toBe(true);
        expect(SYMBOLS.fuse.prims.some((p) => p.k === 'line')).toBe(true);
    });

    it('driverBlock spaces N output terminals across the block', () => {
        const b = driverBlock(40, 20, 3);
        expect(b.outputXs).toHaveLength(3);
        expect(
            b.outputXs.every((x, i) => x > 0 && x < 40 && (i === 0 || x > b.outputXs[i - 1])),
        ).toBe(true);
        // never zero outputs
        expect(driverBlock(40, 20, 0).outputXs).toHaveLength(1);
    });

    it('legend covers every drawn element', () => {
        const names = WIRING_LEGEND.map((l) => l.name);
        for (const n of ['driver', 'terminal', 'conductor', 'junction', 'mains', 'fuse', 'earth']) {
            expect(names).toContain(n);
        }
    });
});
