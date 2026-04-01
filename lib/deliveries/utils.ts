import type { DeliveryStatus, PodStatus } from './types';

export const DELIVERY_STATUS_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
    scheduled:  ['in_transit', 'failed'],
    in_transit: ['delivered', 'failed'],
    delivered:  [],
    failed:     ['scheduled'],
};

export function canTransitionTo(current: DeliveryStatus, next: DeliveryStatus): boolean {
    return DELIVERY_STATUS_TRANSITIONS[current].includes(next);
}

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
    scheduled:  'Scheduled',
    in_transit: 'In Transit',
    delivered:  'Delivered',
    failed:     'Failed',
};

export const DELIVERY_STATUS_COLORS: Record<DeliveryStatus, string> = {
    scheduled:  'text-blue-700 bg-blue-50',
    in_transit: 'text-amber-700 bg-amber-50',
    delivered:  'text-green-700 bg-green-50',
    failed:     'text-red-700 bg-red-50',
};

export const POD_STATUS_LABELS: Record<PodStatus, string> = {
    pending: 'Pending',
    signed:  'Signed',
    refused: 'Refused',
};

export const POD_STATUS_COLORS: Record<PodStatus, string> = {
    pending: 'text-neutral-600 bg-neutral-100',
    signed:  'text-green-700 bg-green-50',
    refused: 'text-red-700 bg-red-50',
};

export function formatDeliveryDate(dateStr: string): string {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

export function isDeliveryOverdue(scheduledDate: string, status: DeliveryStatus): boolean {
    if (status === 'delivered' || status === 'failed') return false;
    const today = new Date().toISOString().split('T')[0];
    return scheduledDate < today;
}
