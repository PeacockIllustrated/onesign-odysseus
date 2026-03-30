// lib/production/utils.ts

import type { ProductionJob, JobPriority } from './types';

const PRIORITY_ORDER: Record<JobPriority, number> = {
    urgent: 0,
    high: 1,
    normal: 2,
    low: 3,
};

export function isJobOverdue(dueDate: string | null): boolean {
    if (!dueDate) return false;
    // Compare date-only strings to avoid timezone shifts
    const today = new Date().toISOString().split('T')[0];
    return dueDate < today;
}

export function sortJobsByPriority(jobs: ProductionJob[]): ProductionJob[] {
    return [...jobs].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}

export function formatDueDate(dueDate: string | null): string | null {
    if (!dueDate) return null;
    return new Date(dueDate + 'T12:00:00').toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
    });
}
