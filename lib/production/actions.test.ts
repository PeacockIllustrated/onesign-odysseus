import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockSupabase } from '@/lib/__mocks__/supabase';

// Hoisted bag so the mock factory can be swapped per test. Initialised
// lazily — referencing createMockSupabase here would hit the hoisted-
// import dance and fail with "Cannot access ... before initialization".
const mockBag = vi.hoisted(() => ({ current: null as any }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/supabase-server', () => ({
    createServerClient: async () => mockBag.current.client,
}));

vi.mock('@/lib/auth', () => ({
    getUser: vi.fn(async () => ({ id: 'test-user-id', email: 'tester@onesign.local' })),
    requireSuperAdminOrError: vi.fn(async () => ({ ok: true })),
    requireAdmin: vi.fn(async () => undefined),
}));

// queries.ts is imported at the top of actions.ts but only its exports are
// used by un-tested actions; stub to keep the module graph happy.
vi.mock('./queries', () => ({
    getJobDetail: vi.fn(),
    getAcceptedQuotesWithoutJobs: vi.fn(),
    getShopFloorQueue: vi.fn(),
    getProductionStages: vi.fn(),
}));

// Deliveries module is dynamic-imported by advanceItemToNextRoutedStage's
// auto-delivery branch. Stub to avoid pulling its real dependencies.
vi.mock('@/lib/deliveries/actions', () => ({
    autoCreateDeliveryForCompletedJob: vi.fn(async () => ({ ok: true })),
}));

import { moveJobItemToStage, advanceItemToNextRoutedStage } from './actions';

// ---------------------------------------------------------------------------
// Helpers
//
// moveJobItemToStage issues these reads in order:
//   1. job_items.select          → { job_id, current_stage_id }
//   2. production_stages.select  → { slug }                    (from-stage check)
//   3. artwork_jobs.select       → { id, status } | null       (gate)
//   4. job_items.update
//   5. job_stage_log.insert
//   6. production_stages.select  → { is_approval_stage }       (target stage)
//   7. artwork_jobs.select       → { id } | null               (only if 6 returns approval)
//
// The mock factory returns one configured result per (table, op) pair, so
// production_stages.select needs a "fat" object satisfying both call sites.
// Likewise artwork_jobs.select handles both the gate check and the
// auto-create check.
// ---------------------------------------------------------------------------

function configureBag(opts: {
    jobItem: { job_id: string; current_stage_id: string | null };
    fromStageSlug: string;
    targetStageIsApproval?: boolean;
    linkedArtwork?: { id: string; status: string } | null;
    updateError?: { message: string } | null;
}) {
    mockBag.current = createMockSupabase({
        tables: {
            job_items: {
                select: { data: opts.jobItem, error: null },
                update: { data: null, error: opts.updateError ?? null },
            },
            production_stages: {
                select: {
                    data: {
                        slug: opts.fromStageSlug,
                        is_approval_stage: opts.targetStageIsApproval ?? false,
                    },
                    error: null,
                },
            },
            artwork_jobs: {
                select: {
                    data: opts.linkedArtwork ?? null,
                    error: null,
                },
                insert: { data: null, error: null },
            },
            job_stage_log: {
                insert: { data: null, error: null },
            },
        },
    });
}

describe('moveJobItemToStage — artwork-approval gate', () => {
    beforeEach(() => {
        // Fresh bag each test; individual tests override with configureBag().
        mockBag.current = createMockSupabase();
    });

    it('rejects forward move from artwork-approval when linked artwork is in_progress', async () => {
        configureBag({
            jobItem: { job_id: 'j1', current_stage_id: 'stage-artwork' },
            fromStageSlug: 'artwork-approval',
            linkedArtwork: { id: 'aw1', status: 'in_progress' },
        });

        const res = await moveJobItemToStage('item-1', 'stage-cnc');

        expect('error' in res).toBe(true);
        if ('error' in res) {
            expect(res.error).toMatch(/Artwork sign-off not complete/i);
        }
        // Critically, no update or stage_log write should have happened.
        expect(mockBag.current.calls.update).toHaveLength(0);
        expect(mockBag.current.calls.insert).toHaveLength(0);
    });

    it('allows forward move from artwork-approval when linked artwork is completed', async () => {
        configureBag({
            jobItem: { job_id: 'j1', current_stage_id: 'stage-artwork' },
            fromStageSlug: 'artwork-approval',
            linkedArtwork: { id: 'aw1', status: 'completed' },
            targetStageIsApproval: false,
        });

        const res = await moveJobItemToStage('item-1', 'stage-cnc');

        expect('success' in res).toBe(true);
        // Update wrote new stage + in_progress status.
        expect(mockBag.current.calls.update[0]).toMatchObject({
            current_stage_id: 'stage-cnc',
            status: 'in_progress',
        });
        // Stage transition was logged.
        const logEntry = mockBag.current.calls.insert.find((i: any) => i.from_stage_id !== undefined);
        expect(logEntry).toMatchObject({
            job_id: 'j1',
            job_item_id: 'item-1',
            from_stage_id: 'stage-artwork',
            to_stage_id: 'stage-cnc',
        });
    });

    it('allows forward move when no artwork is linked (service-only item)', async () => {
        configureBag({
            jobItem: { job_id: 'j1', current_stage_id: 'stage-artwork' },
            fromStageSlug: 'artwork-approval',
            linkedArtwork: null,
        });

        const res = await moveJobItemToStage('item-1', 'stage-goods-out');
        expect('success' in res).toBe(true);
    });

    it('does not run the gate when from-stage is not artwork-approval', async () => {
        configureBag({
            jobItem: { job_id: 'j1', current_stage_id: 'stage-cnc' },
            fromStageSlug: 'cnc-routing',
            // Even if a linked artwork is "in_progress", a non-artwork
            // from-stage means the gate doesn't apply.
            linkedArtwork: { id: 'aw1', status: 'in_progress' },
        });

        const res = await moveJobItemToStage('item-1', 'stage-vinyl');
        expect('success' in res).toBe(true);
    });

    it('returns "Item not found" when the job_item lookup is empty', async () => {
        mockBag.current = createMockSupabase({
            tables: {
                job_items: { select: { data: null, error: null } },
            },
        });
        const res = await moveJobItemToStage('missing', 'stage-x');
        expect('error' in res).toBe(true);
        if ('error' in res) expect(res.error).toBe('Item not found');
    });

    it('returns "Not authenticated" when getUser is null', async () => {
        const { getUser } = await import('@/lib/auth');
        vi.mocked(getUser).mockResolvedValueOnce(null as any);
        const res = await moveJobItemToStage('item-1', 'stage-x');
        expect('error' in res).toBe(true);
        if ('error' in res) expect(res.error).toBe('Not authenticated');
    });
});

