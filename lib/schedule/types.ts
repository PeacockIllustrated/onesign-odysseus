import { z } from 'zod';

// ---------------------------------------------------------------------------
// Roster
// ---------------------------------------------------------------------------

export const RosterGroupEnum = z.enum(['crew', 'additional']);
export type RosterGroup = z.infer<typeof RosterGroupEnum>;

export interface ProjectManager {
    id: string;
    name: string;
    /** Base hex. Card background / border / chip are derived from it in CSS. */
    colour: string;
    sort_order: number;
    is_active: boolean;
}

export interface Van {
    id: string;
    name: string;
    sort_order: number;
    is_active: boolean;
}

export interface Fitter {
    id: string;
    name: string;
    roster_group: RosterGroup;
    sort_order: number;
    is_active: boolean;
}

/** Standing pairing: which fitters ride which van every day by default. */
export interface DefaultCrewRow {
    van_id: string;
    fitter_id: string;
}

export const AssignmentKindEnum = z.enum(['van', 'holiday', 'off']);
export type AssignmentKind = z.infer<typeof AssignmentKindEnum>;

export interface DayCrewOverrideRow {
    id: string;
    date: string;
    fitter_id: string;
    assignment: AssignmentKind;
    van_id: string | null;
}

/**
 * Where one fitter is on one day. `van` carries the van id; `holiday` and
 * `off` (in the workshop rather than out fitting) carry none.
 */
export type Placement =
    | { kind: 'van'; vanId: string }
    | { kind: 'holiday' }
    | { kind: 'off' };

/** fitter_id -> placement, for a single date. */
export type DayAssignment = Record<string, Placement>;

export interface ResolvedDay {
    /** van_id -> fitter ids riding it that day. */
    crews: Record<string, string[]>;
    /** Fitter ids on leave that day. */
    holiday: string[];
    /** Fitter ids in the workshop that day. */
    off: string[];
    /** True when the day has at least one override row — drives the tag. */
    override: boolean;
}

export type CrewWarning = 'none' | 'solo' | 'empty';

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export const SlotEnum = z.enum(['AM', 'PM', 'DAY', 'OOH']);
export type Slot = z.infer<typeof SlotEnum>;

export const LaneEnum = z.enum(['scheduled', 'delivery']);
export type Lane = z.infer<typeof LaneEnum>;

export interface FittingJob {
    id: string;
    job_ref: string;

    org_id: string | null;
    contact_id: string | null;
    site_id: string | null;
    quote_id: string | null;
    production_job_id: string | null;

    customer_fallback: string | null;
    quote_ref: string | null;
    location: string | null;
    postcode: string | null;
    latitude: number | null;
    longitude: number | null;

    pm_id: string | null;

    van_id: string | null;
    /** null = unscheduled, sitting in the `lane` holding panel. */
    scheduled_date: string | null;
    lane: Lane;
    slot: Slot;
    sort_order: number;

    done: boolean;
    done_at: string | null;
    delivery_required: boolean;
    delivery_id: string | null;

    crew_override: string | null;
    access_equipment: string | null;
    notes: string | null;
    archived_at: string | null;

    created_by: string | null;
    updated_by: string | null;
    created_at: string;
    updated_at: string;
}

/** A job joined to the client record it inherits from. */
export interface FittingJobView extends FittingJob {
    org_name: string | null;
    site_name: string | null;
    site_postcode: string | null;
    contact_name: string | null;
    quote_number: string | null;
    updated_by_name: string | null;
}

/** Everything the board needs in one payload. */
export interface ScheduleBoardData {
    jobs: FittingJobView[];
    vans: Van[];
    fitters: Fitter[];
    pms: ProjectManager[];
    defaultCrew: DefaultCrewRow[];
    overrides: DayCrewOverrideRow[];
}

// ---------------------------------------------------------------------------
// Action input schemas
// ---------------------------------------------------------------------------

const isoDate = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'colour must be a hex value');

