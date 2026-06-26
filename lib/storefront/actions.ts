'use server';

/**
 * Storefront Studio persistence + survey link.
 *
 * Saves a reconstructed shopfront (its measured `StorefrontSpec`) per prospect,
 * optionally linked to a site survey (the dimensional source of truth) and a
 * visualiser sign. Super-admin gated; service-role admin client; Result<T>.
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase-admin';
import { getUser, requireSuperAdminOrError } from '@/lib/auth';
import { ok, err, type Result } from '@/lib/result';
import type {
    LinkableSurvey,
    LoadedStorefrontProject,
    SaveStorefrontInput,
    StorefrontProjectListItem,
    StorefrontSpec,
    SurveyAnchor,
} from './types';

const TABLE = 'storefront_projects';

export async function listStorefrontProjects(): Promise<Result<StorefrontProjectListItem[]>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);
    const sb = createAdminClient();
    const { data, error } = await sb
        .from(TABLE)
        .select('id,name,reference,updated_at')
        .order('updated_at', { ascending: false })
        .limit(200);
    if (error) return err(error.message);
    return ok((data ?? []) as StorefrontProjectListItem[]);
}

export async function getStorefrontProject(id: string): Promise<Result<LoadedStorefrontProject>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);
    if (!z.string().uuid().safeParse(id).success) return err('invalid project id');
    const sb = createAdminClient();
    const { data, error } = await sb
        .from(TABLE)
        .select('id,name,spec_json,survey_id,linked_visualiser_design_id')
        .eq('id', id)
        .single();
    if (error) return err(error.message);
    return ok({
        id: data.id as string,
        name: data.name as string,
        spec: data.spec_json as StorefrontSpec,
        survey_id: (data.survey_id as string | null) ?? null,
        linked_visualiser_design_id: (data.linked_visualiser_design_id as string | null) ?? null,
    });
}

const SaveSchema = z.object({
    id: z.string().uuid().nullable().optional(),
    name: z.string().trim().min(1).max(200),
    // spec_json — trusted shape (produced by the engine; validated by use, not re-parsed here)
    spec: z.record(z.string(), z.unknown()),
    surveyId: z.string().uuid().nullable().optional(),
    designId: z.string().uuid().nullable().optional(),
});

export async function saveStorefrontProject(input: SaveStorefrontInput): Promise<Result<{ id: string }>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);
    const parsed = SaveSchema.safeParse(input);
    if (!parsed.success) return err(parsed.error.issues[0]?.message ?? 'invalid input');
    const d = parsed.data;
    const user = await getUser();
    const sb = createAdminClient();
    const row = {
        name: d.name,
        spec_json: d.spec,
        survey_id: d.surveyId ?? null,
        linked_visualiser_design_id: d.designId ?? null,
        updated_at: new Date().toISOString(),
    };
    if (d.id) {
        const { error } = await sb.from(TABLE).update(row).eq('id', d.id);
        if (error) return err(error.message);
        revalidatePath('/admin/storefront');
        return ok({ id: d.id });
    }
    const { data, error } = await sb
        .from(TABLE)
        .insert({ ...row, created_by: user?.id ?? null })
        .select('id')
        .single();
    if (error) return err(error.message);
    revalidatePath('/admin/storefront');
    return ok({ id: data.id as string });
}

export async function listLinkableSurveys(): Promise<Result<LinkableSurvey[]>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);
    const sb = createAdminClient();
    const { data, error } = await sb
        .from('site_surveys')
        .select('id,reference,client_name,site_address')
        .order('created_at', { ascending: false })
        .limit(100);
    if (error) return err(error.message);
    return ok(
        (data ?? []).map((s) => ({
            id: s.id as string,
            reference: s.reference as string,
            label:
                [s.client_name as string | null, s.site_address as string | null].filter(Boolean).join(' — ') ||
                (s.reference as string),
        })),
    );
}

/**
 * The measured dimensions a survey recorded — offered as trace anchors so the
 * reconstruction is calibrated to the real, surveyed sizes (source of truth).
 */
export async function getSurveyAnchors(surveyId: string): Promise<Result<SurveyAnchor[]>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);
    if (!z.string().uuid().safeParse(surveyId).success) return err('invalid survey id');
    const sb = createAdminClient();
    const { data, error } = await sb
        .from('survey_photos')
        .select('sign_width_mm,sign_height_mm')
        .eq('survey_id', surveyId);
    if (error) return err(error.message);
    const anchors: SurveyAnchor[] = [];
    let n = 0;
    for (const p of data ?? []) {
        n += 1;
        const w = p.sign_width_mm == null ? null : Math.round(Number(p.sign_width_mm));
        const h = p.sign_height_mm == null ? null : Math.round(Number(p.sign_height_mm));
        if (w) anchors.push({ label: `Surveyed sign ${n} width`, mm: w });
        if (h) anchors.push({ label: `Surveyed sign ${n} height`, mm: h });
    }
    return ok(anchors);
}