describe('advanceItemToNextRoutedStage — artwork-approval gate on completion-fallback', () => {
    beforeEach(() => {
        mockBag.current = createMockSupabase();
    });

    it('rejects completion when item is at artwork-approval (last in routing) with incomplete artwork', async () => {
        // Routing has only one stage = the current one, so the forward
        // branch is skipped and the completion-fallback branch runs.
        // That branch re-checks the artwork gate before flipping status.
        mockBag.current = createMockSupabase({
            tables: {
                job_items: {
                    select: {
                        data: {
                            id: 'item-1',
                            job_id: 'j1',
                            current_stage_id: 'stage-artwork',
                            stage_routing: ['stage-artwork'],
                            status: 'pending',
                        },
                        error: null,
                    },
                    update: { data: null, error: null },
                },
                production_stages: {
                    select: { data: { slug: 'artwork-approval' }, error: null },
                },
                artwork_jobs: {
                    select: { data: { id: 'aw1', status: 'in_progress' }, error: null },
                },
            },
        });

        const res = await advanceItemToNextRoutedStage('item-1');

        expect('error' in res).toBe(true);
        if ('error' in res) {
            expect(res.error).toMatch(/Artwork sign-off not complete/i);
        }
        // Crucially: the item must NOT have been marked completed.
        const flippedToCompleted = mockBag.current.calls.update.some(
            (u: any) => u?.status === 'completed'
        );
        expect(flippedToCompleted).toBe(false);
    });
});

describe('advanceItemToNextRoutedStage — malformed routing (G5)', () => {
    it('errors instead of silently completing when routing is empty', async () => {
        mockBag.current = createMockSupabase({
            tables: {
                job_items: {
                    select: {
                        data: {
                            id: 'item-1',
                            job_id: 'j1',
                            current_stage_id: 'stage-x',
                            stage_routing: [],
                            status: 'pending',
                        },
                        error: null,
                    },
                    update: { data: null, error: null },
                },
                // No linked artwork → as-built QC gate is a no-op.
                artwork_jobs: { select: { data: null, error: null } },
            },
        });

        const res = await advanceItemToNextRoutedStage('item-1');

        expect('error' in res).toBe(true);
        if ('error' in res) expect(res.error).toMatch(/no valid production routing/i);
        // Must NOT mark the item completed (the old silent-complete bug).
        const flippedToCompleted = mockBag.current.calls.update.some(
            (u: any) => u?.status === 'completed'
        );
        expect(flippedToCompleted).toBe(false);
    });
});

describe('advanceItemToNextRoutedStage — as-built QC soft gate (B3)', () => {
    it('asks for override when sub-items at the current stage are not QC-checked', async () => {
        mockBag.current = createMockSupabase({
            tables: {
                job_items: {
                    select: {
                        data: {
                            id: 'item-1',
                            job_id: 'j1',
                            current_stage_id: 'stage-cnc',
                            stage_routing: ['stage-cnc', 'stage-goods'],
                            status: 'in_progress',
                        },
                        error: null,
                    },
                    update: { data: null, error: null },
                },
                artwork_jobs: { select: { data: { id: 'aw1' }, error: null } },
                artwork_components: {
                    select: {
                        data: [
                            {
                                name: 'Panel',
                                sub_items: [
                                    {
                                        label: 'A',
                                        name: 'letters',
                                        target_stage_id: 'stage-cnc',
                                        as_built_signed_off_at: null,
                                    },
                                ],
                            },
                        ],
                        error: null,
                    },
                },
            },
        });

        const res = await advanceItemToNextRoutedStage('item-1');

        expect('requiresOverride' in res).toBe(true);
        if ('requiresOverride' in res) {
            expect(res.warnings.join(' ')).toMatch(/letters.*not QC-checked/i);
        }
        // No stage change should have been written yet.
        expect(mockBag.current.calls.update).toHaveLength(0);
    });
});