export const SaveFittingJobSchema = z
    .object({
        id: z.string().uuid().optional(),

        org_id: z.string().uuid().nullable().optional(),
        contact_id: z.string().uuid().nullable().optional(),
        site_id: z.string().uuid().nullable().optional(),
        quote_id: z.string().uuid().nullable().optional(),
        production_job_id: z.string().uuid().nullable().optional(),

        customer_fallback: z.string().max(200).nullable().optional(),
        quote_ref: z.string().max(60).nullable().optional(),
        location: z.string().max(200).nullable().optional(),
        postcode: z.string().max(12).nullable().optional(),

        pm_id: z.string().uuid().nullable().optional(),

        van_id: z.string().uuid().nullable().optional(),
        scheduled_date: isoDate.nullable().optional(),
        lane: LaneEnum.optional(),
        slot: SlotEnum.optional(),

        done: z.boolean().optional(),
        delivery_required: z.boolean().optional(),

        crew_override: z.string().max(200).nullable().optional(),
        access_equipment: z.string().max(500).nullable().optional(),
        notes: z.string().max(4000).nullable().optional(),
    })
    .refine(
        (v) =>
            // A job needs a name from somewhere: either it inherits a client
            // record or it carries its own free-text customer.
            !!v.org_id || !!v.customer_fallback?.trim() || !!v.id,
        { message: 'customer is required', path: ['customer_fallback'] }
    )
    .refine((v) => v.scheduled_date == null || !!v.van_id, {
        message: 'a scheduled job needs a van',
        path: ['van_id'],
    });
export type SaveFittingJobInput = z.infer<typeof SaveFittingJobSchema>;

/** Drag & drop onto the board, or into a holding panel. */
export const MoveFittingJobSchema = z
    .object({
        id: z.string().uuid(),
        van_id: z.string().uuid().nullable(),
        scheduled_date: isoDate.nullable(),
        slot: SlotEnum.optional(),
        lane: LaneEnum.optional(),
    })
    .refine((v) => v.scheduled_date == null || !!v.van_id, {
        message: 'a scheduled job needs a van',
        path: ['van_id'],
    });
export type MoveFittingJobInput = z.infer<typeof MoveFittingJobSchema>;

export const SaveDayCrewSchema = z.object({
    date: isoDate,
    assignments: z
        .array(
            z.object({
                fitter_id: z.string().uuid(),
                assignment: AssignmentKindEnum,
                van_id: z.string().uuid().nullable(),
            })
        )
        .max(60),
});
export type SaveDayCrewInput = z.infer<typeof SaveDayCrewSchema>;

/**
 * Holiday entered once as a range rather than a day at a time — most of the
 * physical board's top edge is holiday notes, so this is real daily admin.
 */
export const HolidayRangeSchema = z
    .object({
        fitter_id: z.string().uuid(),
        from: isoDate,
        to: isoDate,
        include_weekends: z.boolean().optional(),
    })
    .refine((v) => v.from <= v.to, {
        message: 'end date must be on or after the start date',
        path: ['to'],
    });
export type HolidayRangeInput = z.infer<typeof HolidayRangeSchema>;

export const SaveVanSchema = z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1, 'name is required').max(60),
    sort_order: z.number().int().min(0).optional(),
    is_active: z.boolean().optional(),
});
export type SaveVanInput = z.infer<typeof SaveVanSchema>;

export const SaveFitterSchema = z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1, 'name is required').max(60),
    roster_group: RosterGroupEnum.optional(),
    sort_order: z.number().int().min(0).optional(),
    is_active: z.boolean().optional(),
    /** Standing van; null means no default pairing. */
    default_van_id: z.string().uuid().nullable().optional(),
});
export type SaveFitterInput = z.infer<typeof SaveFitterSchema>;

export const SaveProjectManagerSchema = z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1, 'name is required').max(60),
    colour: hex,
    sort_order: z.number().int().min(0).optional(),
    is_active: z.boolean().optional(),
});
export type SaveProjectManagerInput = z.infer<typeof SaveProjectManagerSchema>;
