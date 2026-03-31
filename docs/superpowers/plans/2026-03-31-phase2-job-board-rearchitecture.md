# Plan: Phase 2 — Per-Item Job Board Architecture

**Branch:** `feature/phase1-production-job-board` (already on this branch)
**Date:** 2026-03-31

## Context

Onesign Portal replaces Clarity Go (production management SaaS). Research on Clarity Go revealed the critical architectural gap: **Clarity's job board tracks per line item, not per order.** Each quote line item becomes its own independent job card on the Kanban board, with its own current department and department routing config.

The current portal schema already has `job_items` with `current_stage_id`, but the Kanban board and shop floor both display `production_jobs` (one per quote) as the card unit. This needs to be flipped.

Additionally, the production stage seed data uses 6 generic placeholders (Design, Print, Fabrication, Finishing, QC, Dispatch). Real Onesign departments are: Order Book, Cut List, Laser, CNC Routing, Plastic Fabrication, Metal Fabrication, Artwork Approval, Painters, Lighting, Vinyl, Digital Print, Assembly, Goods Out.

Painters department has sub-contractors (Work Centres): AMD, Dacon, Sparkle. These are painting contractors — the item is routed to Painters AND assigned to a specific work centre.

---

## Current Schema (relevant tables)

```sql
production_stages  -- stage definitions, slug, color, sort_order
production_jobs    -- one per quote, has current_stage_id (legacy), client_name, title, priority, due_date
job_items          -- per line item: job_id, description, quantity, current_stage_id, status
job_stage_log      -- audit: job_id, job_item_id (nullable), from/to stage, moved_by, notes
department_instructions -- job_id + stage_id + instruction text
```

`job_items` already has `current_stage_id` and `status` — the schema supports per-item tracking. The board UI just needs to be switched to use items as cards.

---

## Architecture Decision

- `production_jobs` stays as the **order container** (one per quote). Holds org_id, quote_id, client_name, title, priority, due_date, notes. The `current_stage_id` on production_jobs is kept but becomes the "earliest active item stage" — updated automatically by trigger.
- `job_items` becomes the **Kanban card unit**. Each item has its own `current_stage_id`, `status`, `stage_routing`, `item_number`, `work_centre_id`.
- Board shows `job_items` (with parent job context joined).
- Shop floor shows `job_items` for the selected department.

---

## Tasks

### Task 1: Migration 028 — Real departments + work_centres + job_items extensions

**File to create:** `supabase/migrations/028_real_departments_and_work_centres.sql`

Replace the 7 placeholder stage seeds with real Onesign departments. Add work_centres table. Add columns to job_items.

```sql
-- Step 1: Remove placeholder stage data (ON DELETE SET NULL on FKs so jobs stay)
DELETE FROM public.production_stages WHERE is_default = TRUE;

-- Step 2: Insert real Onesign departments
INSERT INTO public.production_stages (name, slug, sort_order, color, is_approval_stage, is_default) VALUES
  ('Order Book',          'order-book',          1,  '#6366F1', FALSE, TRUE),
  ('Cut List',            'cut-list',            2,  '#8B5CF6', FALSE, TRUE),
  ('Laser',               'laser',               3,  '#EC4899', FALSE, TRUE),
  ('CNC Routing',         'cnc-routing',         4,  '#EF4444', FALSE, TRUE),
  ('Plastic Fabrication', 'plastic-fabrication', 5,  '#F97316', FALSE, TRUE),
  ('Metal Fabrication',   'metal-fabrication',   6,  '#F59E0B', FALSE, TRUE),
  ('Artwork Approval',    'artwork-approval',    7,  '#D85A30', TRUE,  TRUE),
  ('Painters',            'painters',            8,  '#22C55E', FALSE, TRUE),
  ('Lighting',            'lighting',            9,  '#06B6D4', FALSE, TRUE),
  ('Vinyl',               'vinyl',               10, '#3B82F6', FALSE, TRUE),
  ('Digital Print',       'digital-print',       11, '#6366F1', FALSE, TRUE),
  ('Assembly',            'assembly',            12, '#14B8A6', FALSE, TRUE),
  ('Goods Out',           'goods-out',           13, '#4e7e8c', FALSE, TRUE);

-- Step 3: Create work_centres table
CREATE TABLE public.work_centres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID NOT NULL REFERENCES public.production_stages(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(stage_id, slug)
);

-- Step 4: Seed work centres for Painters
INSERT INTO public.work_centres (stage_id, name, slug, sort_order)
SELECT id, 'AMD', 'amd', 1 FROM public.production_stages WHERE slug = 'painters' AND is_default = TRUE;

INSERT INTO public.work_centres (stage_id, name, slug, sort_order)
SELECT id, 'Dacon', 'dacon', 2 FROM public.production_stages WHERE slug = 'painters' AND is_default = TRUE;

INSERT INTO public.work_centres (stage_id, name, slug, sort_order)
SELECT id, 'Sparkle', 'sparkle', 3 FROM public.production_stages WHERE slug = 'painters' AND is_default = TRUE;

-- Step 5: Extend job_items
ALTER TABLE public.job_items
  ADD COLUMN IF NOT EXISTS item_number TEXT,
  ADD COLUMN IF NOT EXISTS stage_routing UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS work_centre_id UUID REFERENCES public.work_centres(id) ON DELETE SET NULL;

-- Step 6: RLS for work_centres
ALTER TABLE public.work_centres ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view work centres"
  ON public.work_centres FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Super admins can manage work centres"
  ON public.work_centres FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Step 7: Add indexes
CREATE INDEX idx_job_items_stage ON public.job_items(current_stage_id);
CREATE INDEX idx_work_centres_stage ON public.work_centres(stage_id);

-- Step 8: Add work_centres to realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.work_centres;
```

