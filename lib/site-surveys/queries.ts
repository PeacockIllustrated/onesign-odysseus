import 'server-only';
import { createAdminClient } from '@/lib/supabase-admin';
import type {
    SiteSurveyRow,
    SurveyDetail,
    SurveyItemRow,
    SurveyListItem,
    SurveyPhotoRow,
    SurveyPhotoWithUrl,
} from './types';

const BUCKET = 'site-surveys';
const SIGNED_URL_TTL = 60 * 60; // 1 hour

// Reads that need service-role + signed URLs. The pages that call these are
// auth-gated (requireAdmin in the page / print route). Mutations live in
// actions.ts. Pattern mirrors lib/backshop/queries.ts.

/** Survey list, newest first, with item + photo counts. Super-admin pages. */
export async function listSurveys(): Promise<SurveyListItem[]> {
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from('site_surveys')
        .select(
            `*,
             orgs(name),
             org_sites(name),
             survey_items(count),
             survey_photos(count)`,
        )
        .order('created_at', { ascending: false })
        .limit(300);
    if (error || !data) return [];

    return data.map((row: Record<string, unknown>) => {
        const orgs = row.orgs as { name: string | null } | null;
        const sites = row.org_sites as { name: string | null } | null;
        const itemAgg = row.survey_items as { count: number }[] | null;
        const photoAgg = row.survey_photos as { count: number }[] | null;
        return {
            ...(row as unknown as SiteSurveyRow),
            org_name: orgs?.name ?? null,
            site_name: sites?.name ?? null,
            item_count: itemAgg?.[0]?.count ?? 0,
            photo_count: photoAgg?.[0]?.count ?? 0,
        };
    });
}

async function signPhotos(
    supabase: ReturnType<typeof createAdminClient>,
    photos: SurveyPhotoRow[],
): Promise<SurveyPhotoWithUrl[]> {
    return Promise.all(
        photos.map(async (p) => {
            const { data: signed } = await supabase.storage
                .from(BUCKET)
                .createSignedUrl(p.file_path, SIGNED_URL_TTL);
            return { ...p, url: signed?.signedUrl ?? null };
        }),
    );
}

/**
 * Full survey for the detail editor + print pack: header (with resolved client/
 * site/contact names), items sorted, and photos with short-lived signed URLs.
 */
export async function getSurveyDetail(id: string): Promise<SurveyDetail | null> {
    const supabase = createAdminClient();

    const { data: survey, error } = await supabase
        .from('site_surveys')
        .select(
            `*,
             orgs(name),
             org_sites(name),
             contacts(first_name, last_name)`,
        )
        .eq('id', id)
        .maybeSingle();
    if (error || !survey) return null;

    const row = survey as Record<string, unknown>;
    const orgs = row.orgs as { name: string | null } | null;
    const sites = row.org_sites as { name: string | null } | null;
    const contact = row.contacts as
        | { first_name: string | null; last_name: string | null }
        | null;

    const [itemsRes, photosRes] = await Promise.all([
        supabase
            .from('survey_items')
            .select('*')
            .eq('survey_id', id)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: true }),
        supabase
            .from('survey_photos')
            .select('*')
            .eq('survey_id', id)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: true }),
    ]);

    const items = (itemsRes.data ?? []) as SurveyItemRow[];
    const photos = await signPhotos(
        supabase,
        (photosRes.data ?? []) as SurveyPhotoRow[],
    );

    return {
        survey: row as unknown as SiteSurveyRow,
        items,
        photos,
        org_name: orgs?.name ?? null,
        site_name: sites?.name ?? null,
        contact_name: contact
            ? `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() ||
              null
            : null,
    };
}
