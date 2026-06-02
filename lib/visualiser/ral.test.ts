import { describe, it, expect } from 'vitest';
import {
    RAL_CLASSIC,
    nearestRal,
    deltaE2000,
    srgbToLab,
    ralByCode,
} from './ral';

describe('deltaE2000 — reference vectors (Sharma, Wu & Dalal 2005)', () => {
    // A subset of the canonical CIEDE2000 test pairs. Each is [Lab1, Lab2, dE].
    const cases: Array<[number[], number[], number]> = [
        [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
        [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
        [[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
        [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0],
        [[50, 2.49, -0.001], [50, -2.49, 0.0009], 7.1792],
        [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
        [[63.0109, -31.0961, -5.8663], [62.8187, -29.7946, -4.0864], 1.263],
        [[35.0831, -44.1164, 3.7933], [35.0232, -40.0716, 1.5901], 1.8645],
        [[22.7233, 20.0904, -46.694], [23.0331, 14.973, -42.5619], 2.0373],
    ];
    for (const [l1, l2, expected] of cases) {
        it(`ΔE([${l1}],[${l2}]) ≈ ${expected}`, () => {
            expect(
                deltaE2000(
                    l1 as [number, number, number],
                    l2 as [number, number, number],
                ),
            ).toBeCloseTo(expected, 1);
        });
    }
});

describe('nearestRal (perceptual)', () => {
    it('an exact RAL hex matches itself (ΔE 0)', () => {
        for (const code of ['RAL 9016', 'RAL 5010', 'RAL 6024', 'RAL 3020']) {
            const ral = RAL_CLASSIC.find((c) => c.code === code)!;
            expect(nearestRal(ral.hex).code).toBe(code);
        }
    });

    it('a near-identical hex still snaps to the right RAL', () => {
        const tw = RAL_CLASSIC.find((c) => c.code === 'RAL 9016')!; // traffic white
        // nudge a couple of levels — should still be traffic white
        expect(nearestRal('#f5f9f3').code).toBe('RAL 9016');
        expect(nearestRal(tw.hex)).toBe(
            RAL_CLASSIC.find((c) => c.code === 'RAL 9016'),
        );
    });

    it('srgbToLab puts white near L=100 and black near L=0', () => {
        expect(srgbToLab('#ffffff')[0]).toBeCloseTo(100, 0);
        expect(srgbToLab('#000000')[0]).toBeCloseTo(0, 0);
    });
});

describe('ralByCode', () => {
    it('finds a code regardless of spacing/case', () => {
        expect(ralByCode('ral9016')?.code).toBe('RAL 9016');
        expect(ralByCode('RAL 9016')?.code).toBe('RAL 9016');
        expect(ralByCode('nope')).toBeNull();
    });
});