Also update `createJobFromQuote` and `createManualJob` in actions.ts to use the new `order-book` slug instead of `design`.

Also update `completeJob` in actions.ts to use `goods-out` slug instead of `dispatch`.

Also update the test seed file `supabase/seed_test_pipeline.sql` to use the new stage slugs (or clear it out — the stages it references no longer exist).

**Verification:** `npx tsc --noEmit` passes. No TypeScript errors.

---

### Task 2: Update types + queries for item-board architecture

**Files to update:**
- `lib/production/types.ts`
- `lib/production/queries.ts`

**New types needed in `lib/production/types.ts`:**

```typescript
export interface WorkCentre {
    id: string;
    stage_id: string;
    name: string;
    slug: string;
    is_active: boolean;
    sort_order: number;
    created_at: string;
}

// Item as it appears on the Kanban board (with parent job context joined)
export interface JobItemWithJob extends JobItem {
    item_number: string | null;
    stage_routing: string[];      // UUID[] of stage IDs this item visits
    work_centre_id: string | null;
    stage: ProductionStage | null;
    work_centre: WorkCentre | null;
    // Parent job context:
    job: Pick<ProductionJob, 'id' | 'job_number' | 'client_name' | 'title' | 'priority' | 'due_date' | 'org_id'>;
}

// Board column for item-centric board
export interface ItemBoardColumn {
    stage: ProductionStage;
    items: JobItemWithJob[];
}
```

Also update existing `JobItem` type to include the new columns:
```typescript
export interface JobItem {
    // ...existing fields...
    item_number: string | null;      // ADD
    stage_routing: string[];          // ADD
    work_centre_id: string | null;   // ADD
}
```

**New + updated queries in `lib/production/queries.ts`:**

```typescript
// NEW: get all work centres
export async function getWorkCentres(): Promise<WorkCentre[]>

// NEW: get item board (items grouped by current_stage_id with job context)
export async function getItemBoard(): Promise<ItemBoardColumn[]>
// - Fetch all production_stages (ordered by sort_order)
// - Fetch all job_items WHERE job's status is active/paused, joined with parent job
// - Group items by current_stage_id
// - Return ItemBoardColumn[]

// UPDATE: getShopFloorQueue to return JobItemWithJob[] not ProductionJob[]
export async function getShopFloorQueue(stageSlug: string): Promise<JobItemWithJob[]>
// - Find stage by slug
// - Fetch job_items WHERE current_stage_id = stage.id
// - Join with parent production_jobs for context
// - Return JobItemWithJob[]

// UPDATE: getProductionStats to count items not jobs
export async function getProductionStats()
// Count active job_items (not production_jobs)
// Group by item.current_stage_id
```

**Verification:** `npx tsc --noEmit` passes.

---

### Task 3: Rework CreateJobModal — per-item routing

**File:** `app/(portal)/admin/jobs/CreateJobModal.tsx`

The "From Accepted Quote" tab needs to show each quote line item with department routing checkboxes so the user can configure which departments each item will visit before confirming.

**New flow:**
1. Select org + quote (same as now)
2. Once quote is selected, fetch its line items (quote_items table: id, item_type, output_json)
3. Show each item with:
   - Item description (derived from item_type + output_json, same logic as print page)
   - Department routing: row of stage toggles (checkboxes for all non-approval stages except Order Book which is always on)
   - Artwork Approval is a special toggle (on by default, can be turned off)
4. "Create Jobs" button submits
5. On submit: call `createJobFromQuote(quoteId, orgId, itemRoutings)` where `itemRoutings` is an array of `{quoteItemId, stageIds[]}`

**Update `createJobFromQuote` action signature:**
```typescript
export async function createJobFromQuote(
    quoteId: string,
    orgId: string,
    itemRoutings?: Array<{ quoteItemId: string; stageIds: string[] }>
): Promise<{ id: string; jobNumber: string } | { error: string }>
```
If `itemRoutings` is not provided (manual job from quote with no routing configured), default to empty routing [].

Items are created with:
- `item_number`: 'A', 'B', 'C'... (alphabetical by index)
- `stage_routing`: the stageIds selected for that item
- `current_stage_id`: the "Order Book" stage id
- `status`: 'pending'

The manual tab stays simple (no routing — manual jobs can be moved freely).

**Verification:** `npx tsc --noEmit` passes.

---

### Task 4: Kanban board — items as cards

