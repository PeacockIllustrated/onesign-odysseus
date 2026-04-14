# Artwork Compliance — Phase 1: Data Integration

**Date:** 2026-04-14
**Status:** Draft → awaiting user review
**Author:** Claude (brainstorming session)
**Supersedes:** N/A
**Depends on:** Current state of migrations 015–035

## Context

The artwork compliance module works in isolation but is only loosely coupled to the rest of the app. Specifically:

- `artwork_jobs.client_name` is free-text, not an FK to `orgs`. A multi-tenant app cannot carry free-text tenant identifiers in a compliance table.
- Artwork jobs have two entry points: manual creation at `/admin/artwork/new`, and `StartArtworkButton` spawning from a production `job_item`. The dashboard renders two parallel lists (`getArtworkJobs` + `getProductionItemsAtArtworkStage`), forcing staff to reason about two data sources.
- There is no direct way to go from an artwork job back to the quote that spawned it. The link exists transitively (`artwork_jobs.job_item_id → job_items.job_id → production_jobs.quote_id`) but is not surfaced.
- `job_item_id` is indexed with a partial unique index, but the app-level `StartArtworkButton` does not rely on the DB constraint — if two admins click it simultaneously, behaviour depends on ordering.

Phase 1 fixes the data model and unifies the UI so Phase 2 (compliance rigor) and Phase 3 (workflow streamlining) have a sound foundation.

## Goals

1. Every artwork job is linked to exactly one organisation (or explicitly marked as "unlinked").
2. Every artwork job that originated from a quote can trace that lineage in one query.
3. Staff see **one** canonical list of artwork work in progress, with filters instead of separate lists.
4. There is exactly one supported way to create an artwork job in the normal flow; orphan creation is an explicit, flagged action.

## Non-goals

- Audit trail (Phase 2).
- Configurable tolerances (Phase 2).
- Approval state machine changes (Phase 2).
- Partial release, batch sign-offs, email (Phase 3).
- Removing the external client approval token flow — it stays as-is.
- Changing RLS policies — artwork stays super-admin only this phase.

## Architecture

### 1. Data model changes

`artwork_jobs.org_id` already exists as a nullable UUID (per migration 015) but is not currently treated as the source of truth — the app reads the free-text `client_name` column instead. Phase 1 promotes `org_id` to primary identifier, preserves the legacy string, and adds an explicit orphan flag.

**Migration 036_artwork_org_linkage.sql** (new):

```sql
ALTER TABLE public.artwork_jobs
  ADD COLUMN client_name_snapshot TEXT,
  ADD COLUMN is_orphan BOOLEAN NOT NULL DEFAULT false;

-- Ensure the existing org_id column has a proper FK (migration 015 may have
-- created it without the constraint; idempotent re-declaration).
ALTER TABLE public.artwork_jobs
  DROP CONSTRAINT IF EXISTS artwork_jobs_org_id_fkey;
ALTER TABLE public.artwork_jobs
  ADD CONSTRAINT artwork_jobs_org_id_fkey
  FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_artwork_jobs_org_id ON public.artwork_jobs(org_id);
CREATE INDEX idx_artwork_jobs_is_orphan ON public.artwork_jobs(is_orphan) WHERE is_orphan = true;

-- Backfill: snapshot the legacy text and attempt exact-match linkage.
DO $$
BEGIN
  UPDATE public.artwork_jobs SET client_name_snapshot = client_name
    WHERE client_name_snapshot IS NULL;

  UPDATE public.artwork_jobs aj
    SET org_id = o.id
    FROM public.orgs o
    WHERE aj.org_id IS NULL
      AND LOWER(TRIM(aj.client_name)) = LOWER(TRIM(o.name))
      AND (
        SELECT COUNT(*) FROM public.orgs o2
        WHERE LOWER(TRIM(o2.name)) = LOWER(TRIM(aj.client_name))
      ) = 1;
END $$;

COMMENT ON COLUMN public.artwork_jobs.client_name_snapshot IS
  'Historical free-text client name preserved from pre-Phase-1 jobs. Read-only; do not use for new logic.';
COMMENT ON COLUMN public.artwork_jobs.is_orphan IS
  'True when the job has no org link (e.g. speculative rework). Forces explicit admin action to create.';
```

**Migration 038_artwork_org_check.sql** (deployed after reconciliation UI is emptied):

```sql
ALTER TABLE public.artwork_jobs
  ADD CONSTRAINT artwork_jobs_org_or_orphan_chk
  CHECK (is_orphan = true OR org_id IS NOT NULL);
```

The existing partial unique index on `artwork_jobs.job_item_id` (migration 030) is sufficient for duplicate-prevention; no change needed there.

### 2. Backfill strategy

A one-shot reconciliation script is run as part of the migration's `DO $$` block:

