import type { PoStatus } from './types';

export function calcLineTotal(quantity: number, unitCostPence: number): number {
    return quantity * unitCostPence;
}

export function calcPoTotal(items: Array<{ line_total_pence: number }>): number {
    return items.reduce((sum, item) => sum + item.line_total_pence, 0);
}

export function formatPence(pence: number): string {
    return new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: 'GBP',
    }).format(pence / 100);
}

export const PO_STATUS_TRANSITIONS: Record<PoStatus, PoStatus[]> = {
    draft:        ['sent', 'cancelled'],
    sent:         ['acknowledged', 'cancelled'],
    acknowledged: ['completed', 'cancelled'],
    completed:    [],
    cancelled:    ['draft'],
};

export function canTransitionTo(current: PoStatus, next: PoStatus): boolean {
    return PO_STATUS_TRANSITIONS[current].includes(next);
}

export const PO_STATUS_LABELS: Record<PoStatus, string> = {
    draft:        'Draft',
    sent:         'Sent',
    acknowledged: 'Acknowledged',
    completed:    'Completed',
    cancelled:    'Cancelled',
};

export const PO_STATUS_COLORS: Record<PoStatus, string> = {
    draft:        'text-neutral-600 bg-neutral-100',
    sent:         'text-blue-700 bg-blue-50',
    acknowledged: 'text-amber-700 bg-amber-50',
    completed:    'text-green-700 bg-green-50',
    cancelled:    'text-red-700 bg-red-50',
};
