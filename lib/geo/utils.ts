/**
 * Pure helpers for the site-centric map. No Supabase, no side effects.
 */

export interface RecordCounts {
    deliveries: number;
    artwork: number;
    production: number;
    maintenance: number;
    quotes: number;
}

/**
 * Pick pin colour by highest-priority active work.
 * Order: delivery (red) > artwork (amber) > production (green) >
 *        maintenance (blue) > quotes (grey).
 */
export function pinColour(counts: RecordCounts): string {
    if (counts.deliveries > 0) return 'red';
    if (counts.artwork > 0) return 'amber';
    if (counts.production > 0) return 'green';
    if (counts.maintenance > 0) return 'blue';
    return 'grey';
}

export interface SiteAddressFields {
    address_line_1: string | null;
    address_line_2: string | null;
    city: string | null;
    county: string | null;
    postcode: string | null;
}

/**
 * Format a site's address fields into a single comma-separated line,
 * skipping any null or empty fields.
 */
export function formatSiteAddress(site: SiteAddressFields): string {
    return [
        site.address_line_1,
        site.address_line_2,
        site.city,
        site.county,
        site.postcode,
    ]
        .filter((s): s is string => !!s)
        .join(', ');
}
