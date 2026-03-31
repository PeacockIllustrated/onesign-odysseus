import { describe, it, expect } from 'vitest';
import {
    calcLineTotal,
    calcPoTotal,
    formatPence,
    canTransitionTo,
} from './utils';

describe('calcLineTotal', () => {
    it('multiplies quantity by unit cost', () => {
        expect(calcLineTotal(3, 5000)).toBe(15000);
    });
    it('returns 0 for zero quantity', () => {
        expect(calcLineTotal(0, 5000)).toBe(0);
    });
    it('returns 0 for zero unit cost', () => {
        expect(calcLineTotal(3, 0)).toBe(0);
    });
    it('handles single unit', () => {
        expect(calcLineTotal(1, 12345)).toBe(12345);
    });
});

describe('calcPoTotal', () => {
    it('sums all line totals', () => {
        expect(calcPoTotal([
            { line_total_pence: 10000 },
            { line_total_pence: 5000 },
            { line_total_pence: 2500 },
        ])).toBe(17500);
    });
    it('returns 0 for empty items', () => {
        expect(calcPoTotal([])).toBe(0);
    });
    it('handles single item', () => {
        expect(calcPoTotal([{ line_total_pence: 99999 }])).toBe(99999);
    });
});

describe('formatPence', () => {
    it('formats pence as GBP string', () => {
        expect(formatPence(15050)).toBe('£150.50');
    });
    it('formats zero', () => {
        expect(formatPence(0)).toBe('£0.00');
    });
    it('formats whole pounds', () => {
        expect(formatPence(100000)).toBe('£1,000.00');
    });
});

describe('canTransitionTo', () => {
    it('allows draft → sent', () => {
        expect(canTransitionTo('draft', 'sent')).toBe(true);
    });
    it('allows draft → cancelled', () => {
        expect(canTransitionTo('draft', 'cancelled')).toBe(true);
    });
    it('rejects draft → completed', () => {
        expect(canTransitionTo('draft', 'completed')).toBe(false);
    });
    it('allows sent → acknowledged', () => {
        expect(canTransitionTo('sent', 'acknowledged')).toBe(true);
    });
    it('allows sent → cancelled', () => {
        expect(canTransitionTo('sent', 'cancelled')).toBe(true);
    });
    it('allows acknowledged → completed', () => {
        expect(canTransitionTo('acknowledged', 'completed')).toBe(true);
    });
    it('allows cancelled → draft (reopen)', () => {
        expect(canTransitionTo('cancelled', 'draft')).toBe(true);
    });
    it('rejects completed → any', () => {
        expect(canTransitionTo('completed', 'draft')).toBe(false);
        expect(canTransitionTo('completed', 'cancelled')).toBe(false);
    });
});
