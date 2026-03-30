/**
 * Types and Zod schemas for Artwork Client Approval System
 * Matches database schema from migration 018
 */

import { z } from 'zod';

// =============================================================================
// ENUMS
// =============================================================================

export const ApprovalStatusEnum = z.enum(['pending', 'approved', 'expired', 'revoked']);
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
    approved_at: z.string().nullable(),
    created_by: z.string().uuid().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
});
export type ArtworkApproval = z.infer<typeof ArtworkApprovalSchema>;

// =============================================================================
// INPUT SCHEMAS
// =============================================================================

export const SubmitApprovalInputSchema = z.object({
    client_name: z.string().min(1, 'your name is required'),
    client_email: z.string().email('valid email is required'),
    client_company: z.string().optional(),
    signature_data: z.string().min(1, 'signature is required'),
});
export type SubmitApprovalInput = z.infer<typeof SubmitApprovalInputSchema>;
