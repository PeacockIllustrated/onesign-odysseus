import { describe, it, expect } from 'vitest';
import { placeLayerPaths } from './compose';
import type { FlatPath } from './types';

const square = (): FlatPath[] => [
    {
        closed: true,
        points: [
            [10, 10],
            [20, 10],
            [20, 20],
            [10, 20],
            [10, 10],
        ],
    },
];

describe('placeLayerPaths', () => {
    it('moves a layer so its bbox corner lands at (xMm, yMm)', () => {
        const out = placeLayerPaths(square(), 10, 10, {
            xMm: 100,
            yMm: 50,
            scale: 1,
        });
        // (10,10) is the source min → maps to the target (100,50).
        expect(out[0].points[0]).toEqual([100, 50]);
        // (20,20) is 10×10 across → (110,60).
        expect(out[0].points[2]).toEqual([110, 60]);
    });

    it('scales about the layer origin', () => {
        const out = placeLayerPaths(square(), 10, 10, {
            xMm: 0,
            yMm: 0,
            scale: 2,
        });
        expect(out[0].points[0]).toEqual([0, 0]);
        expect(out[0].points[2]).toEqual([20, 20]); // 10×10 ×2
    });

    it('preserves closedness and point count', () => {
        const out = placeLayerPaths(square(), 10, 10, {
            xMm: 5,
            yMm: 5,
            scale: 1,
        });
        expect(out[0].closed).toBe(true);
        expect(out[0].points.length).toBe(5);
    });
});
