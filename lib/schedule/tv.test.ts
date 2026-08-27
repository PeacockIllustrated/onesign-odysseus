import { describe, it, expect } from 'vitest';
import {
    cycleView,
    keyToTvAction,
    spotlightSequence,
    nextSpotlight,
    fitScale,
    needsCondensing,
    MIN_FIT_SCALE,
    MAX_FIT_SCALE,
    TV_VIEWS,
    type TvView,
} from './tv';
import type { FittingJobView, Slot } from './types';

function job(p: Partial<FittingJobView> & { id: string }): FittingJobView {
    return {
        job_ref: p.id,
        org_id: null,
        contact_id: null,
        site_id: null,
        quote_id: null,
        production_job_id: null,
        customer_fallback: p.id,
        quote_ref: null,
        location: null,
        postcode: null,
        latitude: null,
        longitude: null,
        pm_id: null,
        van_id: p.van_id ?? 'van-a',
        scheduled_date: p.scheduled_date ?? '2026-03-02',
        end_date: p.end_date ?? null,
        lane: 'scheduled',
        slot: (p.slot ?? 'AM') as Slot,
        sort_order: p.sort_order ?? 0,
        done: false,
        done_at: null,
        delivery_required: false,
        archived_at: p.archived_at ?? null,
        org_name: null,
        site_name: null,
        site_postcode: null,
        contact_name: null,
        quote_number: null,
        updated_by_name: null,
        ...p,
    } as FittingJobView;
}

describe('cycleView', () => {
    it('walks right through week → month → year', () => {
        expect(cycleView('week', 1)).toBe('month');
        expect(cycleView('month', 1)).toBe('year');
    });

    it('wraps at both ends so a remote can reach every view', () => {
        expect(cycleView('year', 1)).toBe('week');
        expect(cycleView('week', -1)).toBe('year');
    });

    it('walks left as the mirror of right', () => {
        for (const v of TV_VIEWS) {
            expect(cycleView(cycleView(v, 1), -1)).toBe(v);
        }
    });

    it('falls back to week for an unrecognised view', () => {
        expect(cycleView('decade' as TvView, 1)).toBe('week');
    });
});

describe('keyToTvAction', () => {
    it('maps left/right to the view cycle', () => {
        expect(keyToTvAction('ArrowLeft')).toBe('view-prev');
        expect(keyToTvAction('ArrowRight')).toBe('view-next');
    });

    it('maps up/down and channel keys to the period step', () => {
        expect(keyToTvAction('ArrowUp')).toBe('period-prev');
        expect(keyToTvAction('ArrowDown')).toBe('period-next');
        expect(keyToTvAction('PageUp')).toBe('period-prev');
        expect(keyToTvAction('PageDown')).toBe('period-next');
    });

    it('ignores anything else', () => {
        expect(keyToTvAction('a')).toBeNull();
        expect(keyToTvAction('Escape')).toBeNull();
        expect(keyToTvAction(' ')).toBeNull();
    });
});

describe('spotlightSequence', () => {
    const vans = ['van-a', 'van-b'];

    it('reads day, then van across, then slot down', () => {
        const jobs = [
            job({ id: 'tue-b-pm', scheduled_date: '2026-03-03', van_id: 'van-b', slot: 'PM' }),
            job({ id: 'mon-a-pm', scheduled_date: '2026-03-02', van_id: 'van-a', slot: 'PM' }),
            job({ id: 'mon-a-day', scheduled_date: '2026-03-02', van_id: 'van-a', slot: 'DAY' }),
            job({ id: 'mon-b-am', scheduled_date: '2026-03-02', van_id: 'van-b', slot: 'AM' }),
        ];
        expect(spotlightSequence(jobs, vans)).toEqual([
            'mon-a-day',
            'mon-a-pm',
            'mon-b-am',
            'tue-b-pm',
        ]);
    });

    it('skips archived and unscheduled jobs', () => {
        const jobs = [
            job({ id: 'live' }),
            job({ id: 'archived', archived_at: '2026-03-01T00:00:00Z' }),
            job({ id: 'holding', scheduled_date: null, van_id: null }),
        ];
        expect(spotlightSequence(jobs, vans)).toEqual(['live']);
    });

    it('is stable for jobs that tie on every ordering key but id', () => {
        const jobs = [job({ id: 'b' }), job({ id: 'a' })];
        expect(spotlightSequence(jobs, vans)).toEqual(['a', 'b']);
        expect(spotlightSequence(jobs.slice().reverse(), vans)).toEqual(['a', 'b']);
    });

    it('puts jobs on an unknown van last rather than dropping them', () => {
        const jobs = [job({ id: 'ghost', van_id: 'van-z' }), job({ id: 'known', van_id: 'van-a' })];
        expect(spotlightSequence(jobs, vans)).toEqual(['known', 'ghost']);
    });
});

describe('nextSpotlight', () => {
    it('starts at the first job', () => {
        expect(nextSpotlight(['a', 'b'], null)).toBe('a');
    });

    it('advances and wraps', () => {
        expect(nextSpotlight(['a', 'b', 'c'], 'b')).toBe('c');
        expect(nextSpotlight(['a', 'b', 'c'], 'c')).toBe('a');
    });

    it('restarts when the current job has left the board', () => {
        expect(nextSpotlight(['a', 'b'], 'gone')).toBe('a');
    });

    it('drops the spotlight when nothing is left to show', () => {
        expect(nextSpotlight([], 'a')).toBeNull();
    });
});

describe('fitScale', () => {
    it('shrinks to fit', () => {
        expect(fitScale(1000, 500)).toBe(0.5);
    });

    it('grows a quiet board to fill the panel rather than leaving it black', () => {
        expect(fitScale(800, 1000)).toBe(1.25);
    });

    it('caps how far a nearly-empty board is blown up', () => {
        expect(fitScale(100, 1000)).toBe(MAX_FIT_SCALE);
    });

    it('returns 1 for an unmeasured element rather than collapsing it', () => {
        expect(fitScale(0, 800)).toBe(1);
        expect(fitScale(800, 0)).toBe(1);
    });
});

describe('needsCondensing', () => {
    it('condenses only once shrinking would go below the legibility floor', () => {
        expect(needsCondensing(1000, 900)).toBe(false);
        expect(needsCondensing(1000, 300)).toBe(true);
    });

    it('treats the floor itself as still legible', () => {
        expect(needsCondensing(1000, 1000 * MIN_FIT_SCALE)).toBe(false);
    });

    it('keeps fitting past the floor rather than clipping the board', () => {
        // The floor gates condensing, never the scale — a board scaled to 0.3
        // still shows Friday, and a clipped one does not.
        expect(fitScale(3000, 900)).toBeCloseTo(0.3);
        expect(fitScale(3000, 900)).toBeLessThan(MIN_FIT_SCALE);
    });
});
