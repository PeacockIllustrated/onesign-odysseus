import { z } from 'zod';
import { PanelParamsSchema, type PanelParams } from '@/lib/visualiser/types';

/**
 * Triage states for an inbound public design request. 'new' on arrival; staff
 * move it along as they pick it up, price it, and close it out. 'quoted' is the
 * hook point for the future Stripe-served package-pricing flow.
 */
export const DESIGN_REQUEST_STATUSES = [
    'new',
    'reviewing',
    'quoted',
    'won',
    'closed',
] as const;
export type DesignRequestStatus = (typeof DESIGN_REQUEST_STATUSES)[number];

export const DESIGN_REQUEST_STATUS_LABELS: Record<DesignRequestStatus, string> =
    {
        new: 'New',
        reviewing: 'Reviewing',
        quoted: 'Quoted',
        won: 'Won',
        closed: 'Closed',
    };

/**
 * Payload the public /design studio sends when a customer submits their sign.
 *
 * `companyWebsite` is a honeypot — a hidden field no real human fills in. When
 * it's non-empty we treat the submission as a bot and silently no-op (see the
 * server action). It is never persisted.
 *
 * The design travels as the same PanelParams the internal visualiser uses, so a
 * staff member can open it in the real tool with one click — full fidelity, no
 * lossy "public" subset.
 */
export const SubmitDesignRequestSchema = z.object({
    customerName: z.string().trim().min(1, 'Your name is required').max(200),
    customerEmail: z
        .string()
        .trim()
        .email('Enter a valid email address')
        .max(200),
    customerPhone: z.string().trim().max(60).optional().or(z.literal('')),
    company: z.string().trim().max(200).optional().or(z.literal('')),
    postcode: z.string().trim().max(20).optional().or(z.literal('')),
    projectNotes: z
        .string()
        .trim()
        .max(4000)
        .optional()
        .or(z.literal('')),
    /** Human-readable summary of the construction, derived client-side. */
    signType: z.string().trim().max(200).optional().or(z.literal('')),
    params: PanelParamsSchema,
    svgSource: z.string().max(5_000_000).nullable().optional(),
    /** Face-on PNG preview as a data URL (kept small via trim/quality). */
    thumbnail: z.string().max(4_000_000).nullable().optional(),
    /**
     * Honeypot — a real submission leaves this empty. We DON'T reject a
     * non-empty value at the schema level (that would surface a validation
     * error); the action inspects it and silently no-ops so a bot gets no
     * signal it was caught. Never persisted.
     */
    companyWebsite: z.string().max(200).optional(),
});
export type SubmitDesignRequestInput = z.infer<
    typeof SubmitDesignRequestSchema
>;

export const UpdateDesignRequestStatusSchema = z.object({
    id: z.string().uuid(),
    status: z.enum(DESIGN_REQUEST_STATUSES),
});

/** A row from the design_requests table (migration 060). */
export interface DesignRequestRow {
    id: string;
    reference: string;
    customer_name: string;
    customer_email: string;
    customer_phone: string | null;
    company: string | null;
    postcode: string | null;
    project_notes: string | null;
    sign_type: string | null;
    params_json: PanelParams;
    svg_source: string | null;
    thumbnail: string | null;
    status: DesignRequestStatus;
    design_id: string | null;
    created_at: string;
    updated_at: string;
}
