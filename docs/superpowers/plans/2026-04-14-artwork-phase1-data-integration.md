# Artwork Compliance Phase 1 — Data Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote `artwork_jobs.org_id` to source of truth, unify the dashboard into one filtered list, and make the quote → production → artwork lineage queryable in one hop.

**Architecture:** Three sequential migrations (backfill → view → CHECK gate), a reconciliation UI to clean unmatched historic jobs, server-action rewrites that drop the free-text `client_name` assumption, and a rewritten `/admin/artwork` page with filter chips and ghost rows. Rollout is staged behind a feature flag so migration 038's CHECK only ships after reconciliation is empty.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres + RLS), Zod, React Hook Form, Vitest. Spec reference: `docs/superpowers/specs/2026-04-14-artwork-phase1-data-integration-design.md`.

---

## File Structure

### Create
- `supabase/migrations/036_artwork_org_linkage.sql`
- `supabase/migrations/037_artwork_lineage_view.sql`
- `supabase/migrations/038_artwork_org_check.sql`
- `lib/artwork/reconcile-actions.ts`
- `lib/artwork/reconcile-actions.test.ts`
- `lib/artwork/actions.test.ts` (only if it does not already exist — check first)
- `lib/feature-flags.ts` (if it does not already exist — check first)
- `app/(portal)/admin/artwork/reconcile/page.tsx`
- `app/(portal)/admin/artwork/reconcile/ReconcileRow.tsx`

### Modify
- `lib/artwork/types.ts` — add `clientNameSnapshot`, `isOrphan`; relax `CreateArtworkJobInputSchema`; add `ArtworkJobLineage`, filter enums
- `lib/artwork/actions.ts` — rewrite `createArtworkJob`, `getArtworkJobs`; add `getArtworkJobLineage`, `getArtworkDashboardData`; delete `getProductionItemsAtArtworkStage`
- `app/(portal)/admin/artwork/StartArtworkButton.tsx` — inherit `org_id` from production job
- `app/(portal)/admin/artwork/page.tsx` — unified dashboard with filter chips + ghost rows
- `app/(portal)/admin/artwork/new/page.tsx` — link-to-production primary path + orphan escape hatch
- `app/(portal)/admin/artwork/[id]/page.tsx` — lineage breadcrumb at top

---

## Task 1: Migration 036 — org linkage columns + backfill

**Files:**
- Create: `supabase/migrations/036_artwork_org_linkage.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 036: artwork_jobs org linkage
-- Phase 1 of artwork integration refactor.
-- - Adds client_name_snapshot (preserves legacy free-text)
-- - Adds is_orphan flag (explicit marker for jobs with no org)
-- - Ensures org_id FK exists
-- - Backfills org_id for rows where client_name matches exactly one org name

BEGIN;

ALTER TABLE public.artwork_jobs
  ADD COLUMN IF NOT EXISTS client_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS is_orphan BOOLEAN NOT NULL DEFAULT false;

-- Ensure FK on org_id (migration 015 created the column but may have skipped the constraint)
ALTER TABLE public.artwork_jobs
  DROP CONSTRAINT IF EXISTS artwork_jobs_org_id_fkey;
ALTER TABLE public.artwork_jobs
  ADD CONSTRAINT artwork_jobs_org_id_fkey
  FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_artwork_jobs_org_id
  ON public.artwork_jobs(org_id);

CREATE INDEX IF NOT EXISTS idx_artwork_jobs_is_orphan
  ON public.artwork_jobs(is_orphan) WHERE is_orphan = true;

-- Backfill: snapshot legacy client_name and auto-link exact matches.
DO $$
BEGIN
  UPDATE public.artwork_jobs
    SET client_name_snapshot = client_name
    WHERE client_name_snapshot IS NULL;

  UPDATE public.artwork_jobs aj
    SET org_id = o.id
    FROM public.orgs o
    WHERE aj.org_id IS NULL
      AND aj.client_name IS NOT NULL
      AND LOWER(TRIM(aj.client_name)) = LOWER(TRIM(o.name))
      AND (
        SELECT COUNT(*) FROM public.orgs o2
        WHERE LOWER(TRIM(o2.name)) = LOWER(TRIM(aj.client_name))
      ) = 1;
END $$;

COMMENT ON COLUMN public.artwork_jobs.client_name_snapshot IS
  'Historical free-text client name preserved from pre-Phase-1 jobs. Read-only.';
COMMENT ON COLUMN public.artwork_jobs.is_orphan IS
  'True when the job has no org link (e.g. warranty/rework). Explicit opt-in at creation.';

COMMIT;
```

- [ ] **Step 2: Apply locally and verify**

Run: `npx supabase db reset` (or `supabase migration up` depending on your local workflow).
Expected: Migration applies without error. Spot-check with:

```sql
SELECT COUNT(*) FILTER (WHERE org_id IS NOT NULL) AS linked,
       COUNT(*) FILTER (WHERE org_id IS NULL AND is_orphan = false) AS unmatched,
       COUNT(*) FILTER (WHERE is_orphan = true) AS orphans
FROM public.artwork_jobs;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/036_artwork_org_linkage.sql
git commit -m "feat(artwork): add org linkage columns and backfill exact matches"
```

---

## Task 2: Migration 037 — lineage view

**Files:**
- Create: `supabase/migrations/037_artwork_lineage_view.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 037: artwork_job_lineage view
-- Surfaces quote → production_job → artwork trail in one query.

BEGIN;

CREATE OR REPLACE VIEW public.artwork_job_lineage AS
SELECT
  aj.id            AS artwork_job_id,
  aj.job_reference AS artwork_reference,
  aj.org_id,
  ji.id            AS job_item_id,
  pj.id            AS production_job_id,
  pj.job_number    AS production_job_number,
  pj.quote_id,
  q.quote_number
FROM public.artwork_jobs aj
LEFT JOIN public.job_items       ji ON ji.id = aj.job_item_id
LEFT JOIN public.production_jobs pj ON pj.id = ji.job_id
LEFT JOIN public.quotes           q ON q.id = pj.quote_id;

-- Super-admin RLS is inherited through the base tables.
COMMENT ON VIEW public.artwork_job_lineage IS
  'One-hop lineage from artwork_job to originating quote (where applicable).';

COMMIT;
```

- [ ] **Step 2: Apply locally and verify**