1. Copy `client_name` → `client_name_snapshot` for every existing row.
2. Attempt case-insensitive match `client_name` → `orgs.name`. Where exactly one match exists, set `org_id`.
3. Where match is ambiguous or zero, leave `org_id NULL` and `is_orphan = false` (will surface in reconciliation UI).

The reconciliation UI (`/admin/artwork/reconcile`) lists unmatched jobs with:
- Job reference, client_name_snapshot, job creation date
- Dropdown to pick an org, or "Mark as orphan" button
- Bulk action: "Mark all unmatched from before date X as orphans"

This page is visible to super-admins only and auto-hides when zero unmatched jobs remain.

### 3. Quote traceability

No new FK. Instead, add a view and a helper:

```sql
CREATE VIEW public.artwork_job_lineage AS
SELECT
  aj.id AS artwork_job_id,
  aj.job_reference,
  aj.org_id,
  ji.id AS job_item_id,
  pj.id AS production_job_id,
  pj.quote_id,
  q.quote_number
FROM public.artwork_jobs aj
LEFT JOIN public.job_items ji ON ji.id = aj.job_item_id
LEFT JOIN public.production_jobs pj ON pj.id = ji.job_id
LEFT JOIN public.quotes q ON q.id = pj.quote_id;
```

`lib/artwork/actions.ts` gains `getArtworkJobLineage(artworkJobId)` which returns `{ quoteId, quoteNumber, productionJobId } | null`. The job detail page renders a breadcrumb: **Quote Q-2026-000123 → Production Job PJ-456 → Artwork AWC-2026-000078**.

### 4. Canonical creation flow

- **Normal flow (unchanged at DB level, tightened at UI):** `StartArtworkButton` on a production `job_item` remains the primary entry. It now:
  - Reads `job_items.job_id → production_jobs.org_id` and writes `org_id` onto the new `artwork_job`.
  - Rejects (via the existing partial unique index) if another artwork job already exists for that `job_item_id`.
- **Orphan flow (new explicit path):** `/admin/artwork/new` stays but changes shape:
  - First field is "Link to production job" (autocomplete of recent `job_items`). Selecting one jumps to `StartArtworkButton`'s server action.
  - Only if the admin ticks "This is an orphan job (warranty / rework / speculative)" can they proceed without a `job_item_id`. Orphan path requires explicit `org_id` selection and writes `is_orphan = true`.
  - Page copy makes it obvious which path the admin is on.

### 5. Unified dashboard

`/admin/artwork` (page.tsx) replaces the two parallel lists with a single list plus filter chips:

| Filter chip | Data source |
|---|---|
| All | All `artwork_jobs` scoped to super-admin RLS |
| Awaiting start | `production_jobs.current_stage_id = artwork` AND no `artwork_job.job_item_id` linkage yet → rendered as "ghost rows" with a primary CTA "Start artwork" |
| In progress | `artwork_jobs.status IN ('draft', 'in_progress')` |
| Awaiting client approval | `artwork_approvals.status = 'pending'` joined in |
| Flagged | Any component with `dimension_flag = 'out_of_tolerance'` |
| Completed | `status = 'completed'` |
| Orphans | `is_orphan = true` |

Ghost rows unify the "awaiting artwork" production items into the main list rather than a separate panel. Clicking a ghost row runs `StartArtworkButton`'s server action and navigates to the newly created job.

`getArtworkJobs` is extended with:
- `filter: 'all' | 'awaiting_start' | 'in_progress' | 'awaiting_approval' | 'flagged' | 'completed' | 'orphans'`
- Returns `{ jobs: ArtworkJob[], ghostRows: ProductionJobItemAwaitingArtwork[] }` — ghost rows only populated when filter is `all` or `awaiting_start`.

`getProductionItemsAtArtworkStage` is removed; its logic folds into `getArtworkJobs`.

## Components & file changes

| File | Change |
|---|---|
| `supabase/migrations/036_artwork_org_linkage.sql` | NEW — adds `client_name_snapshot`, `is_orphan`; backfill DO block |
| `supabase/migrations/037_artwork_lineage_view.sql` | NEW — creates `artwork_job_lineage` view |
| `supabase/migrations/038_artwork_org_check.sql` | NEW — adds CHECK constraint after reconciliation |
| `lib/artwork/types.ts` | Add `isOrphan: boolean`, `clientNameSnapshot: string \| null` to `ArtworkJobSchema`; remove free-text `clientName` requirement on new jobs |
| `lib/artwork/actions.ts` | `createArtworkJob` requires either `jobItemId` or `{ orgId, isOrphan: true }`. Add `getArtworkJobLineage`. Rewrite `getArtworkJobs` to accept filter + return ghost rows. Delete `getProductionItemsAtArtworkStage`. |
| `lib/artwork/reconcile-actions.ts` | NEW — `listUnmatchedJobs`, `linkJobToOrg`, `markJobAsOrphan`, `bulkMarkOrphans` |
| `app/(portal)/admin/artwork/page.tsx` | Rewritten — single list + filter chips + ghost rows |
| `app/(portal)/admin/artwork/new/page.tsx` | Rewritten — "link to production job" primary path + orphan escape hatch |
| `app/(portal)/admin/artwork/reconcile/page.tsx` | NEW — reconciliation UI |
| `app/(portal)/admin/artwork/[id]/page.tsx` | Adds lineage breadcrumb row at top |
| `app/(portal)/components/StartArtworkButton.tsx` (or wherever it lives) | Reads `org_id` from production job and passes it through |
| Sidebar | Unchanged — still one "Artwork" entry |

