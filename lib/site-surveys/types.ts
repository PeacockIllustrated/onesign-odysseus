import { z } from 'zod';

// =============================================================================
// SITE SURVEYS — Zod schemas + types (migration 061)
//
// A survey is the on-site measure-up that precedes a quote. It holds a header
// (client/site + access conditions), one item per measured sign/part (generic
// measurements + spec flags), and annotated site photos. The dimensioned sketch
// in the survey pack is derived from `measurements` on the fly — see sketch.ts.
// =============================================================================

const MM = z.number().nonnegative().max(1_000_000);

// ---------------------------------------------------------------------------
// Measurements — generic so it fits any sign type. `extra[]` captures anything
// the four named dimensions don't (e.g. "letter height", "projection").
// ---------------------------------------------------------------------------
export const MeasurementExtraSchema = z.object({
    label: z.string().trim().max(60),
    value_mm: MM,
});
export type MeasurementExtra = z.infer<typeof MeasurementExtraSchema>;

export const MeasurementsSchema = z.object({
    width_mm: MM.optional(),
    height_mm: MM.optional(),
    depth_mm: z.number().nonnegative().max(100_000).optional(),
    return_depth_mm: z.number().nonnegative().max(100_000).optional(),
    shadow_gap_mm: z.number().nonnegative().max(10_000).optional(),
    extra: z.array(MeasurementExtraSchema).max(40).optional(),
});
export type Measurements = z.infer<typeof MeasurementsSchema>;

// ---------------------------------------------------------------------------
// Annotation markup on a photo. Coordinates are normalized 0..1 relative to the
// image's natural size, so they reproject identically on phone, desktop, and in
// the printed pack. Discriminated on `kind`.
// ---------------------------------------------------------------------------
const Pt = z.tuple([z.number(), z.number()]);

export const AnnotationSchema = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal('measure'),
        a: Pt,
        b: Pt,
        label: z.string().max(40).default(''),
    }),
    z.object({
        kind: z.literal('pin'),
        at: Pt,
        n: z.number().int().min(1).max(999),
        note: z.string().max(200).default(''),
    }),
    z.object({
        kind: z.literal('note'),
        at: Pt,
        text: z.string().max(200).default(''),
    }),
    z.object({
        kind: z.literal('rect'),
        x: z.number(),
        y: z.number(),
        w: z.number(),
        h: z.number(),
        label: z.string().max(40).default(''),
    }),
]);
export type Annotation = z.infer<typeof AnnotationSchema>;
export const AnnotationsSchema = z.array(AnnotationSchema).max(200);

// ---------------------------------------------------------------------------
// Site / access conditions — what the fitter needs to know to price + plan.
// ---------------------------------------------------------------------------
export const SurveyConditionsSchema = z
    .object({
        scaffolding_required: z.boolean(),
        cherrypicker_required: z.boolean(),
        traffic_management_required: z.boolean(),
        power_available: z.boolean(),
        permit_required: z.boolean(),
        access_notes: z.string().max(2000),
        parking_notes: z.string().max(1000),
    })
    .partial();
export type SurveyConditions = z.infer<typeof SurveyConditionsSchema>;

export const CONDITION_FLAGS = [
    { key: 'scaffolding_required', label: 'Scaffolding required' },
    { key: 'cherrypicker_required', label: 'Cherrypicker / MEWP required' },
    { key: 'traffic_management_required', label: 'Traffic management required' },
    { key: 'power_available', label: 'Power available on site' },
    { key: 'permit_required', label: 'Permit / permission required' },
] as const satisfies ReadonlyArray<{
    key: keyof SurveyConditions;
    label: string;
}>;

// ---------------------------------------------------------------------------
// Survey status
// ---------------------------------------------------------------------------
export const SURVEY_STATUSES = ['draft', 'completed'] as const;
export type SurveyStatus = (typeof SURVEY_STATUSES)[number];
export const SURVEY_STATUS_LABELS: Record<SurveyStatus, string> = {
    draft: 'Draft',
    completed: 'Completed',
};

// ---------------------------------------------------------------------------
// Action inputs
// ---------------------------------------------------------------------------
const optionalUuid = z.string().uuid().nullable().optional();
const optionalText = (max: number) =>
    z.string().trim().max(max).optional().or(z.literal(''));