```sql
SELECT * FROM public.artwork_job_lineage LIMIT 5;
```
Expected: Rows returned with `quote_number` populated for jobs linked via production.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/037_artwork_lineage_view.sql
git commit -m "feat(artwork): add artwork_job_lineage view"
```

---

## Task 3: Update artwork types

**Files:**
- Modify: `lib/artwork/types.ts`

- [ ] **Step 1: Extend `ArtworkJobSchema`**

In `lib/artwork/types.ts`, replace the `ArtworkJobSchema` definition (currently lines 74–90) with:

```typescript
export const ArtworkJobSchema = z.object({
    id: z.string().uuid(),
    job_name: z.string(),
    job_reference: z.string(),
    client_name: z.string().nullable(),
    client_name_snapshot: z.string().nullable(),
    org_id: z.string().uuid().nullable(),
    is_orphan: z.boolean(),
    contact_id: z.string().uuid().nullable(),
    description: z.string().nullable(),
    cover_image_path: z.string().nullable(),
    panel_size: z.string().nullable(),
    paint_colour: z.string().nullable(),
    status: ArtworkJobStatusEnum,
    job_item_id: z.string().uuid().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
    created_by: z.string().uuid().nullable(),
});
```

- [ ] **Step 2: Replace `CreateArtworkJobInputSchema`**

Replace the existing `CreateArtworkJobInputSchema` (currently lines 197–203) with a discriminated-union that enforces either a `job_item_id` (normal path) or `is_orphan: true` + `org_id` (orphan path):

```typescript
const LinkedCreateArtworkJobInputSchema = z.object({
    kind: z.literal('linked'),
    job_name: z.string().min(1, 'job name is required'),
    job_item_id: z.string().uuid(),
    description: z.string().optional(),
});

const OrphanCreateArtworkJobInputSchema = z.object({
    kind: z.literal('orphan'),
    job_name: z.string().min(1, 'job name is required'),
    org_id: z.string().uuid('org is required for orphan jobs'),
    contact_id: z.string().uuid().optional(),
    description: z.string().optional(),
    acknowledge_orphan: z.literal(true, {
        error: 'orphan jobs require explicit acknowledgement',
    }),
});

export const CreateArtworkJobInputSchema = z.discriminatedUnion('kind', [
    LinkedCreateArtworkJobInputSchema,
    OrphanCreateArtworkJobInputSchema,
]);
export type CreateArtworkJobInput = z.infer<typeof CreateArtworkJobInputSchema>;
```

- [ ] **Step 3: Add dashboard filter + lineage types**

At the bottom of `lib/artwork/types.ts`, append:

```typescript
// =============================================================================
// PHASE 1 — DASHBOARD + LINEAGE
// =============================================================================

export const ArtworkDashboardFilterEnum = z.enum([
    'all',
    'awaiting_start',
    'in_progress',
    'awaiting_approval',
    'flagged',
    'completed',
    'orphans',
]);
export type ArtworkDashboardFilter = z.infer<typeof ArtworkDashboardFilterEnum>;

export interface ArtworkJobLineage {
    quoteId: string | null;
    quoteNumber: string | null;
    productionJobId: string | null;
    productionJobNumber: string | null;
    jobItemId: string | null;
}

export interface ArtworkGhostRow {
    jobItemId: string;
    jobItemDescription: string;
    itemNumber: string | null;
    productionJobNumber: string;
    clientName: string;
    orgId: string | null;
    dueDate: string | null;
    priority: string;
}

export interface ArtworkDashboardData {
    jobs: (ArtworkJob & { client_approved: boolean; flagged_count: number })[];
    ghostRows: ArtworkGhostRow[];
    counts: Record<ArtworkDashboardFilter, number>;
}
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No type errors introduced by these changes. If the compiler complains elsewhere, that's because downstream callers use the old `CreateArtworkJobInput` shape — those will be fixed in Task 4.

- [ ] **Step 5: Commit**

```bash
git add lib/artwork/types.ts
git commit -m "feat(artwork): extend types for org linkage, orphans, and dashboard filters"
```

---

## Task 4: Refactor `createArtworkJob` server action

**Files:**
- Modify: `lib/artwork/actions.ts` (the `createArtworkJob` function, currently lines 43–79)
- Modify/Create: `lib/artwork/actions.test.ts`

- [ ] **Step 1: Write failing tests**

Create or extend `lib/artwork/actions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createArtworkJob } from './actions';

// Stub auth + supabase. Adjust import paths if the repo uses a shared test mock helper.
vi.mock('@/lib/auth', () => ({
    getUser: vi.fn().mockResolvedValue({ id: '00000000-0000-0000-0000-000000000001' }),
}));

const insertMock = vi.fn();
const selectSingleMock = vi.fn();
const fromMock = vi.fn();

vi.mock('@/lib/supabase-server', () => ({
    createServerClient: async () => ({
        from: fromMock,
    }),
}));

beforeEach(() => {
    vi.clearAllMocks();
    fromMock.mockImplementation((table: string) => {
        if (table === 'artwork_jobs') {
            return {
                insert: insertMock.mockReturnValue({
                    select: () => ({
                        single: selectSingleMock.mockResolvedValue({
                            data: { id: 'new-job-id' },
                            error: null,
                        }),
                    }),
                }),
            };
        }
        if (table === 'job_items') {
            return {
                select: () => ({
                    eq: () => ({
                        single: () => Promise.resolve({
                            data: {
                                id: 'item-1',
                                production_jobs: { org_id: 'org-xyz' },
                            },
                            error: null,
                        }),
                    }),
                }),
            };
        }
        throw new Error(`unexpected table: ${table}`);
    });
});

describe('createArtworkJob', () => {
    it('rejects when kind is missing', async () => {
        const res = await createArtworkJob({ job_name: 'x' } as any);
        expect(res).toHaveProperty('error');
    });

    it('orphan path requires acknowledge_orphan=true', async () => {
        const res = await createArtworkJob({
            kind: 'orphan',
            job_name: 'rework',
            org_id: '00000000-0000-0000-0000-000000000099',
        } as any);
        expect(res).toHaveProperty('error');
    });

    it('linked path inherits org_id from production job', async () => {
        const res = await createArtworkJob({
            kind: 'linked',
            job_name: 'main',
            job_item_id: '00000000-0000-0000-0000-000000000011',
        });
        expect(res).toEqual({ id: 'new-job-id' });
        expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
            job_item_id: '00000000-0000-0000-0000-000000000011',
            org_id: 'org-xyz',
            is_orphan: false,
        }));
    });

    it('orphan path writes is_orphan=true and supplied org_id', async () => {
        const res = await createArtworkJob({
            kind: 'orphan',
            job_name: 'warranty rework',
            org_id: '00000000-0000-0000-0000-000000000099',
            acknowledge_orphan: true,
        });
        expect(res).toEqual({ id: 'new-job-id' });
        expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
            org_id: '00000000-0000-0000-0000-000000000099',
            is_orphan: true,
            job_item_id: null,
        }));
    });
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `npx vitest run lib/artwork/actions.test.ts`
Expected: All four tests fail (current `createArtworkJob` doesn't know about `kind` or orphan).

- [ ] **Step 3: Replace `createArtworkJob` implementation**

In `lib/artwork/actions.ts`, replace the `createArtworkJob` function (currently lines 43–79) with:

```typescript
export async function createArtworkJob(
    input: CreateArtworkJobInput
): Promise<{ id: string } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const validation = CreateArtworkJobInputSchema.safeParse(input);
    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }
    const parsed = validation.data;

    const supabase = await createServerClient();

    let orgId: string | null = null;
    let jobItemId: string | null = null;
    let isOrphan = false;
    let contactId: string | null = null;

    if (parsed.kind === 'linked') {
        jobItemId = parsed.job_item_id;

        // Inherit org_id from the parent production_job.
        const { data: itemRow, error: itemErr } = await supabase
            .from('job_items')
            .select('id, production_jobs!inner(org_id)')
            .eq('id', jobItemId)
            .single();

        if (itemErr || !itemRow) {
            return { error: 'production item not found' };
        }
        const parentOrg = (itemRow as any).production_jobs?.org_id;
        if (!parentOrg) {
            return { error: 'production job has no organisation' };
        }
        orgId = parentOrg;
    } else {
        // orphan
        isOrphan = true;
        orgId = parsed.org_id;
        contactId = parsed.contact_id ?? null;
    }

    const { data, error } = await supabase
        .from('artwork_jobs')
        .insert({
            job_name: parsed.job_name,
            description: parsed.description ?? null,
            status: 'draft',
            job_item_id: jobItemId,
            org_id: orgId,
            contact_id: contactId,
            is_orphan: isOrphan,
            client_name: null,          // Phase 1 stops writing free-text
            created_by: user.id,
        })
        .select('id')
        .single();

    if (error) {
        // 23505 = unique_violation on partial index (artwork_job already exists for this job_item)
        if ((error as any).code === '23505') {
            return { error: 'artwork job already exists for this production item' };
        }
        console.error('error creating artwork job:', error);
        return { error: error.message };
    }

    revalidatePath('/admin/artwork');
    return { id: data.id };
}
```

- [ ] **Step 4: Run tests and verify they pass**

Run: `npx vitest run lib/artwork/actions.test.ts`
Expected: All four tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/artwork/actions.ts lib/artwork/actions.test.ts
git commit -m "feat(artwork): rewrite createArtworkJob with linked/orphan discriminated union"
```

