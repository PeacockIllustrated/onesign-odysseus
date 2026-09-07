import { z } from 'zod';

/**
 * The Newcastle Red Bulls job pack (redbull_* tables).
 *
 * The pack is served to redbull.onesignanddigital.com by the `redbull-job-pack`
 * edge function, which calls `redbull_job_pack(slug)`. This editor writes the
 * rows that function reads, so a change here is live on the client-facing site
 * within the endpoint's 30-second cache.
 *
 * Only sheets of type `panels` (2 Perimeter Boards, 3 Internal Padding,
 * 4 Job Schedule) carry editable rows. Sheets 1, 5 and 6 are presentation and
 * live in `redbull_sheets.payload`.
 */

/**
 * The pack this editor manages. Lives here rather than in actions.ts because
 * every export of a 'use server' module must be an async function.
 */
export const DEFAULT_PACK_SLUG = 'nrb';

/** One part of a row's artwork value, e.g. "Sponsor" or "To confirm". */
export interface ArtworkPart {
    label: string;
    state: string;
}

export interface PackRow {
    id: string;
    code: string;
    name: string | null;
    size: string | null;
    artwork: ArtworkPart[];
    position: number;
    updated_at: string;
}

export interface PackPanel {
    id: string;
    slug: string;
    title: string;
    note: string | null;
    colour: string | null;
    is_wide: boolean;
    footnote: string | null;
    position: number;
    rows: PackRow[];
}

export interface PackSheet {
    id: string;
    slug: string;
    number: number;
    nav: string | null;
    title: string;
    subtitle: string | null;
    type: 'plan' | 'panels' | 'fitting' | 'details';
    position: number;
    panels: PackPanel[];
}

export interface JobPack {
    id: string;
    slug: string;
    client: string;
    venue: string;
    title: string;
    revision: string;
    issued: string | null;
    updated: string | null;
    is_published: boolean;
    updated_at: string;
    sheets: PackSheet[];
}

/**
 * An artwork state. Read from `redbull_states` rather than hard-coded, so the
 * dropdown and the site's colours stay in step without a deploy.
 */
export interface PackState {
    key: string;
    label: string;
    note: string | null;
    position: number;
}

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

/**
 * `state` is a free string here on purpose — the valid set lives in
 * `redbull_states`, so the action checks membership against the table rather
 * than a Zod enum that would drift the moment someone adds a state.
 */
export const ArtworkPartSchema = z.object({
    label: z.string().trim().min(1, 'artwork label cannot be empty').max(120),
    state: z.string().trim().min(1, 'artwork state is required').max(40),
});

export const UpdateRowSchema = z.object({
    code: z.string().trim().min(1, 'ref cannot be empty').max(120).optional(),
    name: z.string().trim().max(120).nullable().optional(),
    size: z.string().trim().max(200).nullable().optional(),
    // The printed sheet renders one or two parts ("Sponsor / To confirm").
    // Four is headroom, not an invitation.
    artwork: z.array(ArtworkPartSchema).max(4, 'at most four artwork parts').optional(),
});
export type UpdateRowInput = z.infer<typeof UpdateRowSchema>;

export const SetPublishedSchema = z.object({
    packId: z.string().uuid('bad pack id'),
    isPublished: z.boolean(),
});
export type SetPublishedInput = z.infer<typeof SetPublishedSchema>;

// -----------------------------------------------------------------------------
// Helpers shared by the page and the client component
// -----------------------------------------------------------------------------

/** Rows whose artwork is still waiting on the client. */
export function isOutstanding(row: PackRow): boolean {
    return row.artwork.some((p) => p.state === 'pending');
}

/** How the site will render this value: "Sponsor / To confirm". */
export function formatArtwork(parts: ArtworkPart[]): string {
    if (!parts.length) return '—';
    return parts.map((p) => p.label).join(' / ');
}

export function countRows(pack: JobPack): { total: number; outstanding: number } {
    let total = 0;
    let outstanding = 0;
    for (const sheet of pack.sheets) {
        for (const panel of sheet.panels) {
            for (const row of panel.rows) {
                total++;
                if (isOutstanding(row)) outstanding++;
            }
        }
    }
    return { total, outstanding };
}
