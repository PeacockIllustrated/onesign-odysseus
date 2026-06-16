// lib/artwork/approval-actions.test.ts
//
// Regression coverage for submitApproval on the *variant-based* visual
// approval path (the VariantPicker flow). These jobs carry the client's
// choice in `variant_selections` and have NO artwork_component_items, so the
// per-sub-item decision validation must be skipped for them — otherwise every
// component is treated as a "no sub-items" component and the sign-off is
// rejected with "every component must be approved or have changes requested",
// leaving the job stuck and the client unable to accept anything.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockSupabase, type MockConfig } from '@/lib/__mocks__/supabase';

// Hoisted bag so the mock client can be swapped per test (see the same
// pattern in lib/production/actions.test.ts).
const mockBag = vi.hoisted(() => ({ current: null as any }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
// approval-actions imports both clients at module load; submitApproval itself
// only uses the admin client, but supabase-server must be stubbed too so the
// real module (and its `server-only` import) never loads under Vitest.
vi.mock('@/lib/supabase-server', () => ({ createServerClient: async () => mockBag.current.client }));
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: () => mockBag.current.client }));
vi.mock('@/lib/auth', () => ({ getUser: vi.fn(async () => ({ id: 'test-user-id' })) }));

import { submitApproval } from './approval-actions';

const APPROVAL = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const JOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const COMP1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const COMP2 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const VAR1 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const VAR2 = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const future = () => new Date(Date.now() + 7 * 86_400_000).toISOString();

function configFor(components: Array<{ id: string; variants: Array<{ id: string }> }>): MockConfig {
    return {
        tables: {
            artwork_approvals: {
                select: {
                    data: { id: APPROVAL, status: 'pending', expires_at: future(), job_id: JOB },
                    error: null,
                },
                update: { data: null, error: null },
            },
            artwork_jobs: {
                select: { data: { id: JOB, job_type: 'visual_approval', status: 'in_progress' }, error: null },
                update: { data: null, error: null },
            },
            artwork_components: { select: { data: components, error: null } },
            artwork_variants: { update: { data: null, error: null } },
            artwork_component_decisions: { delete: { data: null, error: null }, insert: { data: null, error: null } },
        },
    };
}

const baseInput = {
    client_name: 'Jane Client',
    client_email: 'jane@crysalis.co',
    signature_data: 'data:image/png;base64,AAAA',
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe('submitApproval — variant-based visual approval', () => {
    it('accepts a complete variant selection and completes the job', async () => {
        mockBag.current = createMockSupabase(configFor([{ id: COMP1, variants: [{ id: VAR1 }] }]));

        const result = await submitApproval(APPROVAL, {
            ...baseInput,
            component_decisions: [],
            variant_selections: [{ componentId: COMP1, variantId: VAR1 }],
        });

        // The bug: this used to fail with "every component must be approved
        // or have changes requested" because the sub-item validation block
        // ran against a job that has variants, not sub-items.
        expect(result).toEqual({ success: true });

        // The chosen variant is marked, and the job flips to completed.
        expect(mockBag.current.calls.update).toContainEqual(
            expect.objectContaining({ is_chosen: true })
        );
        expect(mockBag.current.calls.update).toContainEqual(
            expect.objectContaining({ status: 'completed' })
        );
        // No per-component decisions are written on the variant path.
        expect(mockBag.current.calls.insert).toHaveLength(0);
    });

    it('still rejects when a component has no chosen variant', async () => {
        mockBag.current = createMockSupabase(
            configFor([
                { id: COMP1, variants: [{ id: VAR1 }] },
                { id: COMP2, variants: [{ id: VAR2 }] },
            ])
        );

        const result = await submitApproval(APPROVAL, {
            ...baseInput,
            component_decisions: [],
            // Only one of the two components is chosen.
            variant_selections: [{ componentId: COMP1, variantId: VAR1 }],
        });

        expect(result).toHaveProperty('error');
        expect((result as { error: string }).error).toContain('no chosen variant');
        // Job must NOT be completed when the selection is incomplete.
        expect(mockBag.current.calls.update).not.toContainEqual(
            expect.objectContaining({ status: 'completed' })
        );
    });
});