---

## Task 5: Add `getArtworkJobLineage`

**Files:**
- Modify: `lib/artwork/actions.ts` (append a new function)

- [ ] **Step 1: Add the function**

At the bottom of `lib/artwork/actions.ts`, append:

```typescript
import type { ArtworkJobLineage } from './types';

export async function getArtworkJobLineage(
    artworkJobId: string
): Promise<ArtworkJobLineage | null> {
    const supabase = await createServerClient();

    const { data, error } = await supabase
        .from('artwork_job_lineage')
        .select('quote_id, quote_number, production_job_id, production_job_number, job_item_id')
        .eq('artwork_job_id', artworkJobId)
        .maybeSingle();

    if (error) {
        console.error('error fetching artwork lineage:', error);
        return null;
    }
    if (!data) return null;

    return {
        quoteId: data.quote_id ?? null,
        quoteNumber: data.quote_number ?? null,
        productionJobId: data.production_job_id ?? null,
        productionJobNumber: data.production_job_number ?? null,
        jobItemId: data.job_item_id ?? null,
    };
}
```

Note: if `ArtworkJobLineage` is already exported at the top of the file, remove the duplicate `import type` line. Also remove the duplicate if it shadows the existing `./types` import at the top of the file.

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add lib/artwork/actions.ts
git commit -m "feat(artwork): add getArtworkJobLineage helper"
```

---

## Task 6: Rewrite `getArtworkJobs` + add `getArtworkDashboardData`

**Files:**
- Modify: `lib/artwork/actions.ts` (replace `getArtworkJobs`, delete `getProductionItemsAtArtworkStage`, add `getArtworkDashboardData`)

- [ ] **Step 1: Replace `getArtworkJobs`**

Replace the existing `getArtworkJobs` function (currently lines 1213–1246) with:

```typescript
import type {
    ArtworkDashboardFilter,
    ArtworkDashboardData,
    ArtworkGhostRow,
} from './types';

interface GetArtworkJobsFilters {
    filter?: ArtworkDashboardFilter;
    search?: string;
}

