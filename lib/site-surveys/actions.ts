'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase-admin';
import { getUser, requireSuperAdminOrError } from '@/lib/auth';
import { ok, okVoid, err, type Result } from '@/lib/result';
import {
    CreateSurveySchema,
    UpdateSurveySchema,
    SaveSurveyItemsSchema,
    UploadSurveyPhotoSchema,
    UpdatePhotoSchema,
    type CreateSurveyInput,
    type UpdateSurveyInput,
    type SurveyItemInput,
    type UploadSurveyPhotoInput,
    type UpdatePhotoInput,
    type SurveyItemRow,
    type SurveyPhotoWithUrl,
    type SurveyStatus,
} from './types';

const TABLE = 'site_surveys';
const ITEMS = 'survey_items';
const PHOTOS = 'survey_photos';
const BUCKET = 'site-surveys';
const SIGNED_URL_TTL = 60 * 60; // 1 hour

const emptyToNull = (v: string | null | undefined) =>
    v && v.trim() !== '' ? v.trim() : null;

// ---------------------------------------------------------------------------
// Survey header
// ---------------------------------------------------------------------------

/** Create a survey shell. Super-admin only. Returns id + reference. */
export async function createSurvey(
    input: CreateSurveyInput,
): Promise<Result<{ id: string; reference: string }>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const parsed = CreateSurveySchema.safeParse(input);
    if (!parsed.success) {
        return err(parsed.error.issues[0]?.message ?? 'invalid input');
    }
    const d = parsed.data;

    const user = await getUser();
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from(TABLE)
        .insert({
            org_id: d.org_id ?? null,
            site_id: d.site_id ?? null,
            contact_id: d.contact_id ?? null,
            maintenance_visit_id: d.maintenance_visit_id ?? null,
            client_name: emptyToNull(d.client_name),
            site_address: emptyToNull(d.site_address),
            title: emptyToNull(d.title),
            survey_date: d.survey_date,
            surveyor_user_id: user?.id ?? null,
        })
        .select('id, reference')
        .single();

    if (error || !data) return err(error?.message ?? 'failed to create survey');
    revalidatePath('/admin/site-surveys');
    return ok({ id: data.id as string, reference: data.reference as string });
}

/** Patch the header + conditions + notes. Super-admin only. */
export async function updateSurvey(
    id: string,
    patch: UpdateSurveyInput,
): Promise<Result<null>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const parsed = UpdateSurveySchema.safeParse(patch);
    if (!parsed.success) {
        return err(parsed.error.issues[0]?.message ?? 'invalid input');
    }
    const p = parsed.data;

    const updates: Record<string, unknown> = {};
    if (p.org_id !== undefined) updates.org_id = p.org_id ?? null;
    if (p.site_id !== undefined) updates.site_id = p.site_id ?? null;
    if (p.contact_id !== undefined) updates.contact_id = p.contact_id ?? null;
    if (p.client_name !== undefined) updates.client_name = emptyToNull(p.client_name);
    if (p.site_address !== undefined) updates.site_address = emptyToNull(p.site_address);
    if (p.title !== undefined) updates.title = emptyToNull(p.title);
    if (p.survey_date !== undefined) updates.survey_date = p.survey_date;
    if (p.conditions !== undefined) updates.conditions_json = p.conditions;
    if (p.notes !== undefined) updates.notes = emptyToNull(p.notes);

    if (Object.keys(updates).length === 0) return okVoid();

    const supabase = createAdminClient();
    const { error } = await supabase.from(TABLE).update(updates).eq('id', id);
    if (error) return err(error.message);

    revalidatePath('/admin/site-surveys');
    revalidatePath(`/admin/site-surveys/${id}`);
    return okVoid();
}

/** Flip status draft <-> completed. Super-admin only. */
export async function setSurveyStatus(
    id: string,
    status: SurveyStatus,
): Promise<Result<null>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const supabase = createAdminClient();
    const { error } = await supabase.from(TABLE).update({ status }).eq('id', id);
    if (error) return err(error.message);

    revalidatePath('/admin/site-surveys');
    revalidatePath(`/admin/site-surveys/${id}`);
    return okVoid();
}

/** Delete a survey and its photos (rows cascade; storage objects removed). */
export async function deleteSurvey(id: string): Promise<Result<null>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const supabase = createAdminClient();

    // Remove the survey's storage folder first (cascade only clears rows).
    const { data: objs } = await supabase.storage.from(BUCKET).list(id);
    if (objs && objs.length > 0) {
        await supabase.storage
            .from(BUCKET)
            .remove(objs.map((o) => `${id}/${o.name}`));
    }

    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) return err(error.message);

    revalidatePath('/admin/site-surveys');
    return okVoid();
}

// ---------------------------------------------------------------------------
// Items — client sends the full list on save; we upsert + delete the missing.
// ---------------------------------------------------------------------------