**Files to update:**
- `app/(portal)/admin/jobs/JobBoardClient.tsx`
- `app/(portal)/admin/jobs/JobCard.tsx` (replace with ItemCard)
- `app/(portal)/admin/jobs/page.tsx` (update to use getItemBoard)

**`app/(portal)/admin/jobs/page.tsx`:**
Change from `getJobBoard()` to `getItemBoard()`. Pass `ItemBoardColumn[]` and stages to the client.

**`app/(portal)/admin/jobs/JobBoardClient.tsx`:**
- Change props from `initialBoard: BoardColumn[]` to `initialBoard: ItemBoardColumn[]`
- Draggable unit is now a `JobItemWithJob` (id = job_item.id)
- `handleDragEnd` calls `moveJobItemToStage(itemId, stageId)` not `moveJobToStage`
- Realtime subscribes to `job_items` table (not production_jobs)
- Column count is `col.items.length`

**Replace `app/(portal)/admin/jobs/JobCard.tsx` with ItemCard logic:**
The card shows:
- Job number (from item.job.job_number) + Item number (item.item_number) in monospace: `JOB-2026-000001 · A`
- Client name (item.job.client_name) in bold
- Item description (item.description)
- Stage routing pills (small colored dots for each stage in routing — completed ones grayed out, current one highlighted)
- Due date + priority (from parent job)

**Column header** shows stage name + item count.

**Verification:** `npx tsc --noEmit` passes. Board renders with items.

---

### Task 5: Job detail panel — item-centric view

**File:** `app/(portal)/admin/jobs/JobDetailPanel.tsx`

When a card is clicked, the panel shows the **item** detail, not the job detail.

**New props:** `itemId: string` instead of `jobId: string`

Load item with parent job context:
- Add `getJobItemDetailAction(itemId)` server action that returns item + job + stage_log filtered to this item + department instructions filtered to this job

**Panel sections:**
1. Header: job_number + item_number (e.g. "JOB-2026-000001 · Item A"), client name
2. Meta grid: Current Stage, Status, Priority, Due Date (from job), Work Centre (if Painters stage)
3. Stage routing: visual pipeline showing which stages this item visits, current highlighted
4. Work centre picker: shown when current_stage_id = Painters stage. Dropdown of work_centres for Painters.
5. Department instructions (for this job, filtered to current stage)
6. Stage history (job_stage_log filtered to this job_item_id)
7. "Move to stage" buttons (only stages in stage_routing + adjacent)

Add new server action to `lib/production/actions.ts`:
```typescript
export async function getJobItemDetailAction(itemId: string): Promise<JobItemWithJob & {
    stage_log: ...,
    instructions: ...
} | null>

export async function setItemWorkCentre(itemId: string, workCentreId: string | null): Promise<...>
```

**Verification:** `npx tsc --noEmit` passes. Clicking a card opens the panel.

---

### Task 6: Shop floor — item-centric queue

**Files:**
- `app/shop-floor/page.tsx`
- `app/shop-floor/ShopFloorClient.tsx`
- `lib/production/actions.ts` — add `getShopFloorItemsAction`

**`app/shop-floor/page.tsx`:**
Use `getShopFloorQueue('order-book')` (now returns `JobItemWithJob[]`).
Pass items to `ShopFloorClient`.

**`app/shop-floor/ShopFloorClient.tsx`:**
- Props change: `initialItems: JobItemWithJob[]` instead of `initialJobs: ProductionJob[]`
- Card shows: job_number + item_number, client name, item description
- Work centre badge shown if item has work_centre assigned
- Start/Pause actions update item status (not job status) — add `startItem/pauseItem` actions
- "Complete → Next Stage" calls `advanceItemToNextRoutedStage(itemId)`
- Realtime subscribes to `job_items`

**New actions in `lib/production/actions.ts`:**
```typescript
export async function getShopFloorItemsAction(stageSlug: string): Promise<JobItemWithJob[]>

export async function startItem(itemId: string): Promise<...>   // set item.status = 'in_progress'
export async function pauseItem(itemId: string): Promise<...>   // set item.status = 'pending'

export async function advanceItemToNextRoutedStage(itemId: string): Promise<...>
// Finds item.stage_routing, finds current position in it, advances to next
// If current stage is last in routing: mark item completed, log it
// If ALL items in job are completed: mark job completed
```

**Verification:** `npx tsc --noEmit` passes. Shop floor shows items for each department.

---

## Definition of Done

- [ ] Migration 028 runs cleanly
- [ ] Real department stages visible in the board UI (13 columns)
- [ ] Work centres seeded (AMD, Dacon, Sparkle under Painters)
- [ ] "From Quote" in CreateJobModal shows line items with department routing checkboxes
- [ ] Kanban board shows job_items as cards with job# + item letter
- [ ] Dragging a card between columns moves the item's current_stage_id
- [ ] Job detail panel opens when clicking a card, shows item detail + stage routing
- [ ] Work centre picker appears in detail panel when item is at Painters stage
- [ ] Shop floor shows items (not jobs) per department
- [ ] Start/Pause/Complete works on items
- [ ] "Complete → Next Stage" advances to next routed stage (not next sort_order)
- [ ] TypeScript: `npx tsc --noEmit` passes with no errors
