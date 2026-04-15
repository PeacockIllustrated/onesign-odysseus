/**
 * Utility functions for Artwork Compliance System
 */

import {
    DIMENSION_TOLERANCE_MM,
    DimensionCheckResult,
    ComponentStatus,
    ArtworkJobStatus,
    ArtworkComponent,
} from './types';

// =============================================================================
// DIMENSION TOLERANCE
// =============================================================================

/**
 * Check dimension tolerance between spec and measured values
 */
export function checkDimensionTolerance(
    specWidth: number,
    specHeight: number,
    measuredWidth: number,
    measuredHeight: number,
    toleranceMm: number = DIMENSION_TOLERANCE_MM
): DimensionCheckResult {
    const widthDev = measuredWidth - specWidth;
    const heightDev = measuredHeight - specHeight;
    const widthOk = Math.abs(widthDev) <= toleranceMm;
    const heightOk = Math.abs(heightDev) <= toleranceMm;
    const pass = widthOk && heightOk;

    return {
        width_deviation_mm: widthDev,
        height_deviation_mm: heightDev,
        width_within_tolerance: widthOk,
        height_within_tolerance: heightOk,
        overall_pass: pass,
        flag: pass ? 'within_tolerance' : 'out_of_tolerance',
    };
}

/**
 * Generate item label from sort_order: 0 → 'A', 1 → 'B', 2 → 'C', etc.
 */
export function getItemLabel(sortOrder: number): string {
    return String.fromCharCode(65 + sortOrder);
}

// =============================================================================
// FORMAT UTILITIES
// =============================================================================

/**
 * Format dimensions for display: "2990 x 1395mm"
 */
export function formatDimensions(width: number, height: number): string {
    return `${width} x ${height}mm`;
}

/**
 * Format dimensions with returns: "2990 x 1395mm (returns 80mm)"
 */
export function formatDimensionWithReturns(
    width: number,
    height: number,
    returns: number | null
): string {
    const base = formatDimensions(width, height);
    if (returns != null && returns > 0) {
        return `${base} (returns ${returns}mm)`;
    }
    return base;
}

/**
 * Format date for display
 */
export function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    }).format(date);
}

/**
 * Format datetime for display
 */
