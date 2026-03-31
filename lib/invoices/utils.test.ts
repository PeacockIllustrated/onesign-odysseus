import { describe, it, expect } from 'vitest';
import {
    calcLineTotal,
    calcSubtotal,
    calcVat,
    calcTotal,
    formatPence,
    canTransitionTo,
} from './utils';

describe('calcLineTotal', () => {
    it('multiplies quantity by unit price', () => {
        expect(calcLineTotal(3, 5000)).toBe(15000);
    });
    it('returns 0 for zero quantity', () => {
        expect(calcLineTotal(0, 5000)).toBe(0);
    });
    it('returns 0 for zero unit price', () => {
        expect(calcLineTotal(3, 0)).toBe(0);
    });
    it('handles single unit', () => {
        expect(calcLineTotal(1, 12345)).toBe(12345);
    });
});

describe('calcSubtotal', () => {
    it('sums all line totals', () => {
        expect(calcSubtotal([
            { line_total_pence: 10000 },
            { line_total_pence: 5000 },
            { line_total_pence: 2500 },
        ])).toBe(17500);
    });
    it('returns 0 for empty items', () => {
        expect(calcSubtotal([])).toBe(0);
    });
    it('handles single item', () => {
        expect(calcSubtotal([{ line_total_pence: 99999 }])).toBe(99999);
    });
});

describe('calcVat', () => {
    it('calculates 20% VAT', () => {
        expect(calcVat(10000, 20)).toBe(2000);
    });
    it('rounds to nearest penny', () => {
        expect(calcVat(3333, 20)).toBe(667);
    });
    it('returns 0 for 0% VAT rate', () => {
        expect(calcVat(10000, 0)).toBe(0);
    });
    it('handles large subtotals', () => {
        expect(calcVat(1000000, 20)).toBe(200000);
    });
});

describe('calcTotal', () => {
    it('adds subtotal and VAT', () => {
        expect(calcTotal(10000, 2000)).toBe(12000);
    });
    it('returns subtotal when VAT is zero', () => {
        expect(calcTotal(10000, 0)).toBe(10000);
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
    it('allows draft -> sent', () => {
        expect(canTransitionTo('draft', 'sent')).toBe(true);
    });
    it('allows draft -> cancelled', () => {
        expect(canTransitionTo('draft', 'cancelled')).toBe(true);
    });
    it('rejects draft -> paid', () => {
        expect(canTransitionTo('draft', 'paid')).toBe(false);
    });
    it('allows sent -> paid', () => {
        expect(canTransitionTo('sent', 'paid')).toBe(true);
    });
    it('allows sent -> overdue', () => {
        expect(canTransitionTo('sent', 'overdue')).toBe(true);
    });
    it('allows sent -> cancelled', () => {
        expect(canTransitionTo('sent', 'cancelled')).toBe(true);
    });
    it('rejects paid -> any', () => {
        expect(canTransitionTo('paid', 'draft')).toBe(false);
        expect(canTransitionTo('paid', 'cancelled')).toBe(false);
        expect(canTransitionTo('paid', 'overdue')).toBe(false);
    });
    it('allows overdue -> paid', () => {
        expect(canTransitionTo('overdue', 'paid')).toBe(true);
    });
    it('allows overdue -> cancelled', () => {
        expect(canTransitionTo('overdue', 'cancelled')).toBe(true);
    });
    it('rejects overdue -> draft', () => {
        expect(canTransitionTo('overdue', 'draft')).toBe(false);
    });
    it('allows cancelled -> draft (reopen)', () => {
        expect(canTransitionTo('cancelled', 'draft')).toBe(true);
    });
    it('rejects cancelled -> sent', () => {
        expect(canTransitionTo('cancelled', 'sent')).toBe(false);
    });
});
