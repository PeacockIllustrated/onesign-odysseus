import { describe, it, expect } from 'vitest';
import {
    cycleView,
    keyToTvAction,
    fitScale,
    MAX_FIT_SCALE,
    TV_VIEWS,
    type TvView,
} from './tv';

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

describe('fitting past the old legibility floor', () => {
    it('keeps shrinking instead of hiding anything', () => {
        // The board used to stop here and collapse cards to one line, rotating
        // the detail through them. It now just gets smaller, because a small
        // board that shows Friday beats a big one that does not.
        expect(fitScale(3000, 900)).toBeCloseTo(0.3);
        expect(fitScale(6000, 900)).toBeCloseTo(0.15);
    });

    it('has no lower bound at all', () => {
        expect(fitScale(100000, 900)).toBeGreaterThan(0);
        expect(fitScale(100000, 900)).toBeLessThan(0.01);
    });
});