export function formatDateTime(dateString: string): string {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

// =============================================================================
// STATUS UTILITIES
// =============================================================================

type ChipVariant = 'default' | 'draft' | 'review' | 'approved' | 'scheduled' | 'done' | 'active' | 'paused';

const componentStatusLabels: Record<ComponentStatus, string> = {
    pending_design: 'pending design',
    design_submitted: 'design submitted',
    design_signed_off: 'design signed off',
    in_production: 'in production',
    production_complete: 'production complete',
    flagged: 'flagged',
};

const componentStatusVariants: Record<ComponentStatus, ChipVariant> = {
    pending_design: 'draft',
    design_submitted: 'review',
    design_signed_off: 'approved',
    in_production: 'scheduled',
    production_complete: 'done',
    flagged: 'paused',
};

export function getComponentStatusLabel(status: ComponentStatus): string {
    return componentStatusLabels[status] || status;
}

export function getComponentStatusVariant(status: ComponentStatus): ChipVariant {
    return componentStatusVariants[status] || 'default';
}

const jobStatusLabels: Record<ArtworkJobStatus, string> = {
    draft: 'draft',
    in_progress: 'in progress',
    design_complete: 'design complete',
    in_production: 'in production',
    completed: 'completed',
};

const jobStatusVariants: Record<ArtworkJobStatus, ChipVariant> = {
    draft: 'draft',
    in_progress: 'review',
    design_complete: 'approved',
    in_production: 'scheduled',
    completed: 'done',
};

export function getJobStatusLabel(status: ArtworkJobStatus): string {
    return jobStatusLabels[status] || status;
}

export function getJobStatusVariant(status: ArtworkJobStatus): ChipVariant {
    return jobStatusVariants[status] || 'default';
}

// =============================================================================
// PROGRESS UTILITIES
// =============================================================================

/**
 * Calculate job progress from component statuses
 */
export function getJobProgress(components: ArtworkComponent[]): {
    designed: number;
    signedOff: number;
    produced: number;
    total: number;
    percentage: number;
} {
    const total = components.length;
    if (total === 0) {
        return { designed: 0, signedOff: 0, produced: 0, total: 0, percentage: 0 };
    }

    const designed = components.filter(
        (c) => c.status !== 'pending_design'
    ).length;

    const signedOff = components.filter((c) =>
        ['design_signed_off', 'in_production', 'production_complete'].includes(c.status)
    ).length;

    const produced = components.filter(
        (c) => c.status === 'production_complete'
    ).length;

    const percentage = Math.round((produced / total) * 100);

    return { designed, signedOff, produced, total, percentage };
}

// =============================================================================
// GATE UTILITIES
// =============================================================================

/**
 * Check if a component's design has been signed off, enabling production
 */
export function canProceedToProduction(component: ArtworkComponent): boolean {
    return component.design_signed_off_at !== null;
}

// =============================================================================
// COMPONENT TYPE LABELS
// =============================================================================

const componentTypeLabels: Record<string, string> = {
    panel: 'panel',
    vinyl: 'vinyl',
    acrylic: 'acrylic',
    push_through: 'push-through',
    dibond: 'dibond',
    aperture_cut: 'aperture cut panel',
    foamex: 'foamex',
    digital_print: 'digital print',
    flat_cut_letters: 'flat-cut letters',
    channel_letters: 'channel letters',
    engraved: 'engraved',
    led_module: 'LED module',
    other: 'other',
};

export function getComponentTypeLabel(type: string): string {
    return componentTypeLabels[type] || type;
}

const lightingTypeLabels: Record<string, string> = {
    backlit: 'backlit',
    halo: 'halo',
    edge_lit: 'edge-lit',
};

export function getLightingTypeLabel(type: string): string {
    return lightingTypeLabels[type] || type;
}

// =============================================================================
// SUB-ITEM LABEL ASSIGNMENT
// =============================================================================

/**
 * Compute the set of release-blocking gaps for an artwork job's components.
 * Each sub-item must be fully signed off (design + production) and routed
 * to a target department. Returns a human-readable list of every gap,
 * naming the offending sub-item + component precisely.
 */
export function computeReleaseGaps(
    components: Array<{
        name: string;
        sub_items: Array<{
            label: string;
            name: string | null;
            design_signed_off_at: string | null;
            production_signed_off_at: string | null;
            target_stage_id: string | null;
        }>;
    }>
): { gaps: string[]; targetStageIds: string[] } {
    const gaps: string[] = [];
    const targetStageIds = new Set<string>();
    for (const comp of components) {
        if (!comp.sub_items || comp.sub_items.length === 0) {
            gaps.push(`"${comp.name}" has no sub-items`);
            continue;
        }
        for (const si of comp.sub_items) {
            const ref = `sub-item ${si.label}${si.name ? ` (${si.name})` : ''} of "${comp.name}"`;
            if (!si.design_signed_off_at) gaps.push(`${ref} — design not signed off`);
            if (!si.production_signed_off_at) gaps.push(`${ref} — production not signed off`);
            if (!si.target_stage_id) gaps.push(`${ref} — no target department`);
            if (si.target_stage_id) targetStageIds.add(si.target_stage_id);
        }
    }
    return { gaps, targetStageIds: Array.from(targetStageIds) };
}

/**
 * Given a list of existing sub-item labels, return the next available letter.
 * Fills gaps first (A, B, D → C). Overflows to AA, AB after Z.
 */
export function nextItemLabel(existing: string[]): string {
    const used = new Set(existing);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (const ch of alphabet) {
        if (!used.has(ch)) return ch;
    }
    for (const a of alphabet) {
        for (const b of alphabet) {
            const two = a + b;
            if (!used.has(two)) return two;
        }
    }
    return 'Z';
}
