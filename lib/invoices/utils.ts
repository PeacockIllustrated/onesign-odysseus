import type { InvoiceStatus } from './types';

export function calcLineTotal(quantity: number, unitPricePence: number): number {
    return quantity * unitPricePence;
}

export function calcSubtotal(items: Array<{ line_total_pence: number }>): number {
    return items.reduce((sum, item) => sum + item.line_total_pence, 0);
}

export function calcVat(subtotalPence: number, vatRate: number): number {
    return Math.round(subtotalPence * (vatRate / 100));
}

export function calcTotal(subtotalPence: number, vatPence: number): number {
    return subtotalPence + vatPence;
}

export function formatPence(pence: number): string {
    return new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: 'GBP',
    }).format(pence / 100);
}

export const INVOICE_STATUS_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
    draft:     ['sent', 'cancelled'],
    sent:      ['paid', 'overdue', 'cancelled'],
    paid:      [],
    overdue:   ['paid', 'cancelled'],
    cancelled: ['draft'],
};

export function canTransitionTo(current: InvoiceStatus, next: InvoiceStatus): boolean {
    return INVOICE_STATUS_TRANSITIONS[current].includes(next);
}

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
    draft:     'Draft',
    sent:      'Sent',
    paid:      'Paid',
    overdue:   'Overdue',
    cancelled: 'Cancelled',
};

export const INVOICE_STATUS_COLORS: Record<InvoiceStatus, string> = {
    draft:     'text-neutral-600 bg-neutral-100',
    sent:      'text-blue-700 bg-blue-50',
    paid:      'text-green-700 bg-green-50',
    overdue:   'text-red-700 bg-red-50',
    cancelled: 'text-neutral-500 bg-neutral-100',
};