## Data flow

**Creating a job (normal):**
```
User clicks StartArtworkButton on job_item row
  → server action readJobItem(jobItemId)
  → reads production_jobs.org_id via job_items.job_id
  → INSERT INTO artwork_jobs (job_item_id, org_id, is_orphan=false, client_name_snapshot=NULL)
  → partial unique index on job_item_id prevents duplicates
  → redirect to /admin/artwork/:newId
```

**Creating a job (orphan):**
```
User fills /admin/artwork/new with isOrphan=true + explicit orgId
  → server action validates (orgId must exist, no jobItemId allowed)
  → INSERT INTO artwork_jobs (job_item_id=NULL, org_id=orgId, is_orphan=true)
  → redirect to /admin/artwork/:newId
```

**Dashboard query (filter=all):**
```
getArtworkJobs({ filter: 'all' })
  → SELECT * FROM artwork_jobs (RLS scoped)
  → SELECT * FROM job_items JOIN production_jobs
       WHERE current_stage_id = 'artwork'
       AND id NOT IN (SELECT job_item_id FROM artwork_jobs WHERE job_item_id IS NOT NULL)
  → return { jobs, ghostRows }
```

## Error handling

- **Backfill ambiguity:** Script never guesses. Ambiguous matches stay NULL; reconciliation UI surfaces them.
- **Missing org on production job:** `StartArtworkButton` surfaces an error toast "Production job has no organisation" and aborts. This should be impossible given `production_jobs.org_id NOT NULL`, but we guard anyway.
- **Duplicate start:** The existing partial unique index on `artwork_jobs.job_item_id` returns a Postgres 23505. Server action catches and returns "Artwork job already exists for this item" with a link to the existing job.
- **CHECK constraint violation (migration 038):** Will only fire if reconciliation was skipped. The migration is gated behind a pre-flight count query that refuses to run if any unmatched jobs remain.

## Testing

Vitest unit tests:
- `createArtworkJob` rejects when both `jobItemId` missing and `isOrphan` false.
- `createArtworkJob` rejects when `jobItemId` set AND `isOrphan` true (conflicting).
- `getArtworkJobs({ filter: 'awaiting_start' })` returns only ghost rows, zero `jobs`.
- `getArtworkJobs({ filter: 'flagged' })` returns only jobs with at least one out-of-tolerance component.
- Reconciliation actions: `linkJobToOrg` sets `org_id` and clears `is_orphan`; `markJobAsOrphan` requires org_id to be null.

Manual smoke test script documented in the plan:
1. Apply all three migrations on a dev DB seeded with fixture data.
2. Verify every pre-existing artwork job either has `org_id` set or appears in `/admin/artwork/reconcile`.
3. Create a new artwork job from a production item → confirm org is inherited.
4. Try to create an orphan without the checkbox → confirm validation error.
5. Check lineage breadcrumb shows quote → production → artwork.

## Rollout

1. Deploy migration 036 + 037 to production (backfill runs).
2. Ship app code behind a feature flag — dashboard renders old layout unless `artwork_unified_dashboard` flag is on.
3. Super-admin runs `/admin/artwork/reconcile` until empty.
4. Deploy migration 038 (adds CHECK).
5. Flip feature flag on.
6. Remove the old dashboard code path and the flag in a follow-up cleanup commit.

## Risks

- **Backfill mismatches:** Fuzzy matching on `client_name` may produce false positives. Mitigation: only exact (case-insensitive) matches backfill automatically. Everything else is manual.
- **Ghost row query perf:** The `NOT IN` subquery on production items could be slow at scale. Mitigation: add an index on `artwork_jobs(job_item_id)` (already exists) and LIMIT the query to 100 rows. Paginate if needed.
- **Feature flag gap:** If flag is flipped before reconciliation completes, dashboard renders empty states for unmatched jobs. Mitigation: reconciliation UI is reachable regardless of flag state, and migration 038 gates on zero unmatched.

## Out of scope (deferred to Phase 2/3)

- Audit log of who linked which job to which org.
- Allowing artwork jobs to have multiple linked `job_items` (e.g. batch jobs).
- Auto-suggesting org based on quote on the `/new` page.
- Deprecating `client_name` column entirely — stays as `client_name_snapshot` indefinitely.
