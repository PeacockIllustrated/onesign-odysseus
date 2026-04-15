/**
 * Pure helpers for artwork variants. Kept dependency-free so Vitest can
 * exercise them without the Supabase / Next stack.
 */

import type { ArtworkVariant } from './variant-types';

export interface VariantSubItemInput {
    label: string;
    sort_order: number;
    name: string | null;
    material: string | null;
    application_method: string | null;
    finish: string | null;
    width_mm: number | null;
    height_mm: number | null;
    returns_mm: number | null;
    quantity: number;
    notes: string | null;
}

/**
 * Field-for-field translate a client-chosen variant into the shape the
 * production sub-item insert expects. Keeps the "spawn production from
 * visual" server action trivial.
 */
export function mapVariantToSubItemInput(
    variant: ArtworkVariant
): VariantSubItemInput {
    return {
        label: 'A',
        sort_order: 0,
        name: variant.name,
        material: variant.material,
        application_method: variant.application_method,
        finish: variant.finish,
        width_mm: variant.width_mm,
        height_mm: variant.height_mm,
        returns_mm: variant.returns_mm,
        quantity: 1,
        notes: variant.notes,
    };
}
