/**
 * Shop-floor stepper helpers — pure functions used by the guided check UI.
 */

export interface SubItemForStage {
    id: string;
    label: string;
    target_stage_id: string | null;
    as_built_signed_off_at: string | null;
}

/**
 * Given the list of sub-items already filtered to the current stage,
 * return the array index of the next sub-item that still needs its as-built
 * QC sign-off. Returns null when every sub-item is signed off (or the list
 * is empty).
 */
export function computeNextSubItem(items: SubItemForStage[]): number | null {
    for (let i = 0; i < items.length; i++) {
        if (!items[i].as_built_signed_off_at) return i;
    }
    return null;
}
