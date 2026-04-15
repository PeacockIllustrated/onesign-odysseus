/**
 * Shop-floor stepper helpers — pure functions used by the guided check UI.
 */

export interface SubItemForStage {
    id: string;
    label: string;
    target_stage_id: string | null;
    production_signed_off_at: string | null;
}

/**
 * Given the list of sub-items already filtered to the current stage,
 * return the array index of the next sub-item that still needs production
 * sign-off. Returns null when every sub-item is signed off (or the list
 * is empty).
 */
export function computeNextSubItem(items: SubItemForStage[]): number | null {
    for (let i = 0; i < items.length; i++) {
        if (!items[i].production_signed_off_at) return i;
    }
    return null;
}