export async function saveSurveyItems(
    surveyId: string,
    items: SurveyItemInput[],
): Promise<Result<SurveyItemRow[]>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const parsed = SaveSurveyItemsSchema.safeParse({ surveyId, items });
    if (!parsed.success) {
        return err(parsed.error.issues[0]?.message ?? 'invalid input');
    }
    const { items: input } = parsed.data;

    const supabase = createAdminClient();

    const { data: existing, error: exErr } = await supabase
        .from(ITEMS)
        .select('id')
        .eq('survey_id', surveyId);
    if (exErr) return err(exErr.message);
    const existingIds = new Set((existing ?? []).map((r) => r.id as string));
    const keep = new Set<string>();

    for (let i = 0; i < input.length; i++) {
        const it = input[i];
        const rowData = {
            survey_id: surveyId,
            sort_order: it.sort_order ?? i,
            label: it.label,
            sign_type: emptyToNull(it.sign_type),
            measurements_json: it.measurements,
            has_returns: it.has_returns,
            shadow_gap_required: it.shadow_gap_required,
            new_fascia_required: it.new_fascia_required,
            illuminated: it.illuminated,
            fixing_substrate: emptyToNull(it.fixing_substrate),
            item_notes: emptyToNull(it.item_notes),
        };

        if (it.id && existingIds.has(it.id)) {
            const { error } = await supabase
                .from(ITEMS)
                .update(rowData)
                .eq('id', it.id);
            if (error) return err(error.message);
            keep.add(it.id);
        } else {
            const { data, error } = await supabase
                .from(ITEMS)
                .insert(rowData)
                .select('id')
                .single();
            if (error || !data) return err(error?.message ?? 'failed to add item');
            keep.add(data.id as string);
        }
    }

    const toDelete = [...existingIds].filter((id) => !keep.has(id));
    if (toDelete.length > 0) {
        const { error } = await supabase.from(ITEMS).delete().in('id', toDelete);
        if (error) return err(error.message);
    }

    const { data: rows, error: fetchErr } = await supabase
        .from(ITEMS)
        .select('*')
        .eq('survey_id', surveyId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
    if (fetchErr) return err(fetchErr.message);

    revalidatePath(`/admin/site-surveys/${surveyId}`);
    return ok((rows ?? []) as SurveyItemRow[]);
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

function extFor(contentType: string): string {
    if (contentType === 'image/png') return 'png';
    if (contentType === 'image/webp') return 'webp';
    return 'jpg';
}

/**
 * Upload one (already-downscaled) photo and create its row. Returns the row
 * with a signed URL so the client can show it immediately.
 */
export async function uploadSurveyPhoto(
    input: UploadSurveyPhotoInput,
): Promise<Result<SurveyPhotoWithUrl>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const parsed = UploadSurveyPhotoSchema.safeParse(input);
    if (!parsed.success) {
        return err(parsed.error.issues[0]?.message ?? 'invalid photo');
    }
    const d = parsed.data;

    const supabase = createAdminClient();
    const objectId = crypto.randomUUID();
    const path = `${d.surveyId}/${objectId}.${extFor(d.contentType)}`;
    const bytes = Buffer.from(d.base64, 'base64');

    const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType: d.contentType, upsert: false });
    if (upErr) return err(`upload failed: ${upErr.message}`);

    const { data: row, error } = await supabase
        .from(PHOTOS)
        .insert({
            survey_id: d.surveyId,
            item_id: d.itemId ?? null,
            file_path: path,
            width_px: d.width,
            height_px: d.height,
            caption: emptyToNull(d.caption),
        })
        .select('*')
        .single();
    if (error || !row) {
        // Roll back the orphaned object on row-insert failure.
        await supabase.storage.from(BUCKET).remove([path]);
        return err(error?.message ?? 'failed to save photo');
    }

    const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL);

    revalidatePath(`/admin/site-surveys/${d.surveyId}`);
    return ok({ ...(row as SurveyPhotoWithUrl), url: signed?.signedUrl ?? null });
}

/** Update a photo's caption, annotations, and/or item link. Super-admin only. */
export async function updatePhoto(
    input: UpdatePhotoInput,
): Promise<Result<null>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const parsed = UpdatePhotoSchema.safeParse(input);
    if (!parsed.success) {
        return err(parsed.error.issues[0]?.message ?? 'invalid input');
    }
    const d = parsed.data;

    const updates: Record<string, unknown> = {};
    if (d.caption !== undefined) updates.caption = d.caption;
    if (d.annotations !== undefined) updates.annotations_json = d.annotations;
    if (d.item_id !== undefined) updates.item_id = d.item_id ?? null;
    if (d.sign_width_mm !== undefined) updates.sign_width_mm = d.sign_width_mm;
    if (d.sign_height_mm !== undefined) updates.sign_height_mm = d.sign_height_mm;
    if (Object.keys(updates).length === 0) return okVoid();

    const supabase = createAdminClient();
    const { data: row, error } = await supabase
        .from(PHOTOS)
        .update(updates)
        .eq('id', d.photoId)
        .select('survey_id')
        .single();
    if (error || !row) return err(error?.message ?? 'photo not found');

    revalidatePath(`/admin/site-surveys/${row.survey_id}`);
    return okVoid();
}

/** Delete a photo (row + storage object). Super-admin only. */
export async function deleteSurveyPhoto(photoId: string): Promise<Result<null>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const supabase = createAdminClient();
    const { data: row, error: findErr } = await supabase
        .from(PHOTOS)
        .select('survey_id, file_path')
        .eq('id', photoId)
        .maybeSingle();
    if (findErr) return err(findErr.message);
    if (!row) return err('photo not found');

    await supabase.storage.from(BUCKET).remove([row.file_path as string]);
    const { error } = await supabase.from(PHOTOS).delete().eq('id', photoId);
    if (error) return err(error.message);

    revalidatePath(`/admin/site-surveys/${row.survey_id}`);
    return okVoid();
}
