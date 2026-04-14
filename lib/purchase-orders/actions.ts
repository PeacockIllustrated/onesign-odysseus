'use server';

import { createServerClient } from '@/lib/supabase-server';
import { getUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { calcLineTotal, calcPoTotal, canTransitionTo } from './utils';
import { getPurchaseOrders, getPoWithItems } from './queries';
import type {
    CreatePoInput,
    UpdatePoInput,
    CreatePoItemInput,
    UpdatePoItemInput,
    PoStatus,
    PurchaseOrder,
    PoWithItems,
} from './types';
import {
    CreatePoInputSchema,
    UpdatePoInputSchema,
    CreatePoItemInputSchema,
    UpdatePoItemInputSchema,
} from './types';

// Thin wrappers for client components
export async function getPoListAction(filters?: {
    status?: string;
    search?: string;
}): Promise<PurchaseOrder[]> {
    return getPurchaseOrders(filters);
}

export async function getPoWithItemsAction(poId: string): Promise<PoWithItems | null> {
    return getPoWithItems(poId);
}

// Recalculate and persist po.total_pence from current items
async function recalcPoTotal(supabase: any, poId: string): Promise<void> {
    const { data: items } = await supabase
        .from('po_items')
        .select('line_total_pence')
        .eq('po_id', poId);
    const total = calcPoTotal(items || []);
    await supabase
        .from('purchase_orders')
        .update({ total_pence: total })
        .eq('id', poId);
}

export async function createPoAction(
    input: CreatePoInput
): Promise<{ id: string } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const validation = CreatePoInputSchema.safeParse(input);
    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }
    const parsed = validation.data;

    const supabase = await createServerClient();

    const { data, error } = await supabase
        .from('purchase_orders')
        .insert({
            org_id: parsed.org_id,
            supplier_name: parsed.supplier_name,
            supplier_email: parsed.supplier_email || null,
            description: parsed.description,
            required_by_date: parsed.required_by_date || null,
            quote_id: parsed.quote_id || null,
            production_job_id: parsed.production_job_id || null,
            status: 'draft',
            created_by: user.id,
        })
        .select('id')
        .single();

    if (error) {
        console.error('Error creating PO:', error);
        return { error: error.message };
    }

    revalidatePath('/admin/purchase-orders');
    return { id: data.id };
}

export async function updatePoAction(
    input: UpdatePoInput
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const validation = UpdatePoInputSchema.safeParse(input);
    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }
    const parsed = validation.data;

    const supabase = await createServerClient();

    const { id, ...fields } = parsed;
    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) updates[k] = v;
    }

    const { error } = await supabase.from('purchase_orders').update(updates).eq('id', id);

    if (error) {
        console.error('Error updating PO:', error);
        return { error: error.message };
    }

    revalidatePath(`/admin/purchase-orders/${id}`);
    revalidatePath('/admin/purchase-orders');
    return { success: true };
}

export async function updatePoStatusAction(
    poId: string,
    newStatus: PoStatus
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();

    const { data: current, error: fetchError } = await supabase
        .from('purchase_orders')
        .select('status')
        .eq('id', poId)
        .single();

    if (fetchError || !current) return { error: 'Purchase order not found' };

    if (!canTransitionTo(current.status as PoStatus, newStatus)) {
        return { error: `Cannot transition from "${current.status}" to "${newStatus}"` };
    }

    const { error } = await supabase
        .from('purchase_orders')
        .update({ status: newStatus })
        .eq('id', poId);

    if (error) {
        console.error('Error updating PO status:', error);
        return { error: error.message };
    }

    revalidatePath(`/admin/purchase-orders/${poId}`);
    revalidatePath('/admin/purchase-orders');
    return { success: true };
}

export async function addPoItemAction(
    input: CreatePoItemInput
): Promise<{ id: string } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const validation = CreatePoItemInputSchema.safeParse(input);
    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }
    const parsed = validation.data;

    const supabase = await createServerClient();
    const lineTotal = calcLineTotal(parsed.quantity, parsed.unit_cost_pence);

    const { data, error } = await supabase
        .from('po_items')
        .insert({
            po_id: parsed.po_id,
            description: parsed.description,
            quantity: parsed.quantity,
            unit_cost_pence: parsed.unit_cost_pence,
            line_total_pence: lineTotal,
        })
        .select('id')
        .single();

    if (error) {
        console.error('Error adding PO item:', error);
        return { error: error.message };
    }

    await recalcPoTotal(supabase, parsed.po_id);
    revalidatePath(`/admin/purchase-orders/${parsed.po_id}`);
    return { id: data.id };
}

export async function updatePoItemAction(
    input: UpdatePoItemInput
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const validation = UpdatePoItemInputSchema.safeParse(input);
    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }
    const parsed = validation.data;

    const supabase = await createServerClient();

    const { data: current, error: fetchError } = await supabase
        .from('po_items')
        .select('quantity, unit_cost_pence')
        .eq('id', parsed.id)
        .single();

    if (fetchError || !current) return { error: 'Item not found' };

    const qty = parsed.quantity ?? current.quantity;
    const unitCost = parsed.unit_cost_pence ?? current.unit_cost_pence;
    const lineTotal = calcLineTotal(qty, unitCost);

    const updates: Record<string, unknown> = {
        quantity: qty,
        unit_cost_pence: unitCost,
        line_total_pence: lineTotal,
    };
    if (parsed.description !== undefined) updates.description = parsed.description;

    const { error } = await supabase
        .from('po_items')
        .update(updates)
        .eq('id', parsed.id);

    if (error) {
        console.error('Error updating PO item:', error);
        return { error: error.message };
    }

    await recalcPoTotal(supabase, parsed.po_id);
    revalidatePath(`/admin/purchase-orders/${parsed.po_id}`);
    return { success: true };
}

export async function deletePoItemAction(
    poId: string,
    itemId: string
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();

    const { error } = await supabase
        .from('po_items')
        .delete()
        .eq('id', itemId)
        .eq('po_id', poId);

    if (error) {
        console.error('Error deleting PO item:', error);
        return { error: error.message };
    }

    await recalcPoTotal(supabase, poId);
    revalidatePath(`/admin/purchase-orders/${poId}`);
    return { success: true };
}

export async function deletePoAction(
    poId: string
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();

    const { error } = await supabase
        .from('purchase_orders')
        .delete()
        .eq('id', poId);

    if (error) {
        console.error('Error deleting PO:', error);
        return { error: error.message };
    }

    revalidatePath('/admin/purchase-orders');
    return { success: true };
}
