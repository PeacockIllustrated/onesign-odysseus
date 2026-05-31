import { describe, it, expect } from 'vitest';
import {
    backshopStatus,
    normaliseChecks,
    stagesForFeatures,
    checksForFeatures,
    stagesForChecks,
    elementsForChecks,
} from './types';

describe('backshopStatus', () => {
    it('is queued when nothing is ticked (or there are no stages)', () => {
        expect(backshopStatus({ designed: false, cut: false })).toBe('queued');
        expect(backshopStatus({})).toBe('queued');
        expect(backshopStatus(null)).toBe('queued');
    });

    it('is in_progress when some but not all are ticked', () => {
        expect(backshopStatus({ designed: true, cut: false })).toBe(
            'in_progress',
        );
    });

    it('is ready only when every present stage is ticked', () => {
        expect(backshopStatus({ designed: true, cut: true })).toBe('ready');
        expect(
            backshopStatus({ designed: true, cut: true, vinyl: false }),
        ).toBe('in_progress');
    });
});

describe('contextual stages', () => {
    it('base set has no feature stages', () => {
        const keys = stagesForFeatures({}).map((s) => s.key);
        expect(keys).toEqual(['designed', 'cut', 'painted', 'assembled']);
    });

    it('adds only the matching contextual stages, in catalog order', () => {
        const keys = stagesForFeatures({
            pushThrough: true,
            illumination: true,
        }).map((s) => s.key);
        // push-through sits before painted; illumination after.
        expect(keys).toEqual([
            'designed',
            'cut',
            'pushthrough',
            'painted',
            'illumination',
            'assembled',
        ]);
    });

    it('builds all-false checks for the applicable stages', () => {
        const checks = checksForFeatures({ standoff: true, vinyl: true });
        expect(checks).toEqual({
            designed: false,
            cut: false,
            vinyl: false,
            painted: false,
            standoff: false,
            assembled: false,
        });
    });

    it('elementsForChecks lists only contextual construction, in order', () => {
        expect(
            elementsForChecks({
                designed: true,
                cut: false,
                pushthrough: false,
                painted: false,
                illumination: false,
                assembled: false,
            }),
        ).toEqual(['Push-through acrylic', 'Illuminated']);
        // Base-only build has no distinguishing elements.
        expect(
            elementsForChecks({ designed: false, cut: false }),
        ).toEqual([]);
    });

    it('stagesForChecks reflects the keys an item carries, in order', () => {
        const keys = stagesForChecks({
            assembled: false,
            designed: true,
            standoff: false,
            cut: true,
            painted: false,
        }).map((s) => s.key);
        expect(keys).toEqual([
            'designed',
            'cut',
            'painted',
            'standoff',
            'assembled',
        ]);
    });
});

describe('normaliseChecks', () => {
    it('coerces values to boolean and keeps the keys', () => {
        expect(
            normaliseChecks({ designed: 1, cut: 0 } as never),
        ).toEqual({ designed: true, cut: false });
        expect(normaliseChecks(null)).toEqual({});
    });
});