export async function getArtworkJobs(
    filters?: GetArtworkJobsFilters
): Promise<(ArtworkJob & { client_approved: boolean; flagged_count: number })[]> {
    const supabase = await createServerClient();
    const filter = filters?.filter ?? 'all';

    let query = supabase
        .from('artwork_jobs')
        .select(`
            *,
            artwork_approvals(status),
            artwork_components(dimension_flag)
        `)
        .order('created_at', { ascending: false });

    switch (filter) {
        case 'in_progress':
            query = query.in('status', ['draft', 'in_progress', 'design_complete', 'in_production']);
            break;
        case 'completed':
            query = query.eq('status', 'completed');
            break;
        case 'orphans':
            query = query.eq('is_orphan', true);
            break;
        // awaiting_approval, flagged, awaiting_start, all are filtered post-fetch
    }

    if (filters?.search) {
        const s = filters.search.replace(/[%,]/g, '');
        query = query.or(
            `job_name.ilike.%${s}%,job_reference.ilike.%${s}%,client_name_snapshot.ilike.%${s}%`
        );
    }

    const { data, error } = await query;
    if (error) {
        console.error('error fetching artwork jobs:', error);
        return [];
    }

    const rows = (data ?? []).map((row: any) => {
        const approvals = row.artwork_approvals ?? [];
        const components = row.artwork_components ?? [];
        const client_approved = approvals.some((a: any) => a.status === 'approved');
        const pending_approval = approvals.some((a: any) => a.status === 'pending');
        const flagged_count = components.filter(
            (c: any) => c.dimension_flag === 'out_of_tolerance'
        ).length;
        const { artwork_approvals, artwork_components, ...job } = row;
        return {
            ...job,
            client_approved,
            pending_approval,
            flagged_count,
        } as ArtworkJob & {
            client_approved: boolean;
            pending_approval: boolean;
            flagged_count: number;
        };
    });

    if (filter === 'awaiting_approval') {
        return rows.filter((r) => r.pending_approval).map(({ pending_approval, ...rest }) => rest);
    }
    if (filter === 'flagged') {
        return rows.filter((r) => r.flagged_count > 0).map(({ pending_approval, ...rest }) => rest);
    }
    return rows.map(({ pending_approval, ...rest }) => rest);
}
```

- [ ] **Step 2: Delete `getProductionItemsAtArtworkStage`**

Remove the entire function (currently lines 1354–1427) from `lib/artwork/actions.ts`.

- [ ] **Step 3: Add `getArtworkDashboardData`**

Append to `lib/artwork/actions.ts`:

```typescript
export async function getArtworkDashboardData(
    filters?: GetArtworkJobsFilters
): Promise<ArtworkDashboardData> {
    const supabase = await createServerClient();
    const filter = filters?.filter ?? 'all';

    const jobs = await getArtworkJobs(filters);

    // Ghost rows: production items at the artwork stage with no linked artwork_job yet.
    let ghostRows: ArtworkGhostRow[] = [];
    if (filter === 'all' || filter === 'awaiting_start') {
        const { data: stage } = await supabase
            .from('production_stages')
            .select('id')
            .eq('slug', 'artwork-approval')
            .is('org_id', null)
            .single();

        if (stage) {
            const { data: items } = await supabase
                .from('job_items')
                .select(`
                    id, description, item_number,
                    production_jobs!inner(
                        job_number, client_name, org_id, due_date, priority, status
                    )
                `)
                .eq('current_stage_id', stage.id)
                .order('created_at', { ascending: true });

            const activeItems = (items ?? []).filter(
                (i: any) =>
                    i.production_jobs?.status === 'active' ||
                    i.production_jobs?.status === 'paused'
            );

            if (activeItems.length > 0) {
                const { data: existing } = await supabase
                    .from('artwork_jobs')
                    .select('job_item_id')
                    .in('job_item_id', activeItems.map((i: any) => i.id));

                const started = new Set((existing ?? []).map((r: any) => r.job_item_id));

                ghostRows = activeItems
                    .filter((i: any) => !started.has(i.id))
                    .map((i: any) => ({
                        jobItemId: i.id,
                        jobItemDescription: i.description || '',
                        itemNumber: i.item_number || null,
                        productionJobNumber: i.production_jobs.job_number,
                        clientName: i.production_jobs.client_name,
                        orgId: i.production_jobs.org_id ?? null,
                        dueDate: i.production_jobs.due_date ?? null,
                        priority: i.production_jobs.priority ?? 'normal',
                    }));
            }
        }
    }

    // Counts for chip badges. Fetch a light summary.
    const counts: ArtworkDashboardData['counts'] = {
        all: 0,
        awaiting_start: ghostRows.length,
        in_progress: 0,
        awaiting_approval: 0,
        flagged: 0,
        completed: 0,
        orphans: 0,
    };

    const { data: allJobsForCounts } = await supabase
        .from('artwork_jobs')
        .select('id, status, is_orphan, artwork_approvals(status), artwork_components(dimension_flag)');

    (allJobsForCounts ?? []).forEach((row: any) => {
        counts.all += 1;
        if (row.is_orphan) counts.orphans += 1;
        if (row.status === 'completed') counts.completed += 1;
        else counts.in_progress += 1;
        const hasPending = (row.artwork_approvals ?? []).some((a: any) => a.status === 'pending');
        if (hasPending) counts.awaiting_approval += 1;
        const flagged = (row.artwork_components ?? []).some(
            (c: any) => c.dimension_flag === 'out_of_tolerance'
        );
        if (flagged) counts.flagged += 1;
    });
    counts.all += ghostRows.length;

    return { jobs, ghostRows, counts };
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: Pass. If `getProductionItemsAtArtworkStage` is still imported somewhere outside `app/(portal)/admin/artwork/page.tsx`, those call sites must be removed (grep `getProductionItemsAtArtworkStage` across repo). The only expected import is the dashboard page, which Task 11 rewrites.

- [ ] **Step 5: Commit**

```bash
git add lib/artwork/actions.ts
git commit -m "feat(artwork): unify dashboard query; add ghost rows + filter chips"
```

---

## Task 7: Reconciliation server actions

**Files:**
- Create: `lib/artwork/reconcile-actions.ts`
- Create: `lib/artwork/reconcile-actions.test.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/artwork/reconcile-actions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { linkJobToOrg, markJobAsOrphan, listUnmatchedJobs } from './reconcile-actions';

vi.mock('@/lib/auth', () => ({
    getUser: vi.fn().mockResolvedValue({ id: 'user-1' }),
    requireAdmin: vi.fn().mockResolvedValue(true),
}));

const updateMock = vi.fn();
const eqUpdateMock = vi.fn();
const selectListMock = vi.fn();

vi.mock('@/lib/supabase-server', () => ({
    createServerClient: async () => ({
        from: (table: string) => {
            if (table !== 'artwork_jobs') throw new Error(`unexpected table ${table}`);
            return {
                update: updateMock.mockReturnValue({
                    eq: eqUpdateMock.mockResolvedValue({ error: null }),
                }),
                select: () => ({
                    is: () => ({
                        eq: () => ({
                            order: () => selectListMock.mockResolvedValue({
                                data: [{ id: 'a', job_reference: 'AWC-1', client_name_snapshot: 'Acme' }],
                                error: null,
                            }),
                        }),
                    }),
                }),
            };
        },
    }),
}));

beforeEach(() => vi.clearAllMocks());

describe('reconcile-actions', () => {
    it('linkJobToOrg sets org_id and clears orphan flag', async () => {
        const res = await linkJobToOrg('job-1', '00000000-0000-0000-0000-000000000001');
        expect(res).toEqual({ ok: true });
        expect(updateMock).toHaveBeenCalledWith({
            org_id: '00000000-0000-0000-0000-000000000001',
            is_orphan: false,
        });
    });

    it('markJobAsOrphan requires org_id and sets is_orphan=true', async () => {
        const res = await markJobAsOrphan('job-1', '00000000-0000-0000-0000-000000000002');
        expect(res).toEqual({ ok: true });
        expect(updateMock).toHaveBeenCalledWith({
            org_id: '00000000-0000-0000-0000-000000000002',
            is_orphan: true,
        });
    });

    it('markJobAsOrphan rejects when org_id is empty', async () => {
        const res = await markJobAsOrphan('job-1', '');
        expect(res).toHaveProperty('error');
    });

    it('listUnmatchedJobs returns jobs with null org_id and is_orphan=false', async () => {
        const res = await listUnmatchedJobs();
        expect(Array.isArray(res)).toBe(true);
        expect(res[0]).toMatchObject({ id: 'a', job_reference: 'AWC-1' });
    });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest run lib/artwork/reconcile-actions.test.ts`
Expected: FAIL — `Cannot find module './reconcile-actions'`.

- [ ] **Step 3: Implement**

Create `lib/artwork/reconcile-actions.ts`:

```typescript
'use server';

import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';

export interface UnmatchedJobRow {
    id: string;
    job_reference: string;
    client_name_snapshot: string | null;
    created_at: string;
}

export async function listUnmatchedJobs(): Promise<UnmatchedJobRow[]> {
    await requireAdmin();
    const supabase = await createServerClient();

    const { data, error } = await supabase
        .from('artwork_jobs')
        .select('id, job_reference, client_name_snapshot, created_at')
        .is('org_id', null)
        .eq('is_orphan', false)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('listUnmatchedJobs failed:', error);
        return [];
    }
    return (data ?? []) as UnmatchedJobRow[];
}

const UuidSchema = z.string().uuid();

export async function linkJobToOrg(
    jobId: string,
    orgId: string
): Promise<{ ok: true } | { error: string }> {
    await requireAdmin();
    if (!UuidSchema.safeParse(jobId).success) return { error: 'invalid job id' };
    if (!UuidSchema.safeParse(orgId).success) return { error: 'invalid org id' };

    const supabase = await createServerClient();
    const { error } = await supabase
        .from('artwork_jobs')
        .update({ org_id: orgId, is_orphan: false })
        .eq('id', jobId);

    if (error) return { error: error.message };
    revalidatePath('/admin/artwork/reconcile');
    revalidatePath('/admin/artwork');
    return { ok: true };
}

export async function markJobAsOrphan(
    jobId: string,
    orgId: string
): Promise<{ ok: true } | { error: string }> {
    await requireAdmin();
    if (!UuidSchema.safeParse(jobId).success) return { error: 'invalid job id' };
    if (!UuidSchema.safeParse(orgId).success) {
        return { error: 'org must be selected even for orphan jobs' };
    }

    const supabase = await createServerClient();
    const { error } = await supabase
        .from('artwork_jobs')
        .update({ org_id: orgId, is_orphan: true })
        .eq('id', jobId);

    if (error) return { error: error.message };
    revalidatePath('/admin/artwork/reconcile');
    revalidatePath('/admin/artwork');
    return { ok: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/artwork/reconcile-actions.test.ts`
Expected: All four tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/artwork/reconcile-actions.ts lib/artwork/reconcile-actions.test.ts
git commit -m "feat(artwork): add reconciliation server actions"
```

---

## Task 8: Reconciliation page UI

**Files:**
- Create: `app/(portal)/admin/artwork/reconcile/page.tsx`
- Create: `app/(portal)/admin/artwork/reconcile/ReconcileRow.tsx`

- [ ] **Step 1: Write the page**

Create `app/(portal)/admin/artwork/reconcile/page.tsx`:

```typescript
import { requireAdmin } from '@/lib/auth';
import { listUnmatchedJobs } from '@/lib/artwork/reconcile-actions';
import { createServerClient } from '@/lib/supabase-server';
import { PageHeader, Card } from '@/app/(portal)/components/ui';
import Link from 'next/link';
import { ReconcileRow } from './ReconcileRow';

export const dynamic = 'force-dynamic';

export default async function ReconcilePage() {
    await requireAdmin();

    const unmatched = await listUnmatchedJobs();
    const supabase = await createServerClient();
    const { data: orgs } = await supabase
        .from('orgs')
        .select('id, name')
        .order('name', { ascending: true });

    if (unmatched.length === 0) {
        return (
            <div className="p-6 max-w-3xl mx-auto">
                <PageHeader
                    title="artwork reconciliation"
                    description="link historic artwork jobs to organisations"
                />
                <Card>
                    <div className="text-center py-12">
                        <p className="text-neutral-700 font-medium mb-2">nothing to reconcile.</p>
                        <p className="text-sm text-neutral-500">
                            every artwork job is linked to an organisation or marked as an orphan.
                        </p>
                        <Link href="/admin/artwork" className="btn-primary mt-6 inline-block">
                            back to dashboard
                        </Link>
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <PageHeader
                title="artwork reconciliation"
                description={`${unmatched.length} job${unmatched.length === 1 ? '' : 's'} need linking`}
            />
            <Card>
                <table className="w-full">
                    <thead className="border-b border-neutral-200 bg-neutral-50">
                        <tr>
                            <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase">ref</th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase">legacy client</th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase">link to</th>
                            <th className="text-right px-4 py-3 text-xs font-medium text-neutral-500 uppercase">action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                        {unmatched.map((job) => (
                            <ReconcileRow
                                key={job.id}
                                jobId={job.id}
                                jobReference={job.job_reference}
                                legacyName={job.client_name_snapshot ?? '—'}
                                orgs={orgs ?? []}
                            />
                        ))}
                    </tbody>
                </table>
            </Card>
        </div>
    );
}
```

- [ ] **Step 2: Write the row client component**

Create `app/(portal)/admin/artwork/reconcile/ReconcileRow.tsx`:

```typescript
'use client';

import { useState, useTransition } from 'react';
import { linkJobToOrg, markJobAsOrphan } from '@/lib/artwork/reconcile-actions';
import { useRouter } from 'next/navigation';

interface Props {
    jobId: string;
    jobReference: string;
    legacyName: string;
    orgs: { id: string; name: string }[];
}

export function ReconcileRow({ jobId, jobReference, legacyName, orgs }: Props) {
    const [selectedOrg, setSelectedOrg] = useState('');
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    const submit = (action: 'link' | 'orphan') => {
        setError(null);
        if (!selectedOrg) {
            setError('pick an organisation first');
            return;
        }
        startTransition(async () => {
            const fn = action === 'link' ? linkJobToOrg : markJobAsOrphan;
            const res = await fn(jobId, selectedOrg);
            if ('error' in res) setError(res.error);
            else router.refresh();
        });
    };

    return (
        <tr className="hover:bg-neutral-50">
            <td className="px-4 py-3 font-mono text-sm">{jobReference}</td>
            <td className="px-4 py-3 text-sm text-neutral-600">{legacyName}</td>
            <td className="px-4 py-3">
                <select
                    className="w-full px-2 py-1 text-sm border border-neutral-200 rounded"
                    value={selectedOrg}
                    onChange={(e) => setSelectedOrg(e.target.value)}
                    disabled={pending}
                >
                    <option value="">— select —</option>
                    {orgs.map((o) => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                </select>
                {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
            </td>
            <td className="px-4 py-3 text-right">
                <button
                    className="btn-primary text-xs mr-2"
                    disabled={pending || !selectedOrg}
                    onClick={() => submit('link')}
                >
                    link
                </button>
                <button
                    className="btn-secondary text-xs"
                    disabled={pending || !selectedOrg}
                    onClick={() => submit('orphan')}
                    title="mark as orphan (no production link)"
                >
                    orphan
                </button>
            </td>
        </tr>
    );
}
```

- [ ] **Step 3: Smoke-test the route**

Run: `npm run dev` and navigate to `http://localhost:3000/admin/artwork/reconcile`.
Expected: Table of unmatched jobs (or the "nothing to reconcile" empty state). Selecting an org and clicking "link" removes the row after refresh.

- [ ] **Step 4: Commit**

```bash
git add app/\(portal\)/admin/artwork/reconcile/
git commit -m "feat(artwork): add reconciliation UI"
```

---

## Task 9: Update `StartArtworkButton` to call the new signature

**Files:**
- Modify: `app/(portal)/admin/artwork/StartArtworkButton.tsx`
- Modify: `lib/artwork/actions.ts` — ensure there is a server action named `startArtworkForItem` the button can import. The existing `createArtworkJobForItem` (if present) may need its internals updated to call `createArtworkJob({ kind: 'linked', ... })`.

- [ ] **Step 1: Find existing helper**

Run: `grep -n "createArtworkJobForItem\|startArtworkForItem" lib/artwork/actions.ts`
- If `createArtworkJobForItem` exists, update its body to the code in Step 2.
- If not, add the function.

- [ ] **Step 2: Implement/replace the server action**

Add (or replace) at the bottom of `lib/artwork/actions.ts`:

```typescript
export async function startArtworkForItem(
    jobItemId: string
): Promise<{ id: string } | { error: string }> {
    const supabase = await createServerClient();

    const { data: item } = await supabase
        .from('job_items')
        .select('id, description')
        .eq('id', jobItemId)
        .single();

    const jobName = item?.description?.slice(0, 80) || 'Artwork compliance job';

    return createArtworkJob({
        kind: 'linked',
        job_name: jobName,
        job_item_id: jobItemId,
    });
}
```

- [ ] **Step 3: Update the button client**

Replace the contents of `app/(portal)/admin/artwork/StartArtworkButton.tsx`:

```typescript
'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { startArtworkForItem } from '@/lib/artwork/actions';

export function StartArtworkButton({ jobItemId }: { jobItemId: string }) {
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    return (
        <div>
            <button
                className="text-xs font-medium text-[#4e7e8c] hover:underline disabled:opacity-50"
                disabled={pending}
                onClick={() =>
                    startTransition(async () => {
                        setError(null);
                        const res = await startArtworkForItem(jobItemId);
                        if ('error' in res) setError(res.error);
                        else router.push(`/admin/artwork/${res.id}`);
                    })
                }
            >
                {pending ? 'starting…' : 'start artwork →'}
            </button>
            {error && <p className="text-[11px] text-red-600 mt-1">{error}</p>}
        </div>
    );
}
```

- [ ] **Step 4: Type-check + smoke-test**

Run: `npx tsc --noEmit` — expected: clean.
Manual smoke: click a Start button on the dashboard; confirm it routes to the newly created artwork job and that the job row has `org_id` populated (check in Supabase studio).

- [ ] **Step 5: Commit**

```bash
git add lib/artwork/actions.ts app/\(portal\)/admin/artwork/StartArtworkButton.tsx
git commit -m "feat(artwork): start-artwork action inherits org_id from production job"
```

---

## Task 10: Rewrite `/admin/artwork/new` with orphan escape hatch

**Files:**
- Modify: `app/(portal)/admin/artwork/new/page.tsx`

- [ ] **Step 1: Rewrite the page**

Replace the entire contents of `app/(portal)/admin/artwork/new/page.tsx` with:

```typescript
import { requireAdmin } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase-server';
import { PageHeader, Card } from '@/app/(portal)/components/ui';
import { NewArtworkJobForm } from './NewArtworkJobForm';

export default async function NewArtworkJobPage() {
    await requireAdmin();

    const supabase = await createServerClient();
    const [orgsRes, itemsRes] = await Promise.all([
        supabase.from('orgs').select('id, name').order('name'),
        supabase
            .from('job_items')
            .select(`
                id,
                description,
                item_number,
                production_jobs!inner(job_number, client_name, status)
            `)
            .order('created_at', { ascending: false })
            .limit(50),
    ]);

    const items = (itemsRes.data ?? []).filter(
        (i: any) =>
            i.production_jobs?.status === 'active' ||
            i.production_jobs?.status === 'paused'
    );

    return (
        <div className="p-6 max-w-2xl mx-auto">
            <PageHeader
                title="new artwork job"
                description="spawn from a production item, or create an orphan for rework"
            />
            <Card>
                <NewArtworkJobForm
                    orgs={orgsRes.data ?? []}
                    items={items.map((i: any) => ({
                        id: i.id,
                        label: `${i.production_jobs.job_number}${i.item_number ? ' · ' + i.item_number : ''} — ${i.description ?? ''}`,
                    }))}
                />
            </Card>
        </div>
    );
}
```

- [ ] **Step 2: Write the form client component**

Create `app/(portal)/admin/artwork/new/NewArtworkJobForm.tsx`:

```typescript
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createArtworkJob } from '@/lib/artwork/actions';

interface Props {
    orgs: { id: string; name: string }[];
    items: { id: string; label: string }[];
}

export function NewArtworkJobForm({ orgs, items }: Props) {
    const [mode, setMode] = useState<'linked' | 'orphan'>('linked');
    const [jobName, setJobName] = useState('');
    const [jobItemId, setJobItemId] = useState('');
    const [orgId, setOrgId] = useState('');
    const [description, setDescription] = useState('');
    const [acknowledge, setAcknowledge] = useState(false);
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    const submit = () => {
        setError(null);
        startTransition(async () => {
            const input =
                mode === 'linked'
                    ? {
                          kind: 'linked' as const,
                          job_name: jobName,
                          job_item_id: jobItemId,
                          description: description || undefined,
                      }
                    : {
                          kind: 'orphan' as const,
                          job_name: jobName,
                          org_id: orgId,
                          description: description || undefined,
                          acknowledge_orphan: true as const,
                      };
            if (mode === 'orphan' && !acknowledge) {
                setError('tick the acknowledgement checkbox to create an orphan job');
                return;
            }
            const res = await createArtworkJob(input);
            if ('error' in res) setError(res.error);
            else router.push(`/admin/artwork/${res.id}`);
        });
    };

    return (
        <div className="space-y-4">
            <div className="flex gap-2">
                <button
                    type="button"
                    className={`px-3 py-1.5 text-sm rounded ${mode === 'linked' ? 'bg-black text-white' : 'bg-neutral-100'}`}
                    onClick={() => setMode('linked')}
                >
                    from production item
                </button>
                <button
                    type="button"
                    className={`px-3 py-1.5 text-sm rounded ${mode === 'orphan' ? 'bg-black text-white' : 'bg-neutral-100'}`}
                    onClick={() => setMode('orphan')}
                >
                    orphan (warranty / rework)
                </button>
            </div>

            <div>
                <label className="text-xs font-medium uppercase text-neutral-500">job name</label>
                <input
                    className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded"
                    value={jobName}
                    onChange={(e) => setJobName(e.target.value)}
                />
            </div>

            {mode === 'linked' ? (
                <div>
                    <label className="text-xs font-medium uppercase text-neutral-500">production item</label>
                    <select
                        className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded"
                        value={jobItemId}
                        onChange={(e) => setJobItemId(e.target.value)}
                    >
                        <option value="">— select —</option>
                        {items.map((i) => (
                            <option key={i.id} value={i.id}>{i.label}</option>
                        ))}
                    </select>
                </div>
            ) : (
                <>
                    <div>
                        <label className="text-xs font-medium uppercase text-neutral-500">organisation</label>
                        <select
                            className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded"
                            value={orgId}
                            onChange={(e) => setOrgId(e.target.value)}
                        >
                            <option value="">— select —</option>
                            {orgs.map((o) => (
                                <option key={o.id} value={o.id}>{o.name}</option>
                            ))}
                        </select>
                    </div>
                    <label className="flex items-start gap-2 text-sm text-neutral-700">
                        <input
                            type="checkbox"
                            checked={acknowledge}
                            onChange={(e) => setAcknowledge(e.target.checked)}
                            className="mt-0.5"
                        />
                        <span>
                            I understand this job has no production link. It will not appear in
                            the production pipeline and must be manually released.
                        </span>
                    </label>
                </>
            )}

            <div>
                <label className="text-xs font-medium uppercase text-neutral-500">description</label>
                <textarea
                    className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded"
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end">
                <button className="btn-primary" disabled={pending} onClick={submit}>
                    {pending ? 'creating…' : 'create job'}
                </button>
            </div>
        </div>
    );
}
```

- [ ] **Step 3: Smoke-test both paths**

Dev-server test: create a linked job and an orphan job; confirm `org_id` is populated in both rows and `is_orphan` differs.

- [ ] **Step 4: Commit**

```bash
git add app/\(portal\)/admin/artwork/new/
git commit -m "feat(artwork): new-job form with linked + orphan paths"
```

---

## Task 11: Unified dashboard page

**Files:**
- Modify: `app/(portal)/admin/artwork/page.tsx`

- [ ] **Step 1: Replace the entire page**

Replace the full contents of `app/(portal)/admin/artwork/page.tsx` with:

```typescript
import { requireAdmin } from '@/lib/auth';
import { getArtworkDashboardData } from '@/lib/artwork/actions';
import { PageHeader, Card, Chip } from '@/app/(portal)/components/ui';
import Link from 'next/link';
import { formatDate, getJobStatusLabel, getJobStatusVariant } from '@/lib/artwork/utils';
import { ArtworkJobStatus, ArtworkDashboardFilterEnum } from '@/lib/artwork/types';
import { Settings } from 'lucide-react';
import { StartArtworkButton } from './StartArtworkButton';

interface SearchParams {
    filter?: string;
    search?: string;
}

const FILTER_LABELS: Record<string, string> = {
    all: 'all',
    awaiting_start: 'awaiting start',
    in_progress: 'in progress',
    awaiting_approval: 'awaiting client',
    flagged: 'flagged',
    completed: 'completed',
    orphans: 'orphans',
};

export default async function ArtworkJobsPage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>;
}) {
    await requireAdmin();
    const params = await searchParams;

    const filterParse = ArtworkDashboardFilterEnum.safeParse(params.filter ?? 'all');
    const filter = filterParse.success ? filterParse.data : 'all';

    const { jobs, ghostRows, counts } = await getArtworkDashboardData({
        filter,
        search: params.search,
    });

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <PageHeader
                title="artwork compliance"
                description="design-to-production verification for signage jobs"
                action={
                    <div className="flex items-center gap-2">
                        <Link href="/admin/artwork/reconcile" className="btn-secondary text-xs">
                            reconcile
                        </Link>
                        <Link href="/admin/artwork/settings" className="btn-secondary p-2" title="Settings">
                            <Settings size={16} />
                        </Link>
                        <Link href="/admin/artwork/new" className="btn-primary">new artwork job</Link>
                    </div>
                }
            />

            {/* Filter chips */}
            <div className="flex flex-wrap gap-2 mb-4">
                {Object.keys(FILTER_LABELS).map((key) => {
                    const active = key === filter;
                    const count = counts[key as keyof typeof counts] ?? 0;
                    const href = `/admin/artwork?filter=${key}${params.search ? `&search=${encodeURIComponent(params.search)}` : ''}`;
                    return (
                        <Link
                            key={key}
                            href={href}
                            className={`px-3 py-1.5 text-xs rounded-full border ${active ? 'bg-black text-white border-black' : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400'}`}
                        >
                            {FILTER_LABELS[key]} <span className="ml-1 opacity-70">{count}</span>
                        </Link>
                    );
                })}
            </div>

            {/* Search */}
            <Card className="mb-4">
                <form method="get" className="flex gap-2">
                    <input type="hidden" name="filter" value={filter} />
                    <input
                        type="text"
                        name="search"
                        placeholder="search by job name, reference or legacy client…"
                        defaultValue={params.search || ''}
                        className="flex-1 px-3 py-2 text-sm border border-neutral-200 rounded"
                    />
                    <button type="submit" className="btn-secondary">search</button>
                </form>
            </Card>

            {/* Ghost rows */}
            {ghostRows.length > 0 && (filter === 'all' || filter === 'awaiting_start') && (
                <Card className="mb-4">
                    <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 bg-neutral-50 border-b border-neutral-200">
                        production items awaiting artwork · {ghostRows.length}
                    </div>
                    <ul className="divide-y divide-neutral-100">
                        {ghostRows.map((g) => (
                            <li key={g.jobItemId} className="px-4 py-3 flex items-center justify-between gap-4">
                                <div className="min-w-0">
                                    <code className="text-xs font-mono text-[#4e7e8c] font-semibold">
                                        {g.productionJobNumber}{g.itemNumber ? ` · ${g.itemNumber}` : ''}
                                    </code>
                                    <p className="text-sm font-medium truncate">{g.clientName}</p>
                                    <p className="text-xs text-neutral-500 truncate">{g.jobItemDescription}</p>
                                </div>
                                <StartArtworkButton jobItemId={g.jobItemId} />
                            </li>
                        ))}
                    </ul>
                </Card>
            )}

            {/* Jobs table */}
            {jobs.length === 0 && ghostRows.length === 0 ? (
                <Card>
                    <div className="text-center py-12 text-neutral-500">
                        nothing here.{' '}
                        <Link href="/admin/artwork" className="underline">clear filters</Link>
                    </div>
                </Card>
            ) : jobs.length > 0 ? (
                <Card className="overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="border-b border-neutral-200 bg-neutral-50">
                                <tr>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase">reference</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase">job name</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase">status</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase">client</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase">flags</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase">last updated</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                                {jobs.map((job) => (
                                    <tr key={job.id} className="hover:bg-neutral-50">
                                        <td className="px-4 py-3">
                                            <Link href={`/admin/artwork/${job.id}`} className="font-mono text-sm text-neutral-600 hover:text-black">
                                                {job.job_reference}
                                            </Link>
                                        </td>
                                        <td className="px-4 py-3">
                                            <Link href={`/admin/artwork/${job.id}`} className="font-medium hover:underline">
                                                {job.job_name}
                                            </Link>
                                            {job.is_orphan && (
                                                <span className="ml-2 text-[10px] uppercase px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-semibold">orphan</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <Chip variant={getJobStatusVariant(job.status as ArtworkJobStatus)}>
                                                {getJobStatusLabel(job.status as ArtworkJobStatus)}
                                            </Chip>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-neutral-600">
                                            {job.client_approved ? <Chip variant="approved">approved</Chip> : <span className="text-neutral-400">—</span>}
                                        </td>
                                        <td className="px-4 py-3 text-sm">
                                            {job.flagged_count > 0 ? (
                                                <span className="text-red-700 font-medium">{job.flagged_count} flagged</span>
                                            ) : (
                                                <span className="text-neutral-400">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-neutral-500">{formatDate(job.updated_at)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            ) : null}
        </div>
    );
}
```

- [ ] **Step 2: Smoke-test**

Dev-server: visit `/admin/artwork`. Verify:
- Filter chips render with counts.
- Ghost rows show under a header when present.
- Clicking a chip narrows the list.
- Search survives a chip click (query param preserved).

- [ ] **Step 3: Commit**

```bash
git add app/\(portal\)/admin/artwork/page.tsx
git commit -m "feat(artwork): unified dashboard with filter chips and ghost rows"
```

---

## Task 12: Lineage breadcrumb on job detail

**Files:**
- Modify: `app/(portal)/admin/artwork/[id]/page.tsx`

- [ ] **Step 1: Add breadcrumb element**

Near the top of the detail page (inside the top-level wrapper div, above existing `PageHeader`), add a server-side fetch and render:

```typescript
import { getArtworkJobLineage } from '@/lib/artwork/actions';
// … inside the default exported async component, after `requireAdmin()`
const lineage = await getArtworkJobLineage(id);
```

Then render (above `<PageHeader>`):

```tsx
{lineage && (lineage.quoteNumber || lineage.productionJobNumber) && (
    <nav className="text-xs text-neutral-500 mb-3 flex items-center gap-2">
        {lineage.quoteNumber && (
            <>
                <span>quote</span>
                <Link
                    href={`/admin/quotes/${lineage.quoteId}`}
                    className="font-mono text-neutral-700 hover:underline"
                >
                    {lineage.quoteNumber}
                </Link>
                <span>→</span>
            </>
        )}
        {lineage.productionJobNumber && (
            <>
                <span>production</span>
                <Link
                    href={`/admin/jobs/${lineage.productionJobId}`}
                    className="font-mono text-neutral-700 hover:underline"
                >
                    {lineage.productionJobNumber}
                </Link>
                <span>→</span>
            </>
        )}
        <span className="font-mono text-neutral-700">artwork</span>
    </nav>
)}
```

Ensure `Link` is imported from `next/link` at the top of the file if it isn't already.

- [ ] **Step 2: Smoke-test**

Open an artwork job spawned from production. Breadcrumb should show quote → production → artwork. Open an orphan job — breadcrumb is hidden.

- [ ] **Step 3: Commit**

```bash
git add app/\(portal\)/admin/artwork/\[id\]/page.tsx
git commit -m "feat(artwork): render quote→production→artwork breadcrumb on detail view"
```

---

## Task 13: Migration 038 — CHECK constraint (gated)

**Files:**
- Create: `supabase/migrations/038_artwork_org_check.sql`

- [ ] **Step 1: Preflight — confirm reconciliation is empty**

Run against the target DB:

```sql
SELECT COUNT(*) FROM public.artwork_jobs
WHERE org_id IS NULL AND is_orphan = false;
```

Expected: **0**. If not zero, STOP. Complete reconciliation via `/admin/artwork/reconcile` first. Do not deploy this migration until the count is zero.

- [ ] **Step 2: Write the migration**

```sql
-- Migration 038: enforce org_id OR is_orphan for artwork_jobs.
-- Gated: preflight SELECT must return 0 unmatched rows before running.

BEGIN;

ALTER TABLE public.artwork_jobs
  ADD CONSTRAINT artwork_jobs_org_or_orphan_chk
  CHECK (is_orphan = true OR org_id IS NOT NULL);

COMMIT;
```

- [ ] **Step 3: Apply and verify**

Run: `npx supabase db reset` (local) or `supabase migration up` against staging first.
Expected: Migration applies without error.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/038_artwork_org_check.sql
git commit -m "feat(artwork): enforce org_id or is_orphan via CHECK (post-reconciliation)"
```

---

## Task 14: Final verification

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: All passing. Fix any regressions before declaring done.

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Lint**

Run: `npm run lint` (if configured; skip otherwise).

- [ ] **Step 4: Manual end-to-end**

1. Create an artwork job from a production item → verify org_id inherited, no `client_name` populated.
2. Create an orphan from `/admin/artwork/new` with acknowledgement → verify `is_orphan=true` and selected `org_id` stored.
3. Attempt to create an orphan without acknowledgement → validation error.
4. `/admin/artwork/reconcile` empties after all historic jobs are linked.
5. Dashboard: each filter chip narrows correctly; ghost rows disappear after clicking Start.
6. Detail page: lineage breadcrumb renders for linked jobs, hidden for orphans.

- [ ] **Step 5: Tag release commit**

```bash
git tag artwork-phase1-complete
```

---

## Self-review log

Checked against spec `2026-04-14-artwork-phase1-data-integration-design.md`:

- §1 Data model → Tasks 1, 13 cover migration 036 + 038. Task 2 covers 037 view.
- §2 Backfill strategy → Task 1 Step 1 includes the DO block.
- §3 Quote traceability → Tasks 2, 5, 12.
- §4 Canonical creation flow → Tasks 4, 9, 10.
- §5 Unified dashboard → Tasks 6, 11.
- §Rollout → Tasks 1, 8, 13 gate ordering. Feature flag is NOT implemented as a separate task — the rollout risk is mitigated by migration 038 being gated on reconciliation emptiness. If you want a flag, add an extra task wrapping `getArtworkDashboardData` behind `process.env.ARTWORK_UNIFIED_DASHBOARD`.

No placeholders detected. All function signatures consistent (`startArtworkForItem`, `createArtworkJob` with discriminated union, `linkJobToOrg`, `markJobAsOrphan`).
