'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase-admin';
import { getUser, requireSuperAdminOrError } from '@/lib/auth';
import { ok, err, type Result } from '@/lib/result';
import {
    SaveDesignInputSchema,
    type SaveDesignInput,
    type VisualiserDesignRow,
    type PanelParams,
} from './types';

const TABLE = 'visualiser_designs';

/** List saved designs, most recent first. */
export async function listDesigns(): Promise<Result<VisualiserDesignRow[]>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(200);

    if (error) return err(error.message);
    // The neon-length tool stores its own records in this table tagged
    // params_json.kind = 'neon'; keep those out of the panel visualiser list.
    const rows = ((data ?? []) as VisualiserDesignRow[]).filter(
        (r) =>
            (r.params_json as { kind?: string } | null)?.kind !== 'neon',
    );
    return ok(rows);
}

/** Load a single design by id. */
export async function getDesign(
    id: string,
): Promise<Result<VisualiserDesignRow>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('id', id)
        .maybeSingle();

    if (error) return err(error.message);
    if (!data) return err('design not found');
    return ok(data as VisualiserDesignRow);
}

/** Create or update a design. */
export async function saveDesign(
    input: SaveDesignInput,
): Promise<Result<{ id: string }>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const parsed = SaveDesignInputSchema.safeParse(input);
    if (!parsed.success) {
        return err(parsed.error.issues[0]?.message ?? 'invalid input');
    }
    const { id, params, svgSource, quoteId, quoteItemId, orgId } = parsed.data;

    const user = await getUser();
    const supabase = createAdminClient();

    const row = {
        name: params.name,
        params_json: params,
        svg_source: svgSource ?? null,
        quote_id: quoteId ?? null,
        quote_item_id: quoteItemId ?? null,
        org_id: orgId ?? null,
        updated_at: new Date().toISOString(),
    };

    if (id) {
        const { error } = await supabase.from(TABLE).update(row).eq('id', id);
        if (error) return err(error.message);
        revalidatePath('/admin/visualiser');
        return ok({ id });
    }

    const { data, error } = await supabase
        .from(TABLE)
        .insert({ ...row, created_by: user?.id ?? null })
        .select('id')
        .single();

    if (error) return err(error.message);
    revalidatePath('/admin/visualiser');
    return ok({ id: data.id as string });
}

/** Delete a design. */
export async function deleteDesign(id: string): Promise<Result<null>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const supabase = createAdminClient();
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) return err(error.message);
    revalidatePath('/admin/visualiser');
    return ok(null);
}

/**
 * Pre-fill panel dimensions from an existing quote line item. Reads the
 * generic quote item's structured spec (top-level dims, else the first
 * sub-item). Material thickness is not tracked on quotes, so it's left at the
 * caller's default.
 */
export async function prefillFromQuoteItem(
    quoteItemId: string,
): Promise<Result<Partial<PanelParams> & { quoteId: string | null }>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from('quote_items')
        .select('quote_id, input_json')
        .eq('id', quoteItemId)
        .maybeSingle();

    if (error) return err(error.message);
    if (!data) return err('quote item not found');

    const input = (data.input_json ?? {}) as Record<string, unknown>;
    const sub = Array.isArray(input.sub_items) ? input.sub_items[0] : undefined;
    const pick = (k: string): number | undefined => {
        const top = input[k];
        if (typeof top === 'number' && top > 0) return top;
        const s = sub && typeof sub === 'object' ? (sub as Record<string, unknown>)[k] : undefined;
        return typeof s === 'number' && s > 0 ? s : undefined;
    };

    const width = pick('width_mm');
    const height = pick('height_mm');
    const returns = pick('returns_mm');
    const label =
        typeof input.part_label === 'string' ? input.part_label : undefined;

    const partial: Partial<PanelParams> = {};
    if (width) partial.panelWidthMm = width;
    if (height) partial.panelHeightMm = height;
    if (returns !== undefined) partial.returnDepthMm = returns;
    if (label) partial.name = label;

    return ok({ ...partial, quoteId: (data.quote_id as string) ?? null });
}
