'use server';

import { createAdminClient } from '@/lib/supabase-admin';
import { revalidatePath } from 'next/cache';

/**
 * Geocode a single site by calling postcodes.io with its postcode.
 * Writes latitude + longitude to org_sites. Fire-and-forget — never
 * blocks the caller, never throws to the user.
 */
export async function geocodeSite(siteId: string): Promise<void> {
    const supabase = createAdminClient();

    const { data: site } = await supabase
        .from('org_sites')
        .select('id, postcode, latitude')
        .eq('id', siteId)
        .single();

    if (!site?.postcode) return;
    // Already geocoded and postcode hasn't changed — skip.
    if (site.latitude != null) return;

    try {
        const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
        if (!token) {
            console.warn('geocodeSite: NEXT_PUBLIC_MAPBOX_TOKEN not set');
            return;
        }
        const encoded = encodeURIComponent(site.postcode.trim());
        const res = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json` +
            `?country=gb&types=postcode&limit=1&access_token=${token}`
        );
        if (!res.ok) {
            console.warn(`geocodeSite: Mapbox returned ${res.status} for "${site.postcode}"`);
            return;
        }
        const json = await res.json();
        const feature = json.features?.[0];
        if (!feature?.center) return;
        const [lng, lat] = feature.center;

        await supabase
            .from('org_sites')
            .update({ latitude: lat, longitude: lng })
            .eq('id', siteId);
    } catch (err) {
        console.warn('geocodeSite fetch error:', err);
    }
}

/**
 * One-shot backfill: geocode every site that has a postcode but no lat/lng.
 * Polite 100ms delay between calls. Run from an admin console or a button.
 */
export async function geocodeAllSites(): Promise<{ geocoded: number; skipped: number }> {
    const supabase = createAdminClient();

    const { data: sites } = await supabase
        .from('org_sites')
        .select('id, postcode')
        .is('latitude', null)
        .not('postcode', 'is', null)
        .limit(500);

    let geocoded = 0;
    let skipped = 0;

    for (const site of sites ?? []) {
        try {
            const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
            if (!token) { skipped++; continue; }
            const encoded = encodeURIComponent(site.postcode.trim());
            const res = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json` +
                `?country=gb&types=postcode&limit=1&access_token=${token}`
            );
            if (!res.ok) { skipped++; continue; }
            const json = await res.json();
            const feature = json.features?.[0];
            if (!feature?.center) { skipped++; continue; }
            const [lng, lat] = feature.center;

            await supabase
                .from('org_sites')
                .update({ latitude: lat, longitude: lng })
                .eq('id', site.id);
            geocoded++;
        } catch {
            skipped++;
        }
        await new Promise((r) => setTimeout(r, 100));
    }

    revalidatePath('/admin/map');
    return { geocoded, skipped };
}