export const CreateSurveySchema = z.object({
    org_id: optionalUuid,
    site_id: optionalUuid,
    contact_id: optionalUuid,
    maintenance_visit_id: optionalUuid,
    client_name: optionalText(200),
    site_address: optionalText(500),
    title: optionalText(200),
    survey_date: z.string().min(1, 'survey date is required'),
});
export type CreateSurveyInput = z.infer<typeof CreateSurveySchema>;

export const UpdateSurveySchema = z
    .object({
        org_id: optionalUuid,
        site_id: optionalUuid,
        contact_id: optionalUuid,
        client_name: optionalText(200),
        site_address: optionalText(500),
        title: optionalText(200),
        survey_date: z.string().min(1).optional(),
        conditions: SurveyConditionsSchema.optional(),
        notes: optionalText(4000),
    })
    .partial();
export type UpdateSurveyInput = z.infer<typeof UpdateSurveySchema>;

export const SurveyItemInputSchema = z.object({
    // Present for an existing row; absent for a freshly added one.
    id: z.string().uuid().optional(),
    label: z.string().trim().min(1, 'item label is required').max(200),
    sign_type: optionalText(120),
    measurements: MeasurementsSchema,
    has_returns: z.boolean(),
    shadow_gap_required: z.boolean(),
    new_fascia_required: z.boolean(),
    illuminated: z.boolean(),
    fixing_substrate: optionalText(120),
    item_notes: optionalText(2000),
    sort_order: z.number().int().min(0).optional(),
});
export type SurveyItemInput = z.infer<typeof SurveyItemInputSchema>;

export const SaveSurveyItemsSchema = z.object({
    surveyId: z.string().uuid(),
    items: z.array(SurveyItemInputSchema).max(60),
});

export const UploadSurveyPhotoSchema = z.object({
    surveyId: z.string().uuid(),
    itemId: z.string().uuid().nullable().optional(),
    /** base64 (no data-URL prefix). Image is downscaled client-side first. */
    base64: z.string().min(1).max(14_000_000),
    contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    /** Pixel size of the (downscaled) image — drives the pack overlay viewBox. */
    width: z.number().int().positive().max(20000),
    height: z.number().int().positive().max(20000),
    caption: optionalText(200),
});
export type UploadSurveyPhotoInput = z.infer<typeof UploadSurveyPhotoSchema>;

export const UpdatePhotoSchema = z.object({
    photoId: z.string().uuid(),
    caption: z.string().max(200).nullable().optional(),
    annotations: AnnotationsSchema.optional(),
    item_id: z.string().uuid().nullable().optional(),
});
export type UpdatePhotoInput = z.infer<typeof UpdatePhotoSchema>;

// ---------------------------------------------------------------------------
// Row + hydrated types
// ---------------------------------------------------------------------------
export interface SiteSurveyRow {
    id: string;
    reference: string;
    org_id: string | null;
    site_id: string | null;
    contact_id: string | null;
    maintenance_visit_id: string | null;
    client_name: string | null;
    site_address: string | null;
    title: string | null;
    surveyor_user_id: string | null;
    survey_date: string;
    status: SurveyStatus;
    conditions_json: SurveyConditions;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

export interface SurveyItemRow {
    id: string;
    survey_id: string;
    sort_order: number;
    label: string;
    sign_type: string | null;
    measurements_json: Measurements;
    has_returns: boolean;
    shadow_gap_required: boolean;
    new_fascia_required: boolean;
    illuminated: boolean;
    fixing_substrate: string | null;
    item_notes: string | null;
    created_at: string;
    updated_at: string;
}

export interface SurveyPhotoRow {
    id: string;
    survey_id: string;
    item_id: string | null;
    file_path: string;
    width_px: number | null;
    height_px: number | null;
    caption: string | null;
    annotations_json: Annotation[];
    sort_order: number;
    created_at: string;
    updated_at: string;
}

/** A photo with a short-lived signed URL resolved for its file_path. */
export type SurveyPhotoWithUrl = SurveyPhotoRow & { url: string | null };

/** Full survey for the detail editor + print pack. */
export interface SurveyDetail {
    survey: SiteSurveyRow;
    items: SurveyItemRow[];
    photos: SurveyPhotoWithUrl[];
    org_name: string | null;
    site_name: string | null;
    contact_name: string | null;
}

/** Row shape for the list page. */
export interface SurveyListItem extends SiteSurveyRow {
    org_name: string | null;
    site_name: string | null;
    item_count: number;
    photo_count: number;
}
