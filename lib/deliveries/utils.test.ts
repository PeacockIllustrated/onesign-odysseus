import { describe, it, expect, vi } from 'vitest';
import {
    canTransitionTo,
    formatDeliveryDate,
    isDeliveryOverdue,
} from './utils';

describe('canTransitionTo', () => {
    // Valid transitions
    it('allows scheduled -> in_transit', () => {
        expect(canTransitionTo('scheduled', 'in_transit')).toBe(true);
    });
    it('allows scheduled -> failed', () => {
        expect(canTransitionTo('scheduled', 'failed')).toBe(true);
    });
    it('allows in_transit -> delivered', () => {
        expect(canTransitionTo('in_transit', 'delivered')).toBe(true);
    });
    it('allows in_transit -> failed', () => {
        expect(canTransitionTo('in_transit', 'failed')).toBe(true);
    });
    it('allows failed -> scheduled (reschedule)', () => {
        expect(canTransitionTo('failed', 'scheduled')).toBe(true);
    });

    // Invalid transitions
    it('rejects scheduled -> delivered directly', () => {
        expect(canTransitionTo('scheduled', 'delivered')).toBe(false);
    });
    it('rejects delivered -> any', () => {
        expect(canTransitionTo('delivered', 'scheduled')).toBe(false);
        expect(canTransitionTo('delivered', 'in_transit')).toBe(false);
        expect(canTransitionTo('delivered', 'failed')).toBe(false);
    });
    it('rejects in_transit -> scheduled', () => {
        expect(canTransitionTo('in_transit', 'scheduled')).toBe(false);
    });
    it('rejects failed -> in_transit', () => {
        expect(canTransitionTo('failed', 'in_transit')).toBe(false);
    });
    it('rejects failed -> delivered', () => {
        expect(canTransitionTo('failed', 'delivered')).toBe(false);
    });
    it('rejects same-state transitions', () => {
        expect(canTransitionTo('scheduled', 'scheduled')).toBe(false);
        expect(canTransitionTo('in_transit', 'in_transit')).toBe(false);
        expect(canTransitionTo('delivered', 'delivered')).toBe(false);
        expect(canTransitionTo('failed', 'failed')).toBe(false);
    });
});

describe('formatDeliveryDate', () => {
    it('formats a standard date in en-GB', () => {
        expect(formatDeliveryDate('2026-04-01')).toBe('01 Apr 2026');
    });
    it('formats a date in January', () => {
        expect(formatDeliveryDate('2026-01-15')).toBe('15 Jan 2026');
    });
    it('formats a date in December', () => {
        expect(formatDeliveryDate('2025-12-25')).toBe('25 Dec 2025');
    });
    it('handles single-digit day', () => {
        expect(formatDeliveryDate('2026-03-05')).toBe('05 Mar 2026');
    });
    it('handles end of month', () => {
        expect(formatDeliveryDate('2026-02-28')).toBe('28 Feb 2026');
    });
});

describe('isDeliveryOverdue', () => {
    it('returns true for past date with scheduled status', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-01T12:00:00Z'));
        expect(isDeliveryOverdue('2026-03-30', 'scheduled')).toBe(true);
        vi.useRealTimers();
    });
    it('returns true for past date with in_transit status', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-01T12:00:00Z'));
        expect(isDeliveryOverdue('2026-03-30', 'in_transit')).toBe(true);
        vi.useRealTimers();
    });
    it('returns false for past date with delivered status', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-01T12:00:00Z'));
        expect(isDeliveryOverdue('2026-03-30', 'delivered')).toBe(false);
        vi.useRealTimers();
    });
    it('returns false for past date with failed status', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-01T12:00:00Z'));
        expect(isDeliveryOverdue('2026-03-30', 'failed')).toBe(false);
        vi.useRealTimers();
    });
    it('returns false for future date', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-01T12:00:00Z'));
        expect(isDeliveryOverdue('2026-04-10', 'scheduled')).toBe(false);
        vi.useRealTimers();
    });
    it('returns false for today', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-01T12:00:00Z'));
        expect(isDeliveryOverdue('2026-04-01', 'scheduled')).toBe(false);
        vi.useRealTimers();
    });
});
