// lib/production/utils.test.ts
import { describe, it, expect } from 'vitest';
import { isJobOverdue, sortJobsByPriority, formatDueDate } from './utils';
import type { ProductionJob } from './types';

describe('isJobOverdue', () => {
    it('returns false for null due date', () => {
        expect(isJobOverdue(null)).toBe(false);
    });

    it('returns true for a date in the past', () => {
        expect(isJobOverdue('2020-01-01')).toBe(true);
    });

    it('returns false for a date in the future', () => {
        expect(isJobOverdue('2099-12-31')).toBe(false);
    });
});

describe('sortJobsByPriority', () => {
    const makeJob = (priority: ProductionJob['priority'], id: string) =>
        ({ id, priority } as ProductionJob);

    it('sorts urgent → high → normal → low', () => {
        const jobs = [
            makeJob('low', 'a'),
            makeJob('normal', 'b'),
            makeJob('high', 'c'),
            makeJob('urgent', 'd'),
        ];
        const result = sortJobsByPriority(jobs);
        expect(result.map(j => j.priority)).toEqual(['urgent', 'high', 'normal', 'low']);
    });

    it('does not mutate the original array', () => {
        const jobs = [makeJob('low', 'a'), makeJob('urgent', 'b')];
        sortJobsByPriority(jobs);
        expect(jobs[0].priority).toBe('low');
    });
});

describe('formatDueDate', () => {
    it('returns null for null input', () => {
        expect(formatDueDate(null)).toBeNull();
    });

    it('formats as "15 Jan"', () => {
        expect(formatDueDate('2026-01-15')).toBe('15 Jan');
    });
});
