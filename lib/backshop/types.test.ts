import { describe, it, expect } from 'vitest';
import {
    backshopStatus,
    normaliseChecks,
    EMPTY_CHECKS,
    BACKSHOP_STAGES,
} from './types';

describe('backshopStatus', () => {
    it('is queued when nothing is ticked', () => {
        expect(backshopStatus(EMPTY_CHECKS)).toBe('queued');
        expect(backshopStatus(null)).toBe('queued');
        expect(backshopStatus(undefined)).toBe('queued');
        expect(backshopStatus({})).toBe('queued');
    });

    it('is in_progress when some but not all are ticked', () => {
        expect(backshopStatus({ designed: true })).toBe('in_progress');
        expect(
            backshopStatus({ designed: true, cut: true, painted: true }),
        ).toBe('in_progress');
    });

    it('is ready only when every stage is ticked', () => {
        expect(
            backshopStatus({
                designed: true,
                cut: true,
                painted: true,
                assembled: true,
            }),
        ).toBe('ready');
    });

    it('ignores unknown keys', () => {
        // A stray key must not count toward "ready".
        expect(
            backshopStatus({ designed: true, bogus: true } as never),
        ).toBe('in_progress');
    });
});

describe('normaliseChecks', () => {
    it('fills missing stages with false and coerces truthiness', () => {
        expect(normaliseChecks({ designed: true })).toEqual({
            designed: true,
            cut: false,
            painted: false,
            assembled: false,
        });
        expect(normaliseChecks(null)).toEqual(EMPTY_CHECKS);
    });

    it('covers exactly the declared stage keys', () => {
        expect(Object.keys(normaliseChecks(null)).sort()).toEqual(
            BACKSHOP_STAGES.map((s) => s.key).sort(),
        );
    });
});
