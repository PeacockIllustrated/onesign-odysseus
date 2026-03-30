/**
 * Quoter Utilities
 * 
 * Pure helper functions for working with quoter types.
 * These are NOT server actions - they are synchronous utilities.
 */

import { PanelLettersV1Input } from './types';

/**
 * Check if an input has any active overrides.
 */
export function hasOverrides(input: PanelLettersV1Input): boolean {
    if (!input.overrides) return false;

    if (input.overrides.markup_percent) return true;

    if (input.overrides.labour_hours) {
        const lh = input.overrides.labour_hours;
        if (lh.router || lh.fabrication || lh.assembly || lh.vinyl || lh.print) {
            return true;
        }
    }

    return false;
}

/**
 * Get effective values after applying overrides.
 */
export function getEffectiveValues(input: PanelLettersV1Input): {
    markup_percent: number;
    labour_hours: {
        router: number;
        fabrication: number;
        assembly: number;
        vinyl: number;
        print: number;
    };
} {
    const effectiveLabour = { ...input.labour_hours };
    let effectiveMarkup = input.markup_percent;

    if (input.overrides?.markup_percent) {
        effectiveMarkup = input.overrides.markup_percent.override;
    }

    if (input.overrides?.labour_hours) {
        const lh = input.overrides.labour_hours;
        if (lh.router) effectiveLabour.router = lh.router.override;
        if (lh.fabrication) effectiveLabour.fabrication = lh.fabrication.override;
        if (lh.assembly) effectiveLabour.assembly = lh.assembly.override;
        if (lh.vinyl) effectiveLabour.vinyl = lh.vinyl.override;
        if (lh.print) effectiveLabour.print = lh.print.override;
    }

    return {
        markup_percent: effectiveMarkup,
        labour_hours: effectiveLabour,
    };
}
