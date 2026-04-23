/**
 * Types and Zod schemas for Artwork Client Approval System
 * Matches database schema from migration 018
 */

import { z } from 'zod';

// =============================================================================
// ENUMS
// =============================================================================

export const ApprovalStatusEnum = z.enum(['pending', 'approved', 'expired', 'revoked', 'changes_requested']);
export type ApprovalStatus = z.infer<typeof ApprovalStatusEnum>;

// =============================================================================
// DATABASE ROW TYPE
// =============================================================================

export const ArtworkApprovalSchema = z.object({
    id: z.string().uuid(),
    job_id: z.string().uuid(),
    token: z.string(),
    status: ApprovalStatusEnum,
    expires_at: z.string(),
    client_name: z.string().nullable(),
    client_email: z.string().nullable(),
    client_company: z.string().nullable(),
    signature_data: z.string().nullable(),
    client_comments: z.string().nullable().optional(),
    approved_at: z.string().nullable(),
    created_by: z.string().uuid().nullable(),
    // Snapshot fields (migration 041) — frozen at link-generation time so the
    // signed approval remains faithful even if the org data later changes.
    snapshot_contact_name: z.string().nullable().optional(),
    snapshot_contact_email: z.string().nullable().optional(),
    snapshot_site_name: z.string().nullable().optional(),
    snapshot_site_address: z.string().nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
});
export type ArtworkApproval = z.infer<typeof ArtworkApprovalSchema>;

// =============================================================================
// INPUT SCHEMAS
// =============================================================================

export const ComponentDecisionEnum = z.enum(['approved', 'changes_requested']);
export type ComponentDecision = z.infer<typeof ComponentDecisionEnum>;

export const ComponentDecisionInputSchema = z.object({
    componentId: z.string().uuid(),
    // When present, the decision is scoped to a specific sub-item (design
    // variant). When absent, it covers the entire component — used for
    // components that have no sub-items.
    subItemId: z.string().uuid().optional().nullable(),
    decision: ComponentDecisionEnum,
    comment: z.string().max(2000).optional().nullable(),
});
export type ComponentDecisionInput = z.infer<typeof ComponentDecisionInputSchema>;

export const SubmitApprovalInputSchema = z.object({
    client_name: z.string().min(1, 'your name is required'),
    client_email: z.string().email('valid email is required'),
    client_company: z.string().optional(),
    signature_data: z.string().min(1, 'signature is required'),
    client_comments: z.string().max(2000).optional(),
    // Per-line decisions. Required for production jobs; optional for visual
    // approval jobs (where variant selection is the decision).
    component_decisions: z.array(ComponentDecisionInputSchema).optional(),
    variant_selections: z.array(z.object({
        componentId: z.string().uuid(),
        variantId: z.string().uuid(),
    })).optional(),
});
export type SubmitApprovalInput = z.infer<typeof SubmitApprovalInputSchema>;

// Row type for artwork_component_decisions (migrations 051 + 053).
export interface ArtworkComponentDecision {
    id: string;
    approval_id: string;
    component_id: string;
    /** Nullable — set when decision is scoped to a single sub-item. */
    sub_item_id: string | null;
    decision: ComponentDecision;
    comment: string | null;
    decided_at: string;
}
