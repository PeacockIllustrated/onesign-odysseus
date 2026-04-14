// lib/artwork/actions.test.ts
// Schema-level tests for the Phase 1 CreateArtworkJobInput discriminated union.
// Business-logic tests that hit supabase live in integration suites.

import { describe, it, expect } from 'vitest';
import { CreateArtworkJobInputSchema } from './types';

// Valid v4 UUIDs for testing (Zod 4 enforces UUID version).
const ITEM_UUID = '11111111-1111-4111-8111-111111111111';
const ORG_UUID = '22222222-2222-4222-8222-222222222222';

describe('CreateArtworkJobInputSchema', () => {
    it('rejects input with no kind', () => {
        const res = CreateArtworkJobInputSchema.safeParse({
            job_name: 'x',
        });
        expect(res.success).toBe(false);
    });

    it('accepts a linked input with job_item_id', () => {
        const res = CreateArtworkJobInputSchema.safeParse({
            kind: 'linked',
            job_name: 'main',
            job_item_id: ITEM_UUID,
        });
        expect(res.success).toBe(true);
    });

    it('rejects linked input missing job_item_id', () => {
        const res = CreateArtworkJobInputSchema.safeParse({
            kind: 'linked',
            job_name: 'main',
        });
        expect(res.success).toBe(false);
    });

    it('rejects orphan input without acknowledge_orphan', () => {
        const res = CreateArtworkJobInputSchema.safeParse({
            kind: 'orphan',
            job_name: 'rework',
            org_id: ORG_UUID,
        });
        expect(res.success).toBe(false);
    });

    it('rejects orphan input with acknowledge_orphan=false', () => {
        const res = CreateArtworkJobInputSchema.safeParse({
            kind: 'orphan',
            job_name: 'rework',
            org_id: ORG_UUID,
            acknowledge_orphan: false,
        });
        expect(res.success).toBe(false);
    });

    it('accepts orphan input with org_id and acknowledge_orphan=true', () => {
        const res = CreateArtworkJobInputSchema.safeParse({
            kind: 'orphan',
            job_name: 'warranty rework',
            org_id: ORG_UUID,
            acknowledge_orphan: true,
        });
        expect(res.success).toBe(true);
    });

    it('rejects orphan input missing org_id', () => {
        const res = CreateArtworkJobInputSchema.safeParse({
            kind: 'orphan',
            job_name: 'rework',
            acknowledge_orphan: true,
        });
        expect(res.success).toBe(false);
    });

    it('rejects empty job_name on linked path', () => {
        const res = CreateArtworkJobInputSchema.safeParse({
            kind: 'linked',
            job_name: '',
            job_item_id: ITEM_UUID,
        });
        expect(res.success).toBe(false);
    });
});
