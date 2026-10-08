/**
 * A priced calculator job, as Odysseus quote lines.
 *
 * Pure, so the rule that matters can be tested without a database: the lines
 * a quote is given multiply out to EXACTLY the calculator's net. Each sign is
 * one generic production line at its "each" price, carrying its tray, aperture
 * and letter sets as sub-items for the artwork skeleton; each extra is a
 * service line at its sell price.
 */

import type { GenericQuoteItemInput, QuoteSubItemInput } from '../types';
import type { PriceBook } from './types';
import { signSpec, type JobResult } from '../engine/panel-letters-v2';

export function buildQuoteLines(priced: JobResult, book: PriceBook, stamp: string): GenericQuoteItemInput[] {
    const lines: GenericQuoteItemInput[] = [];

    for (const { sign, r } of priced.signs) {
        const finish = book.panel_finishes.find((f) => f.id === sign.panel.finish_id);
        const subItems: QuoteSubItemInput[] = [];
        if (sign.panel.width_mm > 0 && sign.panel.height_mm > 0) {
            subItems.push({
                name: 'Tray',
                material: sign.panel.material,
                finish: finish?.name,
                quantity: 1,
                width_mm: sign.panel.width_mm,
                height_mm: sign.panel.height_mm,
                returns_mm: sign.panel.returns_mm,
            });
        }
        if (sign.aperture.on && sign.aperture.width_mm > 0 && sign.aperture.height_mm > 0) {
            subItems.push({
                name: 'Illuminated aperture',
                material: sign.aperture.material,
                quantity: 1,
                width_mm: sign.aperture.width_mm,
                height_mm: sign.aperture.height_mm,
            });
        }
        for (const set of sign.letter_sets) {
            if (!(set.qty > 0)) continue;
            const type = book.letter_types.find((t) => t.id === set.type_id);
            const fin = type?.finishes.find((f) => f.id === set.finish_id);
            subItems.push({
                name: `${type?.name ?? 'Letters'} letters, ${set.height_mm}mm`,
                material: type?.name,
                finish: fin?.name,
                quantity: set.qty,
                height_mm: set.height_mm > 0 ? set.height_mm : null,
                notes: set.illuminated ? 'Illuminated' : undefined,
            });
        }
        const lit = sign.aperture.on || sign.letter_sets.some((s) => s.illuminated && s.qty > 0);

        lines.push({
            part_label: (sign.name || 'Sign').slice(0, 120),
            description: signSpec(sign, book).join('; ').slice(0, 4000) || undefined,
            is_production_work: true,
            width_mm: sign.panel.width_mm > 0 ? sign.panel.width_mm : null,
            height_mm: sign.panel.height_mm > 0 ? sign.panel.height_mm : null,
            returns_mm: sign.panel.returns_mm,
            quantity: r.qty,
            unit_cost_pence: Math.round(r.materials_pence / r.qty),
            unit_price_pence: r.unit_pence,
            lighting: lit ? 'Illuminated' : undefined,
            spec_notes: stamp,
            sub_items: subItems.slice(0, 20),
        });
    }

    for (const e of priced.extras) {
        if (e.line_pence <= 0) continue;
        // Quote lines take whole quantities. A fractional one (half a day's
        // fitting) goes across as one line at its total, with the working in
        // the description, so the money still matches.
        const whole = Number.isInteger(e.qty) && e.qty >= 1;
        lines.push({
            part_label: (e.description || 'Additional item').slice(0, 120),
            description: whole ? undefined : `${e.qty} × £${(e.sell_unit_pence / 100).toFixed(2)}`,
            is_production_work: false,
            quantity: whole ? e.qty : 1,
            unit_price_pence: whole ? e.sell_unit_pence : e.line_pence,
            unit_cost_pence: e.unit_cost_pence,
        });
    }

    return lines;
}

/** What a quote built from these lines will total, before VAT. */
export const linesTotalPence = (lines: GenericQuoteItemInput[]) =>
    lines.reduce((a, l) => a + l.unit_price_pence * (l.quantity ?? 1), 0);
