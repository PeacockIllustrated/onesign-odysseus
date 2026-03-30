# Phase 1: Production Job Board — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the production job board Kanban, shop floor tablet view, and quote-to-job conversion so Onesign can cancel Clarity Go (£3,960/yr).

**Architecture:** Server components fetch initial data and pass it to client components that handle DnD, realtime, and local state. Supabase Realtime pushes job updates to connected boards without full-page reloads. The shop floor is a standalone layout (`/shop-floor`) with no portal sidebar.

**Tech Stack:** Next.js 16 App Router, Supabase (PostgreSQL + Realtime), `@dnd-kit/core` for drag-and-drop, TypeScript strict, Tailwind CSS 4, Vitest.

---

## File Map

**Create:**
- `supabase/migrations/024_create_production_pipeline.sql`
- `supabase/seed_production_data.sql`
- `lib/production/types.ts`
- `lib/production/utils.ts`
- `lib/production/utils.test.ts`
- `lib/production/queries.ts`
- `lib/production/actions.ts`
- `app/(portal)/admin/jobs/page.tsx` ← replaces placeholder
- `app/(portal)/admin/jobs/JobBoardClient.tsx`
- `app/(portal)/admin/jobs/JobCard.tsx`
- `app/(portal)/admin/jobs/JobDetailPanel.tsx`
- `app/(portal)/admin/jobs/CreateJobModal.tsx`
- `app/shop-floor/ShopFloorClient.tsx`
- `app/(portal)/admin/quotes/[id]/CreateJobButton.tsx`

**Modify:**
- `app/shop-floor/page.tsx` ← replace placeholder
- `app/shop-floor/layout.tsx` ← replace placeholder
- `app/(portal)/admin/quotes/[id]/page.tsx` ← add CreateJobButton
- `app/(portal)/admin/page.tsx` ← add production stats section

---

## Task 1: Database migration 024

> Note: The spec says `022_create_production_pipeline.sql` but migrations 022 and 023 already exist. Use **024**.

**Files:**
- Create: `supabase/migrations/024_create_production_pipeline.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 024: Create Production Pipeline Tables
-- Phase 1: Job board, shop floor queue, stage tracking

-- =============================================================================
-- SEQUENCE: job numbers (monotonic, never resets)
-- =============================================================================

CREATE SEQUENCE IF NOT EXISTS job_number_seq START 1;

-- =============================================================================
-- TABLE: production_stages
-- =============================================================================

CREATE TABLE public.production_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#4e7e8c',
  is_approval_stage BOOLEAN NOT NULL DEFAULT FALSE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default stages (org_id NULL = global defaults)
INSERT INTO public.production_stages (name, slug, sort_order, color, is_approval_stage, is_default) VALUES
  ('Design',           'design',          1, '#7F77DD', FALSE, TRUE),
  ('Artwork Approval', 'artwork-approval', 2, '#D85A30', TRUE,  TRUE),
  ('Print',            'print',            3, '#378ADD', FALSE, TRUE),
  ('Fabrication',      'fabrication',      4, '#BA7517', FALSE, TRUE),
  ('Finishing',        'finishing',        5, '#D4537E', FALSE, TRUE),
  ('QC',               'qc',               6, '#2D8A5E', FALSE, TRUE),
  ('Dispatch',         'dispatch',         7, '#4e7e8c', FALSE, TRUE);

-- =============================================================================
-- TABLE: production_jobs
-- =============================================================================

CREATE TABLE public.production_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  job_number TEXT NOT NULL UNIQUE DEFAULT '',
  title TEXT NOT NULL,
  description TEXT,
  client_name TEXT NOT NULL,
  current_stage_id UUID REFERENCES public.production_stages(id),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('urgent', 'high', 'normal', 'low')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  assigned_to UUID REFERENCES auth.users(id),
  assigned_initials TEXT,
  due_date DATE,
  total_items INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- =============================================================================
-- TABLE: job_items
-- =============================================================================

CREATE TABLE public.job_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.production_jobs(id) ON DELETE CASCADE,
  quote_item_id UUID REFERENCES public.quote_items(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  current_stage_id UUID REFERENCES public.production_stages(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- TABLE: job_stage_log
-- =============================================================================

CREATE TABLE public.job_stage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.production_jobs(id) ON DELETE CASCADE,
  job_item_id UUID REFERENCES public.job_items(id) ON DELETE CASCADE,
  from_stage_id UUID REFERENCES public.production_stages(id),
  to_stage_id UUID NOT NULL REFERENCES public.production_stages(id),
  moved_by UUID REFERENCES auth.users(id),
  moved_by_name TEXT,
  notes TEXT,
  moved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- TABLE: department_instructions
-- =============================================================================

CREATE TABLE public.department_instructions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.production_jobs(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES public.production_stages(id),
  instruction TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Generate job number: JOB-YYYY-000001
CREATE OR REPLACE FUNCTION generate_job_number()
RETURNS TRIGGER AS $$
DECLARE
    seq_val BIGINT;
    year_str TEXT;
BEGIN
    seq_val := nextval('job_number_seq');
    year_str := to_char(now() AT TIME ZONE 'UTC', 'YYYY');
    NEW.job_number := 'JOB-' || year_str || '-' || lpad(seq_val::text, 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_production_jobs_number
    BEFORE INSERT ON public.production_jobs
    FOR EACH ROW
    WHEN (NEW.job_number = '' OR NEW.job_number IS NULL)
    EXECUTE FUNCTION generate_job_number();

-- Reuse update_updated_at() from migration 012
CREATE TRIGGER trg_production_jobs_updated_at
    BEFORE UPDATE ON public.production_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_production_jobs_org ON public.production_jobs(org_id);
CREATE INDEX idx_production_jobs_stage ON public.production_jobs(current_stage_id);
CREATE INDEX idx_production_jobs_status ON public.production_jobs(status);
CREATE INDEX idx_production_jobs_due ON public.production_jobs(due_date);
CREATE INDEX idx_job_items_job ON public.job_items(job_id);
CREATE INDEX idx_job_stage_log_job ON public.job_stage_log(job_id);
CREATE INDEX idx_dept_instructions_job ON public.department_instructions(job_id);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.production_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_stage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_instructions ENABLE ROW LEVEL SECURITY;

-- production_stages: readable by all authenticated users (config data)
CREATE POLICY "Authenticated users can view stages"
    ON public.production_stages FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Super admins can manage stages"
    ON public.production_stages FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- production_jobs: super admins manage all; org members can read their org's jobs
CREATE POLICY "Super admins can manage production jobs"
    ON public.production_jobs FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY "Org members can view their org jobs"
    ON public.production_jobs FOR SELECT
    USING (public.is_org_member(org_id));

-- job_items: mirror job access
CREATE POLICY "Super admins can manage job items"
    ON public.job_items FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY "Org members can view their job items"
    ON public.job_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.production_jobs pj
            WHERE pj.id = job_id AND public.is_org_member(pj.org_id)
        )
    );

-- job_stage_log: super admins only
CREATE POLICY "Super admins can manage stage log"
    ON public.job_stage_log FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- department_instructions: super admins only
CREATE POLICY "Super admins can manage department instructions"
    ON public.department_instructions FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- =============================================================================
-- REALTIME
-- =============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.production_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.job_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.job_stage_log;
```

- [ ] **Step 2: Run the migration in Supabase Studio**

Open Supabase Studio → SQL Editor → paste and run the migration file.
Verify: `production_stages` table exists and contains 7 seeded rows.

```sql
SELECT name, slug, sort_order FROM public.production_stages ORDER BY sort_order;
```

Expected output:
```
Design | design | 1
Artwork Approval | artwork-approval | 2
Print | print | 3
Fabrication | fabrication | 4
Finishing | finishing | 5
QC | qc | 6
Dispatch | dispatch | 7
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/024_create_production_pipeline.sql
git commit -m "feat: add production pipeline migrations (024)"
```

---

## Task 2: Types, utilities, and unit tests

**Files:**
- Create: `lib/production/types.ts`
- Create: `lib/production/utils.ts`
- Create: `lib/production/utils.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/production/utils.test.ts
import { describe, it, expect } from 'vitest';
import { isJobOverdue, sortJobsByPriority, formatDueDate } from './utils';
import type { ProductionJob } from './types';

describe('isJobOverdue', () => {
    it('returns false for null due date', () => {
        expect(isJobOverdue(null)).toBe(false);
    });

    it('returns true for a date in the past', () => {
        expect(isJobOverdue('2020-01-01')).toBe(true);
    });

    it('returns false for a date in the future', () => {
        expect(isJobOverdue('2099-12-31')).toBe(false);
    });
});

describe('sortJobsByPriority', () => {
    const makeJob = (priority: ProductionJob['priority'], id: string) =>
        ({ id, priority } as ProductionJob);

    it('sorts urgent → high → normal → low', () => {
        const jobs = [
            makeJob('low', 'a'),
            makeJob('normal', 'b'),
            makeJob('high', 'c'),
            makeJob('urgent', 'd'),
        ];
        const result = sortJobsByPriority(jobs);
        expect(result.map(j => j.priority)).toEqual(['urgent', 'high', 'normal', 'low']);
    });

    it('does not mutate the original array', () => {
        const jobs = [makeJob('low', 'a'), makeJob('urgent', 'b')];
        sortJobsByPriority(jobs);
        expect(jobs[0].priority).toBe('low');
    });
});

describe('formatDueDate', () => {
    it('returns null for null input', () => {
        expect(formatDueDate(null)).toBeNull();
    });

    it('formats as "15 Jan"', () => {
        expect(formatDueDate('2026-01-15')).toBe('15 Jan');
    });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm run test
```

Expected: 7 failures — `Cannot find module './utils'`.

- [ ] **Step 3: Write the types**

```typescript
// lib/production/types.ts

export type JobPriority = 'urgent' | 'high' | 'normal' | 'low';
export type JobStatus = 'active' | 'paused' | 'completed' | 'cancelled';
export type JobItemStatus = 'pending' | 'in_progress' | 'completed';

export interface ProductionStage {
    id: string;
    org_id: string | null;
    name: string;
    slug: string;
    sort_order: number;
    color: string;
    is_approval_stage: boolean;
    is_default: boolean;
    created_at: string;
}

export interface ProductionJob {
    id: string;
    org_id: string;
    quote_id: string | null;
    job_number: string;
    title: string;
    description: string | null;
    client_name: string;
    current_stage_id: string | null;
    priority: JobPriority;
    status: JobStatus;
    assigned_to: string | null;
    assigned_initials: string | null;
    due_date: string | null;
    total_items: number;
    notes: string | null;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
}

export interface JobItem {
    id: string;
    job_id: string;
    quote_item_id: string | null;
    description: string;
    quantity: number;
    current_stage_id: string | null;
    status: JobItemStatus;
    notes: string | null;
    created_at: string;
}

export interface JobStageLog {
    id: string;
    job_id: string;
    job_item_id: string | null;
    from_stage_id: string | null;
    to_stage_id: string;
    moved_by: string | null;
    moved_by_name: string | null;
    notes: string | null;
    moved_at: string;
}

export interface DepartmentInstruction {
    id: string;
    job_id: string;
    stage_id: string;
    instruction: string;
    created_by: string | null;
    created_at: string;
}

// Rich view type used in Kanban — job with its resolved stage
export interface JobWithStage extends ProductionJob {
    stage: ProductionStage | null;
}

// Board column: a stage with its jobs
export interface BoardColumn {
    stage: ProductionStage;
    jobs: JobWithStage[];
}

// Full detail for the slide-out panel
export interface JobDetail extends ProductionJob {
    stage: ProductionStage | null;
    items: JobItem[];
    stage_log: Array<JobStageLog & {
        to_stage: ProductionStage | null;
        from_stage: ProductionStage | null;
    }>;
    instructions: Array<DepartmentInstruction & {
        stage: ProductionStage | null;
    }>;
}
```

- [ ] **Step 4: Write the utilities**

```typescript
// lib/production/utils.ts

import type { ProductionJob, JobPriority } from './types';

const PRIORITY_ORDER: Record<JobPriority, number> = {
    urgent: 0,
    high: 1,
    normal: 2,
    low: 3,
};

export function isJobOverdue(dueDate: string | null): boolean {
    if (!dueDate) return false;
    // Compare date-only strings to avoid timezone shifts
    const today = new Date().toISOString().split('T')[0];
    return dueDate < today;
}

export function sortJobsByPriority(jobs: ProductionJob[]): ProductionJob[] {
    return [...jobs].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}

export function formatDueDate(dueDate: string | null): string | null {
    if (!dueDate) return null;
    return new Date(dueDate + 'T12:00:00').toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
    });
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npm run test
```

Expected: `✓ lib/production/utils.test.ts (7 tests)`

- [ ] **Step 6: Commit**

```bash
git add lib/production/types.ts lib/production/utils.ts lib/production/utils.test.ts
git commit -m "feat: add production types, utilities, and unit tests"
```

---

## Task 3: Server queries

**Files:**
- Create: `lib/production/queries.ts`

- [ ] **Step 1: Write the queries file**

```typescript
// lib/production/queries.ts
import { createServerClient } from '@/lib/supabase-server';
import type {
    ProductionStage,
    ProductionJob,
    BoardColumn,
    JobWithStage,
    JobDetail,
    JobItem,
    JobStageLog,
    DepartmentInstruction,
} from './types';

// =============================================================================
// STAGES
// =============================================================================

export async function getProductionStages(): Promise<ProductionStage[]> {
    const supabase = await createServerClient();
    const { data, error } = await supabase
        .from('production_stages')
        .select('*')
        .is('org_id', null)
        .order('sort_order', { ascending: true });

    if (error) {
        console.error('getProductionStages error:', error);
        return [];
    }
    return (data || []) as ProductionStage[];
}

// =============================================================================
// JOB BOARD
// =============================================================================

export async function getJobBoard(): Promise<BoardColumn[]> {
    const supabase = await createServerClient();

    const [stages, { data: jobs, error }] = await Promise.all([
        getProductionStages(),
        supabase
            .from('production_jobs')
            .select('*')
            .eq('status', 'active')
            .order('created_at', { ascending: true }),
    ]);

    if (error) {
        console.error('getJobBoard error:', error);
        return stages.map(stage => ({ stage, jobs: [] }));
    }

    const jobList = (jobs || []) as ProductionJob[];
    const stageMap = new Map(stages.map(s => [s.id, s]));

    return stages.map(stage => ({
        stage,
        jobs: jobList
            .filter(j => j.current_stage_id === stage.id)
            .map(j => ({ ...j, stage: stageMap.get(j.current_stage_id!) ?? null })),
    }));
}

// =============================================================================
// JOB DETAIL
// =============================================================================

export async function getJobDetail(jobId: string): Promise<JobDetail | null> {
    const supabase = await createServerClient();

    const { data: job, error: jobError } = await supabase
        .from('production_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

    if (jobError || !job) return null;

    const [
        { data: stageData },
        { data: items },
        { data: stageLog },
        { data: instructions },
    ] = await Promise.all([
        job.current_stage_id
            ? supabase.from('production_stages').select('*').eq('id', job.current_stage_id).single()
            : Promise.resolve({ data: null }),
        supabase
            .from('job_items')
            .select('*')
            .eq('job_id', jobId)
            .order('created_at', { ascending: true }),
        supabase
            .from('job_stage_log')
            .select('*')
            .eq('job_id', jobId)
            .order('moved_at', { ascending: false }),
        supabase
            .from('department_instructions')
            .select('*')
            .eq('job_id', jobId)
            .order('created_at', { ascending: true }),
    ]);

    // Resolve stage references for log entries and instructions
    const allStageIds = new Set<string>();
    (stageLog || []).forEach((l: any) => {
        if (l.to_stage_id) allStageIds.add(l.to_stage_id);
        if (l.from_stage_id) allStageIds.add(l.from_stage_id);
    });
    (instructions || []).forEach((i: any) => {
        if (i.stage_id) allStageIds.add(i.stage_id);
    });

    let stagesById: Map<string, ProductionStage> = new Map();
    if (allStageIds.size > 0) {
        const { data: stagesData } = await supabase
            .from('production_stages')
            .select('*')
            .in('id', Array.from(allStageIds));
        (stagesData || []).forEach((s: any) => stagesById.set(s.id, s));
    }

    return {
        ...(job as ProductionJob),
        stage: stageData as ProductionStage | null,
        items: (items || []) as JobItem[],
        stage_log: (stageLog || []).map((l: any) => ({
            ...l as JobStageLog,
            to_stage: stagesById.get(l.to_stage_id) ?? null,
            from_stage: l.from_stage_id ? stagesById.get(l.from_stage_id) ?? null : null,
        })),
        instructions: (instructions || []).map((i: any) => ({
            ...i as DepartmentInstruction,
            stage: stagesById.get(i.stage_id) ?? null,
        })),
    };
}

// =============================================================================
// SHOP FLOOR
// =============================================================================

export async function getShopFloorQueue(stageSlug: string): Promise<ProductionJob[]> {
    const supabase = await createServerClient();

    const { data: stage } = await supabase
        .from('production_stages')
        .select('id')
        .eq('slug', stageSlug)
        .is('org_id', null)
        .single();

    if (!stage) return [];

    const { data: jobs, error } = await supabase
        .from('production_jobs')
        .select('*')
        .eq('current_stage_id', stage.id)
        .in('status', ['active', 'paused'])
        .order('due_date', { ascending: true, nullsFirst: false });

    if (error) {
        console.error('getShopFloorQueue error:', error);
        return [];
    }
    return (jobs || []) as ProductionJob[];
}

// =============================================================================
// DASHBOARD STATS
// =============================================================================

export async function getProductionStats(): Promise<{
    totalActive: number;
    overdueCount: number;
    byStage: Array<{ name: string; color: string; count: number; sortOrder: number }>;
}> {
    const supabase = await createServerClient();
    const today = new Date().toISOString().split('T')[0];

    const [{ count: total }, { count: overdue }, { data: activeJobs }] = await Promise.all([
        supabase
            .from('production_jobs')
            .select('*', { count: 'exact', head: true })
            .in('status', ['active', 'paused']),
        supabase
            .from('production_jobs')
            .select('*', { count: 'exact', head: true })
            .in('status', ['active', 'paused'])
            .lt('due_date', today),
        supabase
            .from('production_jobs')
            .select('current_stage_id')
            .in('status', ['active', 'paused']),
    ]);

    const stages = await getProductionStages();
    const stageMap = new Map(stages.map(s => [s.id, s]));
    const stageCounts = new Map<string, number>();
    for (const job of activeJobs || []) {
        if (job.current_stage_id) {
            stageCounts.set(job.current_stage_id, (stageCounts.get(job.current_stage_id) || 0) + 1);
        }
    }

    return {
        totalActive: total || 0,
        overdueCount: overdue || 0,
        byStage: stages.map(s => ({
            name: s.name,
            color: s.color,
            count: stageCounts.get(s.id) || 0,
            sortOrder: s.sort_order,
        })),
    };
}

// =============================================================================
// ACCEPTED QUOTES WITHOUT JOBS (for CreateJobModal)
// =============================================================================

export async function getAcceptedQuotesWithoutJobs(): Promise<
    Array<{ id: string; quote_number: string; customer_name: string | null }>
> {
    const supabase = await createServerClient();

    const { data: quotes, error } = await supabase
        .from('quotes')
        .select('id, quote_number, customer_name')
        .eq('status', 'accepted')
        .order('created_at', { ascending: false });

    if (error || !quotes) return [];

    const quoteIds = quotes.map(q => q.id);
    if (quoteIds.length === 0) return [];

    const { data: existingJobs } = await supabase
        .from('production_jobs')
        .select('quote_id')
        .in('quote_id', quoteIds);

    const convertedIds = new Set((existingJobs || []).map(j => j.quote_id).filter(Boolean));

    return quotes.filter(q => !convertedIds.has(q.id)) as Array<{
        id: string;
        quote_number: string;
        customer_name: string | null;
    }>;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/production/queries.ts
git commit -m "feat: add production queries (board, detail, shop floor, stats)"
```

---

## Task 4: Server actions (mutations)

**Files:**
- Create: `lib/production/actions.ts`

- [ ] **Step 1: Write the actions file**

```typescript
// lib/production/actions.ts
'use server';

import { createServerClient } from '@/lib/supabase-server';
import { getUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import type { JobDetail, JobPriority } from './types';
import { getJobDetail, getAcceptedQuotesWithoutJobs } from './queries';

// =============================================================================
// SERVER ACTIONS EXPOSED TO CLIENT COMPONENTS
// =============================================================================

/** Fetch full job detail — callable from client components */
export async function getJobDetailAction(jobId: string): Promise<JobDetail | null> {
    return getJobDetail(jobId);
}

/** Fetch accepted quotes without jobs — callable from CreateJobModal */
export async function getAcceptedQuotesAction(): Promise<
    Array<{ id: string; quote_number: string; customer_name: string | null }>
> {
    return getAcceptedQuotesWithoutJobs();
}

// =============================================================================
// createJobFromQuote
// =============================================================================

export async function createJobFromQuote(
    quoteId: string,
    orgId: string
): Promise<{ id: string; jobNumber: string } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();

    const { data: quote, error: quoteError } = await supabase
        .from('quotes')
        .select('id, quote_number, customer_name, status')
        .eq('id', quoteId)
        .single();

    if (quoteError || !quote) return { error: 'Quote not found' };
    if (quote.status !== 'accepted') return { error: 'Quote must be accepted before creating a job' };

    const { data: existingJob } = await supabase
        .from('production_jobs')
        .select('id')
        .eq('quote_id', quoteId)
        .maybeSingle();

    if (existingJob) return { error: 'A production job already exists for this quote' };

    const { data: designStage } = await supabase
        .from('production_stages')
        .select('id')
        .eq('slug', 'design')
        .is('org_id', null)
        .single();

    if (!designStage) return { error: 'Design stage not found — run migration 024 first' };

    const { data: quoteItems } = await supabase
        .from('quote_items')
        .select('id, item_type')
        .eq('quote_id', quoteId)
        .order('created_at', { ascending: true });

    const items = quoteItems || [];
    const title = quote.customer_name
        ? `${quote.customer_name} — ${quote.quote_number}`
        : quote.quote_number;

    const { data: newJob, error: jobError } = await supabase
        .from('production_jobs')
        .insert({
            org_id: orgId,
            quote_id: quoteId,
            title,
            client_name: quote.customer_name || quote.quote_number,
            current_stage_id: designStage.id,
            priority: 'normal',
            status: 'active',
            total_items: items.length || 1,
        })
        .select('id, job_number')
        .single();

    if (jobError || !newJob) {
        console.error('createJobFromQuote error:', jobError);
        return { error: jobError?.message || 'Failed to create job' };
    }

    if (items.length > 0) {
        await supabase.from('job_items').insert(
            items.map(item => ({
                job_id: newJob.id,
                quote_item_id: item.id,
                description: item.item_type === 'panel_letters_v1' ? 'Panel + Letters' : item.item_type,
                quantity: 1,
                current_stage_id: designStage.id,
                status: 'pending',
            }))
        );
    }

    await supabase.from('job_stage_log').insert({
        job_id: newJob.id,
        from_stage_id: null,
        to_stage_id: designStage.id,
        moved_by: user.id,
        moved_by_name: user.email,
        notes: `Job created from quote ${quote.quote_number}`,
    });

    revalidatePath('/app/admin/jobs');
    revalidatePath(`/app/admin/quotes/${quoteId}`);
    return { id: newJob.id, jobNumber: newJob.job_number };
}

// =============================================================================
// createManualJob
// =============================================================================

export async function createManualJob(input: {
    orgId: string;
    title: string;
    clientName: string;
    description?: string;
    priority: JobPriority;
    dueDate?: string;
    assignedInitials?: string;
}): Promise<{ id: string; jobNumber: string } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();

    const { data: designStage } = await supabase
        .from('production_stages')
        .select('id')
        .eq('slug', 'design')
        .is('org_id', null)
        .single();

    if (!designStage) return { error: 'Design stage not found — run migration 024 first' };

    const { data: newJob, error } = await supabase
        .from('production_jobs')
        .insert({
            org_id: input.orgId,
            title: input.title,
            client_name: input.clientName,
            description: input.description || null,
            current_stage_id: designStage.id,
            priority: input.priority,
            status: 'active',
            due_date: input.dueDate || null,
            assigned_initials: input.assignedInitials || null,
            total_items: 1,
        })
        .select('id, job_number')
        .single();

    if (error || !newJob) {
        console.error('createManualJob error:', error);
        return { error: error?.message || 'Failed to create job' };
    }

    await supabase.from('job_stage_log').insert({
        job_id: newJob.id,
        from_stage_id: null,
        to_stage_id: designStage.id,
        moved_by: user.id,
        moved_by_name: user.email,
        notes: 'Job created manually',
    });

    revalidatePath('/app/admin/jobs');
    return { id: newJob.id, jobNumber: newJob.job_number };
}

// =============================================================================
// moveJobToStage
// =============================================================================

export async function moveJobToStage(
    jobId: string,
    stageId: string,
    notes?: string
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();

    const { data: job } = await supabase
        .from('production_jobs')
        .select('current_stage_id')
        .eq('id', jobId)
        .single();

    if (!job) return { error: 'Job not found' };

    const { error } = await supabase
        .from('production_jobs')
        .update({ current_stage_id: stageId })
        .eq('id', jobId);

    if (error) return { error: error.message };

    await supabase.from('job_stage_log').insert({
        job_id: jobId,
        from_stage_id: job.current_stage_id,
        to_stage_id: stageId,
        moved_by: user.id,
        moved_by_name: user.email,
        notes: notes || null,
    });

    revalidatePath('/app/admin/jobs');
    return { success: true };
}

// =============================================================================
// moveJobItemToStage
// =============================================================================

export async function moveJobItemToStage(
    jobItemId: string,
    stageId: string,
    notes?: string
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();

    const { data: item } = await supabase
        .from('job_items')
        .select('job_id, current_stage_id')
        .eq('id', jobItemId)
        .single();

    if (!item) return { error: 'Item not found' };

    const { error } = await supabase
        .from('job_items')
        .update({ current_stage_id: stageId, status: 'in_progress' })
        .eq('id', jobItemId);

    if (error) return { error: error.message };

    await supabase.from('job_stage_log').insert({
        job_id: item.job_id,
        job_item_id: jobItemId,
        from_stage_id: item.current_stage_id,
        to_stage_id: stageId,
        moved_by: user.id,
        moved_by_name: user.email,
        notes: notes || null,
    });

    revalidatePath('/app/admin/jobs');
    return { success: true };
}

// =============================================================================
// startJob / pauseJob / completeJob (shop floor actions)
// =============================================================================

export async function startJob(jobId: string): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();
    const { error } = await supabase
        .from('production_jobs')
        .update({ status: 'active' })
        .eq('id', jobId);

    if (error) return { error: error.message };
    revalidatePath('/shop-floor');
    return { success: true };
}

export async function pauseJob(jobId: string): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();
    const { error } = await supabase
        .from('production_jobs')
        .update({ status: 'paused' })
        .eq('id', jobId);

    if (error) return { error: error.message };
    revalidatePath('/shop-floor');
    return { success: true };
}

export async function completeJob(
    jobId: string
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();

    // Get dispatch stage
    const { data: dispatchStage } = await supabase
        .from('production_stages')
        .select('id')
        .eq('slug', 'dispatch')
        .is('org_id', null)
        .single();

    const updates: Record<string, unknown> = {
        status: 'completed',
        completed_at: new Date().toISOString(),
    };
    if (dispatchStage) updates.current_stage_id = dispatchStage.id;

    const { error } = await supabase
        .from('production_jobs')
        .update(updates)
        .eq('id', jobId);

    if (error) return { error: error.message };
    revalidatePath('/shop-floor');
    revalidatePath('/app/admin/jobs');
    return { success: true };
}

// =============================================================================
// advanceJobToNextStage (shop floor "Complete" button)
// =============================================================================

export async function advanceJobToNextStage(
    jobId: string
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();

    const { data: job } = await supabase
        .from('production_jobs')
        .select('current_stage_id')
        .eq('id', jobId)
        .single();

    if (!job?.current_stage_id) return { error: 'Job has no current stage' };

    const { data: currentStage } = await supabase
        .from('production_stages')
        .select('sort_order')
        .eq('id', job.current_stage_id)
        .single();

    if (!currentStage) return { error: 'Stage not found' };

    const { data: nextStage } = await supabase
        .from('production_stages')
        .select('id')
        .is('org_id', null)
        .eq('sort_order', currentStage.sort_order + 1)
        .single();

    if (!nextStage) {
        // Already at last stage — mark complete
        return completeJob(jobId);
    }

    return moveJobToStage(jobId, nextStage.id, 'Advanced from shop floor');
}

// =============================================================================
// updateJobPriority / updateJobAssignment
// =============================================================================

export async function updateJobPriority(
    jobId: string,
    priority: JobPriority
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();
    const { error } = await supabase
        .from('production_jobs')
        .update({ priority })
        .eq('id', jobId);

    if (error) return { error: error.message };
    revalidatePath('/app/admin/jobs');
    return { success: true };
}

export async function updateJobAssignment(
    jobId: string,
    initials: string
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();
    const { error } = await supabase
        .from('production_jobs')
        .update({ assigned_initials: initials || null })
        .eq('id', jobId);

    if (error) return { error: error.message };
    revalidatePath('/app/admin/jobs');
    return { success: true };
}

// =============================================================================
// addDepartmentInstruction
// =============================================================================

export async function addDepartmentInstruction(
    jobId: string,
    stageId: string,
    instruction: string
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();
    const { error } = await supabase
        .from('department_instructions')
        .insert({ job_id: jobId, stage_id: stageId, instruction, created_by: user.id });

    if (error) return { error: error.message };
    revalidatePath('/app/admin/jobs');
    return { success: true };
}
```

- [ ] **Step 2: Run build to check types compile**

```bash
npm run build 2>&1 | head -30
```

Expected: compiles (may warn on unused imports — fix if red errors).

- [ ] **Step 3: Commit**

```bash
git add lib/production/actions.ts
git commit -m "feat: add production server actions"
```

---

## Task 5: Install DnD dependency

**Files:** `package.json`, `package-lock.json`

- [ ] **Step 1: Install**

```bash
npm install @dnd-kit/core @dnd-kit/utilities
```

- [ ] **Step 2: Verify install**

```bash
node -e "require('@dnd-kit/core'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @dnd-kit/core for kanban drag and drop"
```

---

## Task 6: Job board — page, columns, card

**Files:**
- Modify: `app/(portal)/admin/jobs/page.tsx`
- Create: `app/(portal)/admin/jobs/JobCard.tsx`
- Create: `app/(portal)/admin/jobs/JobBoardClient.tsx`

- [ ] **Step 1: Write JobCard**

```tsx
// app/(portal)/admin/jobs/JobCard.tsx
'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { AlertCircle } from 'lucide-react';
import type { JobWithStage } from '@/lib/production/types';
import { isJobOverdue, formatDueDate } from '@/lib/production/utils';

const PRIORITY_BORDER: Record<string, string> = {
    urgent: 'border-l-red-500',
    high: 'border-l-amber-400',
    normal: 'border-l-neutral-200',
    low: 'border-l-neutral-100',
};

const PRIORITY_LABEL: Record<string, string> = {
    urgent: 'bg-red-50 text-red-700',
    high: 'bg-amber-50 text-amber-700',
    normal: '',
    low: '',
};

interface JobCardProps {
    job: JobWithStage;
    onClick: () => void;
}

export function JobCard({ job, onClick }: JobCardProps) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: job.id,
    });

    const style = {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 50 : undefined,
    };

    const overdue = isJobOverdue(job.due_date);

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            onClick={onClick}
            className={`
                bg-white rounded-[var(--radius-sm)] border-l-4 border border-neutral-200
                ${PRIORITY_BORDER[job.priority]}
                shadow-sm hover:shadow-md transition-all cursor-pointer select-none p-3
                ${isDragging ? 'rotate-1 shadow-lg' : ''}
            `}
        >
            <div className="flex items-start justify-between gap-2 mb-1">
                <code className="text-[10px] font-mono text-[#4e7e8c] font-semibold tracking-tight">
                    {job.job_number}
                </code>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                    {job.priority !== 'normal' && job.priority !== 'low' && (
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${PRIORITY_LABEL[job.priority]}`}>
                            {job.priority}
                        </span>
                    )}
                    {job.assigned_initials && (
                        <div className="w-5 h-5 rounded-full bg-[#4e7e8c] flex items-center justify-center">
                            <span className="text-[9px] text-white font-bold leading-none">
                                {job.assigned_initials}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            <p className="text-sm font-semibold text-neutral-900 leading-tight mb-0.5 truncate">
                {job.client_name}
            </p>
            <p className="text-xs text-neutral-500 leading-snug mb-2 line-clamp-2">
                {job.title}
            </p>

            <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-neutral-400">
                    {job.total_items} item{job.total_items !== 1 ? 's' : ''}
                </span>
                {job.due_date && (
                    <span className={`text-[10px] flex items-center gap-0.5 ${
                        overdue ? 'text-red-600 font-semibold' : 'text-neutral-400'
                    }`}>
                        {overdue && <AlertCircle size={10} />}
                        {formatDueDate(job.due_date)}
                    </span>
                )}
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Write JobBoardClient**

```tsx
// app/(portal)/admin/jobs/JobBoardClient.tsx
'use client';

import { useState, useEffect } from 'react';
import {
    DndContext,
    DragEndEvent,
    DragOverlay,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase';
import { moveJobToStage } from '@/lib/production/actions';
import type { BoardColumn, JobWithStage, ProductionJob, ProductionStage } from '@/lib/production/types';
import { JobCard } from './JobCard';
import { JobDetailPanel } from './JobDetailPanel';
import { CreateJobModal } from './CreateJobModal';

interface JobBoardClientProps {
    initialBoard: BoardColumn[];
    stages: ProductionStage[];
}

export function JobBoardClient({ initialBoard, stages }: JobBoardClientProps) {
    const [board, setBoard] = useState<BoardColumn[]>(initialBoard);
    const [detailJobId, setDetailJobId] = useState<string | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [draggingJob, setDraggingJob] = useState<JobWithStage | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
    );

    // Realtime: update board state when other users move jobs
    useEffect(() => {
        const supabase = createBrowserClient();
        const stageMap = new Map(stages.map(s => [s.id, s]));

        const channel = supabase
            .channel('job_board_realtime')
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'production_jobs' },
                (payload) => {
                    const updated = payload.new as ProductionJob;
                    setBoard(prev =>
                        prev.map(col => {
                            const filtered = col.jobs.filter(j => j.id !== updated.id);
                            if (col.stage.id === updated.current_stage_id) {
                                const stage = stageMap.get(updated.current_stage_id!) ?? null;
                                return {
                                    ...col,
                                    jobs: [...filtered, { ...updated, stage }],
                                };
                            }
                            return { ...col, jobs: filtered };
                        })
                    );
                }
            )
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'production_jobs' },
                (payload) => {
                    const newJob = payload.new as ProductionJob;
                    const stage = newJob.current_stage_id
                        ? stageMap.get(newJob.current_stage_id) ?? null
                        : null;
                    setBoard(prev =>
                        prev.map(col =>
                            col.stage.id === newJob.current_stage_id
                                ? { ...col, jobs: [...col.jobs, { ...newJob, stage }] }
                                : col
                        )
                    );
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [stages]);

    function handleDragStart(event: any) {
        const jobId = event.active.id as string;
        const job = board.flatMap(c => c.jobs).find(j => j.id === jobId) ?? null;
        setDraggingJob(job);
    }

    async function handleDragEnd(event: DragEndEvent) {
        setDraggingJob(null);
        const { active, over } = event;
        if (!over) return;

        const jobId = active.id as string;
        const newStageId = over.id as string;
        const currentJob = board.flatMap(c => c.jobs).find(j => j.id === jobId);
        if (!currentJob || currentJob.current_stage_id === newStageId) return;

        const targetStage = stages.find(s => s.id === newStageId);
        if (!targetStage) return;

        // Optimistic update
        setBoard(prev =>
            prev.map(col => {
                const without = col.jobs.filter(j => j.id !== jobId);
                if (col.stage.id === newStageId) {
                    return {
                        ...col,
                        jobs: [...without, { ...currentJob, current_stage_id: newStageId, stage: targetStage }],
                    };
                }
                return { ...col, jobs: without };
            })
        );

        const result = await moveJobToStage(jobId, newStageId);
        if ('error' in result) {
            // Revert on failure
            setBoard(initialBoard);
            console.error('Failed to move job:', result.error);
        }
    }

    const totalJobs = board.flatMap(c => c.jobs).length;

    return (
        <>
            <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-neutral-500">
                    {totalJobs} active job{totalJobs !== 1 ? 's' : ''}
                </span>
                <button
                    onClick={() => setCreateOpen(true)}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-[#4e7e8c] hover:bg-[#3a5f6a] rounded-[var(--radius-sm)] transition-colors"
                >
                    <Plus size={14} />
                    New job
                </button>
            </div>

            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                <div className="flex gap-3 overflow-x-auto pb-6 flex-1 min-h-0">
                    {board.map(col => (
                        <KanbanColumn
                            key={col.stage.id}
                            column={col}
                            onCardClick={setDetailJobId}
                        />
                    ))}
                </div>

                <DragOverlay>
                    {draggingJob && (
                        <div className="rotate-2 opacity-90">
                            <JobCard job={draggingJob} onClick={() => {}} />
                        </div>
                    )}
                </DragOverlay>
            </DndContext>

            {detailJobId && (
                <JobDetailPanel
                    jobId={detailJobId}
                    onClose={() => setDetailJobId(null)}
                    stages={stages}
                />
            )}

            <CreateJobModal
                open={createOpen}
                onClose={() => setCreateOpen(false)}
            />
        </>
    );
}

function KanbanColumn({
    column,
    onCardClick,
}: {
    column: BoardColumn;
    onCardClick: (id: string) => void;
}) {
    const { isOver, setNodeRef } = useDroppable({ id: column.stage.id });

    return (
        <div
            ref={setNodeRef}
            className={`
                flex-shrink-0 w-[272px] flex flex-col rounded-lg border border-neutral-200/60
                transition-colors duration-150
                ${isOver ? 'border-[#4e7e8c] shadow-sm' : ''}
            `}
            style={{ backgroundColor: `${column.stage.color}0d` }}
        >
            {/* Column header */}
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-neutral-200/60">
                <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: column.stage.color }}
                />
                <span className="text-xs font-semibold text-neutral-700 uppercase tracking-wider flex-1 truncate">
                    {column.stage.name}
                </span>
                <span className="text-xs text-neutral-400 bg-white/70 px-1.5 py-0.5 rounded font-medium">
                    {column.jobs.length}
                </span>
            </div>

            {/* Cards */}
            <div className="p-2 flex-1 space-y-2 min-h-[120px]">
                {column.jobs.map(job => (
                    <JobCard
                        key={job.id}
                        job={job}
                        onClick={() => onCardClick(job.id)}
                    />
                ))}
            </div>
        </div>
    );
}
```

- [ ] **Step 3: Write the server page**

```tsx
// app/(portal)/admin/jobs/page.tsx
import { requireAdmin } from '@/lib/auth';
import { getJobBoard, getProductionStages } from '@/lib/production/queries';
import { JobBoardClient } from './JobBoardClient';

export default async function JobBoardPage() {
    await requireAdmin();

    const [boardData, stages] = await Promise.all([
        getJobBoard(),
        getProductionStages(),
    ]);

    return (
        <div className="flex flex-col h-full">
            <div className="mb-4">
                <h1 className="text-xl font-bold text-neutral-900 tracking-tight">Production Job Board</h1>
                <p className="text-sm text-neutral-500 mt-0.5">Active jobs across all stages</p>
            </div>
            <JobBoardClient initialBoard={boardData} stages={stages} />
        </div>
    );
}
```

- [ ] **Step 4: Run build check**

```bash
npm run build 2>&1 | tail -20
```

Expected: clean compile, `/admin/jobs` appears in route output.

- [ ] **Step 5: Commit**

```bash
git add app/\(portal\)/admin/jobs/
git commit -m "feat: job board page, column layout, and card component"
```

---

## Task 7: Job detail panel

**Files:**
- Create: `app/(portal)/admin/jobs/JobDetailPanel.tsx`

- [ ] **Step 1: Write JobDetailPanel**

```tsx
// app/(portal)/admin/jobs/JobDetailPanel.tsx
'use client';

import { useState, useEffect, useTransition } from 'react';
import { X, Clock, ChevronRight, AlertCircle, Plus } from 'lucide-react';
import type { JobDetail, ProductionStage } from '@/lib/production/types';
import {
    getJobDetailAction,
    moveJobToStage,
    addDepartmentInstruction,
    updateJobPriority,
    updateJobAssignment,
} from '@/lib/production/actions';
import { isJobOverdue, formatDueDate } from '@/lib/production/utils';

interface JobDetailPanelProps {
    jobId: string;
    onClose: () => void;
    stages: ProductionStage[];
}

export function JobDetailPanel({ jobId, onClose, stages }: JobDetailPanelProps) {
    const [detail, setDetail] = useState<JobDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [isPending, startTransition] = useTransition();
    const [newInstruction, setNewInstruction] = useState('');
    const [instructionStageId, setInstructionStageId] = useState('');

    useEffect(() => {
        setLoading(true);
        getJobDetailAction(jobId).then(d => {
            setDetail(d);
            setLoading(false);
        });
    }, [jobId]);

    async function handleMoveStage(stageId: string) {
        startTransition(async () => {
            await moveJobToStage(jobId, stageId);
            const updated = await getJobDetailAction(jobId);
            setDetail(updated);
        });
    }

    async function handleAddInstruction() {
        if (!newInstruction.trim() || !instructionStageId) return;
        await addDepartmentInstruction(jobId, instructionStageId, newInstruction.trim());
        setNewInstruction('');
        const updated = await getJobDetailAction(jobId);
        setDetail(updated);
    }

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/30 z-40"
                onClick={onClose}
            />

            {/* Panel */}
            <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
                    <div>
                        {detail ? (
                            <>
                                <code className="text-xs font-mono text-[#4e7e8c] font-semibold">
                                    {detail.job_number}
                                </code>
                                <p className="text-sm font-semibold text-neutral-900 mt-0.5">
                                    {detail.client_name}
                                </p>
                            </>
                        ) : (
                            <div className="h-8 w-48 bg-neutral-100 rounded animate-pulse" />
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-neutral-400 hover:text-neutral-700 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {loading ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-sm text-neutral-500">Loading…</div>
                    </div>
                ) : !detail ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-sm text-neutral-500">Job not found</div>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto p-5 space-y-6">
                        {/* Meta */}
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p className="text-xs font-medium text-neutral-500 uppercase mb-1">Stage</p>
                                <div className="flex items-center gap-2">
                                    {detail.stage && (
                                        <div
                                            className="w-2 h-2 rounded-full"
                                            style={{ backgroundColor: detail.stage.color }}
                                        />
                                    )}
                                    <span>{detail.stage?.name ?? '—'}</span>
                                </div>
                            </div>
                            <div>
                                <p className="text-xs font-medium text-neutral-500 uppercase mb-1">Priority</p>
                                <span className={`capitalize font-medium ${
                                    detail.priority === 'urgent' ? 'text-red-600' :
                                    detail.priority === 'high' ? 'text-amber-600' : 'text-neutral-700'
                                }`}>
                                    {detail.priority}
                                </span>
                            </div>
                            <div>
                                <p className="text-xs font-medium text-neutral-500 uppercase mb-1">Due Date</p>
                                <span className={isJobOverdue(detail.due_date) ? 'text-red-600 font-semibold flex items-center gap-1' : 'text-neutral-700'}>
                                    {isJobOverdue(detail.due_date) && <AlertCircle size={12} />}
                                    {formatDueDate(detail.due_date) ?? '—'}
                                </span>
                            </div>
                            <div>
                                <p className="text-xs font-medium text-neutral-500 uppercase mb-1">Assigned</p>
                                <span>{detail.assigned_initials ?? '—'}</span>
                            </div>
                        </div>

                        {detail.notes && (
                            <div>
                                <p className="text-xs font-medium text-neutral-500 uppercase mb-1">Notes</p>
                                <p className="text-sm text-neutral-700 whitespace-pre-wrap">{detail.notes}</p>
                            </div>
                        )}

                        {/* Move to stage */}
                        <div>
                            <p className="text-xs font-medium text-neutral-500 uppercase mb-2">Move to Stage</p>
                            <div className="flex flex-wrap gap-2">
                                {stages.map(s => (
                                    <button
                                        key={s.id}
                                        disabled={s.id === detail.current_stage_id || isPending}
                                        onClick={() => handleMoveStage(s.id)}
                                        className={`
                                            flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-colors
                                            ${s.id === detail.current_stage_id
                                                ? 'bg-neutral-900 text-white cursor-default'
                                                : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 disabled:opacity-50'}
                                        `}
                                    >
                                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                                        {s.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Job items */}
                        {detail.items.length > 0 && (
                            <div>
                                <p className="text-xs font-medium text-neutral-500 uppercase mb-2">
                                    Items ({detail.items.length})
                                </p>
                                <div className="space-y-1">
                                    {detail.items.map(item => (
                                        <div
                                            key={item.id}
                                            className="flex items-center justify-between py-1.5 px-3 bg-neutral-50 rounded text-sm"
                                        >
                                            <span className="text-neutral-700">{item.description}</span>
                                            <span className={`text-xs px-1.5 py-0.5 rounded capitalize ${
                                                item.status === 'completed' ? 'bg-green-100 text-green-700' :
                                                item.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                                                'bg-neutral-200 text-neutral-600'
                                            }`}>
                                                {item.status.replace('_', ' ')}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Department instructions */}
                        <div>
                            <p className="text-xs font-medium text-neutral-500 uppercase mb-2">Department Instructions</p>
                            {detail.instructions.length > 0 ? (
                                <div className="space-y-2 mb-3">
                                    {detail.instructions.map(inst => (
                                        <div key={inst.id} className="bg-amber-50 border border-amber-200 rounded p-3">
                                            {inst.stage && (
                                                <p className="text-[10px] font-semibold uppercase text-amber-700 mb-1">
                                                    {inst.stage.name}
                                                </p>
                                            )}
                                            <p className="text-sm text-neutral-800">{inst.instruction}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-neutral-400 mb-3">No instructions yet</p>
                            )}

                            {/* Add instruction */}
                            <div className="space-y-2">
                                <select
                                    value={instructionStageId}
                                    onChange={e => setInstructionStageId(e.target.value)}
                                    className="w-full text-sm border border-neutral-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#4e7e8c]"
                                >
                                    <option value="">Select stage…</option>
                                    {stages.map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newInstruction}
                                        onChange={e => setNewInstruction(e.target.value)}
                                        placeholder="Add instruction for this stage…"
                                        className="flex-1 text-sm border border-neutral-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#4e7e8c]"
                                        onKeyDown={e => e.key === 'Enter' && handleAddInstruction()}
                                    />
                                    <button
                                        onClick={handleAddInstruction}
                                        disabled={!newInstruction.trim() || !instructionStageId}
                                        className="px-3 py-1.5 text-sm bg-[#4e7e8c] text-white rounded disabled:opacity-40 hover:bg-[#3a5f6a] transition-colors"
                                    >
                                        <Plus size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Stage log */}
                        {detail.stage_log.length > 0 && (
                            <div>
                                <p className="text-xs font-medium text-neutral-500 uppercase mb-2">Stage History</p>
                                <div className="space-y-1">
                                    {detail.stage_log.map(entry => (
                                        <div key={entry.id} className="flex items-start gap-2 text-xs text-neutral-500 py-1">
                                            <Clock size={12} className="mt-0.5 flex-shrink-0" />
                                            <div>
                                                <span className="text-neutral-700">
                                                    {entry.from_stage ? `${entry.from_stage.name} → ` : ''}
                                                    <span className="font-medium">{entry.to_stage?.name}</span>
                                                </span>
                                                {entry.moved_by_name && (
                                                    <span className="ml-1">by {entry.moved_by_name}</span>
                                                )}
                                                {entry.notes && (
                                                    <p className="text-neutral-400 italic mt-0.5">{entry.notes}</p>
                                                )}
                                                <p className="text-neutral-300 mt-0.5">
                                                    {new Date(entry.moved_at).toLocaleString('en-GB', {
                                                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                                                    })}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(portal)/admin/jobs/JobDetailPanel.tsx"
git commit -m "feat: job detail slide-out panel with stage log and instructions"
```

---

## Task 8: Create job modal

**Files:**
- Create: `app/(portal)/admin/jobs/CreateJobModal.tsx`

- [ ] **Step 1: Write CreateJobModal**

```tsx
// app/(portal)/admin/jobs/CreateJobModal.tsx
'use client';

import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
    createManualJob,
    createJobFromQuote,
    getAcceptedQuotesAction,
} from '@/lib/production/actions';

interface CreateJobModalProps {
    open: boolean;
    onClose: () => void;
}

type Tab = 'manual' | 'from-quote';

// Hard-coded org list for Phase 1. Replace with dynamic fetch when multi-tenant is live.
// These are the known Onesign client orgs — update as new orgs are added.
const KNOWN_ORGS = [
    { id: '_placeholder_', name: '— Select org —' },
    // Populated at runtime from Supabase — see note below
];

export function CreateJobModal({ open, onClose }: CreateJobModalProps) {
    const router = useRouter();
    const [tab, setTab] = useState<Tab>('manual');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Manual form state
    const [title, setTitle] = useState('');
    const [clientName, setClientName] = useState('');
    const [description, setDescription] = useState('');
    const [priority, setPriority] = useState<'urgent' | 'high' | 'normal' | 'low'>('normal');
    const [dueDate, setDueDate] = useState('');
    const [assignedInitials, setAssignedInitials] = useState('');
    const [orgId, setOrgId] = useState('');
    const [orgs, setOrgs] = useState<Array<{ id: string; name: string }>>([]);

    // Quote tab state
    const [quotes, setQuotes] = useState<Array<{ id: string; quote_number: string; customer_name: string | null }>>([]);
    const [selectedQuoteId, setSelectedQuoteId] = useState('');
    const [quotesLoading, setQuotesLoading] = useState(false);

    // Fetch orgs and quotes when modal opens
    useEffect(() => {
        if (!open) return;

        // Fetch orgs
        import('@/lib/production/actions').then(({ getOrgListAction }) => {
            getOrgListAction().then(setOrgs);
        });

        // Fetch quotes for from-quote tab
        setQuotesLoading(true);
        getAcceptedQuotesAction().then(q => {
            setQuotes(q);
            setQuotesLoading(false);
        });
    }, [open]);

    async function handleManualSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!title.trim() || !clientName.trim() || !orgId) return;
        setSubmitting(true);
        setError(null);

        const result = await createManualJob({
            orgId,
            title: title.trim(),
            clientName: clientName.trim(),
            description: description.trim() || undefined,
            priority,
            dueDate: dueDate || undefined,
            assignedInitials: assignedInitials.trim() || undefined,
        });

        setSubmitting(false);
        if ('error' in result) {
            setError(result.error);
        } else {
            onClose();
            router.push('/app/admin/jobs');
        }
    }

    async function handleFromQuoteSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!selectedQuoteId || !orgId) return;
        setSubmitting(true);
        setError(null);

        const result = await createJobFromQuote(selectedQuoteId, orgId);

        setSubmitting(false);
        if ('error' in result) {
            setError(result.error);
        } else {
            onClose();
            router.push('/app/admin/jobs');
        }
    }

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />
            <div className="relative bg-white rounded-[var(--radius-md)] shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
                    <h2 className="text-sm font-semibold text-neutral-900">New Production Job</h2>
                    <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-neutral-200">
                    {(['manual', 'from-quote'] as Tab[]).map(t => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                                tab === t
                                    ? 'border-b-2 border-[#4e7e8c] text-[#4e7e8c]'
                                    : 'text-neutral-500 hover:text-neutral-700'
                            }`}
                        >
                            {t === 'manual' ? 'Manual' : 'From Accepted Quote'}
                        </button>
                    ))}
                </div>

                <div className="p-5">
                    {error && (
                        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">
                            {error}
                        </p>
                    )}

                    {/* Org picker (shared) */}
                    <div className="mb-4">
                        <label className="block text-xs font-medium text-neutral-700 mb-1">Client Org *</label>
                        <select
                            value={orgId}
                            onChange={e => setOrgId(e.target.value)}
                            required
                            className="w-full text-sm border border-neutral-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#4e7e8c]"
                        >
                            <option value="">Select org…</option>
                            {orgs.map(o => (
                                <option key={o.id} value={o.id}>{o.name}</option>
                            ))}
                        </select>
                    </div>

                    {tab === 'manual' ? (
                        <form onSubmit={handleManualSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-neutral-700 mb-1">Job Title *</label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    required
                                    placeholder="e.g. Plot signage — Whitburn Meadows Ph.3"
                                    className="w-full text-sm border border-neutral-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#4e7e8c]"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-neutral-700 mb-1">Client Name *</label>
                                <input
                                    type="text"
                                    value={clientName}
                                    onChange={e => setClientName(e.target.value)}
                                    required
                                    placeholder="e.g. Persimmon Homes"
                                    className="w-full text-sm border border-neutral-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#4e7e8c]"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-neutral-700 mb-1">Priority</label>
                                    <select
                                        value={priority}
                                        onChange={e => setPriority(e.target.value as typeof priority)}
                                        className="w-full text-sm border border-neutral-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#4e7e8c]"
                                    >
                                        <option value="urgent">Urgent</option>
                                        <option value="high">High</option>
                                        <option value="normal">Normal</option>
                                        <option value="low">Low</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-neutral-700 mb-1">Assignee Initials</label>
                                    <input
                                        type="text"
                                        value={assignedInitials}
                                        onChange={e => setAssignedInitials(e.target.value.toUpperCase().slice(0, 3))}
                                        maxLength={3}
                                        placeholder="MP"
                                        className="w-full text-sm border border-neutral-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#4e7e8c]"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-neutral-700 mb-1">Due Date</label>
                                <input
                                    type="date"
                                    value={dueDate}
                                    onChange={e => setDueDate(e.target.value)}
                                    className="w-full text-sm border border-neutral-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#4e7e8c]"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={submitting || !title.trim() || !clientName.trim() || !orgId}
                                className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium text-white bg-[#4e7e8c] hover:bg-[#3a5f6a] disabled:opacity-50 rounded-[var(--radius-sm)] transition-colors"
                            >
                                {submitting && <Loader2 size={14} className="animate-spin" />}
                                Create Job
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={handleFromQuoteSubmit} className="space-y-4">
                            {quotesLoading ? (
                                <p className="text-sm text-neutral-500 text-center py-4">Loading quotes…</p>
                            ) : quotes.length === 0 ? (
                                <p className="text-sm text-neutral-500 text-center py-4">
                                    No accepted quotes without existing jobs.
                                </p>
                            ) : (
                                <div>
                                    <label className="block text-xs font-medium text-neutral-700 mb-1">
                                        Select Quote *
                                    </label>
                                    <select
                                        value={selectedQuoteId}
                                        onChange={e => setSelectedQuoteId(e.target.value)}
                                        required
                                        className="w-full text-sm border border-neutral-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#4e7e8c]"
                                    >
                                        <option value="">Select a quote…</option>
                                        {quotes.map(q => (
                                            <option key={q.id} value={q.id}>
                                                {q.quote_number} — {q.customer_name || 'No name'}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            <button
                                type="submit"
                                disabled={submitting || !selectedQuoteId || !orgId || quotes.length === 0}
                                className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium text-white bg-[#4e7e8c] hover:bg-[#3a5f6a] disabled:opacity-50 rounded-[var(--radius-sm)] transition-colors"
                            >
                                {submitting && <Loader2 size={14} className="animate-spin" />}
                                Convert to Production Job
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
```

The modal uses `getOrgListAction` — add this to `actions.ts`:

```typescript
// Add to lib/production/actions.ts (after the existing exports):

/** Fetch org list for job creation forms */
export async function getOrgListAction(): Promise<Array<{ id: string; name: string }>> {
    const supabase = await createServerClient();
    const { data } = await supabase
        .from('orgs')
        .select('id, name')
        .order('name', { ascending: true });
    return (data || []) as Array<{ id: string; name: string }>;
}
```

- [ ] **Step 2: Add `getOrgListAction` to `lib/production/actions.ts`**

Open `lib/production/actions.ts` and append the `getOrgListAction` function shown above.

- [ ] **Step 3: Run build check**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(portal)/admin/jobs/CreateJobModal.tsx" lib/production/actions.ts
git commit -m "feat: create job modal (manual + from accepted quote)"
```

---

## Task 9: Shop floor

**Files:**
- Modify: `app/shop-floor/layout.tsx`
- Modify: `app/shop-floor/page.tsx`
- Create: `app/shop-floor/ShopFloorClient.tsx`

- [ ] **Step 1: Write the layout**

```tsx
// app/shop-floor/layout.tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Shop Floor — Onesign',
};

export default function ShopFloorLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-neutral-100 flex flex-col">
            {/* Header */}
            <header className="bg-[#1a1f23] border-b-4 border-[#4e7e8c] flex items-center px-6 py-3 gap-4">
                <img src="/onesign-icon.svg" alt="Onesign" className="h-7 invert" />
                <span className="text-white font-semibold text-lg tracking-tight">Shop Floor</span>
            </header>
            <main className="flex-1 p-4 md:p-6">
                {children}
            </main>
        </div>
    );
}
```

- [ ] **Step 2: Write ShopFloorClient**

```tsx
// app/shop-floor/ShopFloorClient.tsx
'use client';

import { useState, useEffect, useTransition } from 'react';
import { Play, Pause, CheckCircle, ChevronDown, AlertCircle } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase';
import {
    startJob,
    pauseJob,
    advanceJobToNextStage,
    getJobDetailAction,
} from '@/lib/production/actions';
import type { ProductionStage, ProductionJob, JobDetail } from '@/lib/production/types';
import { isJobOverdue, formatDueDate } from '@/lib/production/utils';

interface ShopFloorClientProps {
    stages: ProductionStage[];
    initialJobs: ProductionJob[];
    initialStageSlug: string;
}

export function ShopFloorClient({ stages, initialJobs, initialStageSlug }: ShopFloorClientProps) {
    const [activeSlug, setActiveSlug] = useState(initialStageSlug);
    const [jobs, setJobs] = useState<ProductionJob[]>(initialJobs);
    const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
    const [expandedDetail, setExpandedDetail] = useState<JobDetail | null>(null);
    const [isPending, startTransition] = useTransition();

    const activeStage = stages.find(s => s.slug === activeSlug);

    // Realtime subscription
    useEffect(() => {
        const supabase = createBrowserClient();
        const channel = supabase
            .channel('shop_floor_realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'production_jobs' },
                () => {
                    // Refetch jobs for current stage
                    import('@/lib/production/actions').then(({ getShopFloorJobsAction }) => {
                        getShopFloorJobsAction(activeSlug).then(setJobs);
                    });
                }
            )
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [activeSlug]);

    // Refetch when switching stages
    useEffect(() => {
        import('@/lib/production/actions').then(({ getShopFloorJobsAction }) => {
            getShopFloorJobsAction(activeSlug).then(setJobs);
        });
    }, [activeSlug]);

    // Load detail when card expanded
    useEffect(() => {
        if (!expandedJobId) { setExpandedDetail(null); return; }
        getJobDetailAction(expandedJobId).then(setExpandedDetail);
    }, [expandedJobId]);

    function handleExpand(jobId: string) {
        setExpandedJobId(prev => prev === jobId ? null : jobId);
    }

    async function handleStart(jobId: string) {
        startTransition(async () => { await startJob(jobId); });
    }

    async function handlePause(jobId: string) {
        startTransition(async () => { await pauseJob(jobId); });
    }

    async function handleAdvance(jobId: string) {
        startTransition(async () => { await advanceJobToNextStage(jobId); });
    }

    return (
        <div>
            {/* Stage tabs */}
            <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
                {stages.map(stage => {
                    const count = stage.slug === activeSlug
                        ? jobs.length
                        : null;
                    return (
                        <button
                            key={stage.slug}
                            onClick={() => setActiveSlug(stage.slug)}
                            className={`
                                flex-shrink-0 flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold
                                transition-colors border-2
                                ${stage.slug === activeSlug
                                    ? 'bg-[#4e7e8c] text-white border-[#4e7e8c]'
                                    : 'bg-white text-neutral-700 border-neutral-200 hover:border-[#4e7e8c]'}
                            `}
                        >
                            <div
                                className="w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: stage.slug === activeSlug ? 'rgba(255,255,255,0.8)' : stage.color }}
                            />
                            {stage.name}
                            {count !== null && (
                                <span className={`
                                    text-xs px-1.5 py-0.5 rounded-full font-bold
                                    ${stage.slug === activeSlug ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-600'}
                                `}>
                                    {count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Stage header */}
            {activeStage && (
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: activeStage.color }} />
                    <h2 className="text-lg font-bold text-neutral-900">{activeStage.name}</h2>
                    <span className="text-sm text-neutral-500">{jobs.length} job{jobs.length !== 1 ? 's' : ''}</span>
                </div>
            )}

            {/* Job cards */}
            {jobs.length === 0 ? (
                <div className="bg-white rounded-xl border border-neutral-200 p-12 text-center">
                    <p className="text-neutral-500 font-medium">No jobs in this stage</p>
                    <p className="text-sm text-neutral-400 mt-1">Jobs will appear here when moved to {activeStage?.name}</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {jobs.map(job => (
                        <div
                            key={job.id}
                            className={`bg-white rounded-xl border-2 transition-all ${
                                job.status === 'paused' ? 'border-amber-300 opacity-80' : 'border-neutral-200'
                            }`}
                        >
                            {/* Card header */}
                            <div className="p-4">
                                <div className="flex items-start justify-between gap-3 mb-2">
                                    <div className="flex-1 min-w-0">
                                        <code className="text-xs font-mono text-[#4e7e8c] font-semibold">
                                            {job.job_number}
                                        </code>
                                        <p className="text-lg font-bold text-neutral-900 leading-tight truncate">
                                            {job.client_name}
                                        </p>
                                        <p className="text-sm text-neutral-600 mt-0.5 line-clamp-2">{job.title}</p>
                                    </div>
                                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                                        {job.priority === 'urgent' && (
                                            <span className="text-xs font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                                                URGENT
                                            </span>
                                        )}
                                        {job.priority === 'high' && (
                                            <span className="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                                                HIGH
                                            </span>
                                        )}
                                        {job.due_date && (
                                            <span className={`text-xs flex items-center gap-1 ${
                                                isJobOverdue(job.due_date) ? 'text-red-600 font-bold' : 'text-neutral-500'
                                            }`}>
                                                {isJobOverdue(job.due_date) && <AlertCircle size={12} />}
                                                Due {formatDueDate(job.due_date)}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Action buttons */}
                                <div className="flex gap-2 mt-3">
                                    {job.status !== 'active' && (
                                        <button
                                            onClick={() => handleStart(job.id)}
                                            disabled={isPending}
                                            className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 flex-1"
                                        >
                                            <Play size={16} />
                                            Start
                                        </button>
                                    )}
                                    {job.status === 'active' && (
                                        <button
                                            onClick={() => handlePause(job.id)}
                                            disabled={isPending}
                                            className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                                        >
                                            <Pause size={16} />
                                            Pause
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleAdvance(job.id)}
                                        disabled={isPending}
                                        className="flex items-center gap-2 px-4 py-2.5 bg-[#4e7e8c] hover:bg-[#3a5f6a] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 flex-1"
                                    >
                                        <CheckCircle size={16} />
                                        Complete → Next Stage
                                    </button>
                                    <button
                                        onClick={() => handleExpand(job.id)}
                                        className="p-2.5 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
                                        aria-label="View details"
                                    >
                                        <ChevronDown
                                            size={16}
                                            className={`transition-transform ${expandedJobId === job.id ? 'rotate-180' : ''}`}
                                        />
                                    </button>
                                </div>
                            </div>

                            {/* Expanded instructions */}
                            {expandedJobId === job.id && (
                                <div className="border-t border-neutral-200 p-4 bg-neutral-50 rounded-b-xl">
                                    {!expandedDetail ? (
                                        <p className="text-sm text-neutral-500">Loading…</p>
                                    ) : expandedDetail.instructions.filter(i => i.stage_id === activeStage?.id).length === 0 ? (
                                        <p className="text-sm text-neutral-500">No instructions for this stage.</p>
                                    ) : (
                                        <div className="space-y-2">
                                            <p className="text-xs font-semibold uppercase text-neutral-500">Instructions</p>
                                            {expandedDetail.instructions
                                                .filter(i => i.stage_id === activeStage?.id)
                                                .map(inst => (
                                                    <div key={inst.id} className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                                        <p className="text-sm text-neutral-800">{inst.instruction}</p>
                                                    </div>
                                                ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
```

Add `getShopFloorJobsAction` to `lib/production/actions.ts`:

```typescript
// Add to lib/production/actions.ts:
import { getShopFloorQueue } from './queries';

export async function getShopFloorJobsAction(stageSlug: string): Promise<ProductionJob[]> {
    return getShopFloorQueue(stageSlug);
}
```

- [ ] **Step 3: Write the shop floor page**

```tsx
// app/shop-floor/page.tsx
import { requireAdmin } from '@/lib/auth';
import { getProductionStages, getShopFloorQueue } from '@/lib/production/queries';
import { ShopFloorClient } from './ShopFloorClient';

export default async function ShopFloorPage() {
    await requireAdmin();

    const stages = await getProductionStages();
    const initialJobs = await getShopFloorQueue('design');

    return (
        <ShopFloorClient
            stages={stages}
            initialJobs={initialJobs}
            initialStageSlug="design"
        />
    );
}
```

- [ ] **Step 4: Run build check**

```bash
npm run build 2>&1 | grep -E "Error|error TS" | head -20
```

Expected: no TypeScript errors. `/shop-floor` in route output.

- [ ] **Step 5: Commit**

```bash
git add app/shop-floor/
git commit -m "feat: shop floor tablet view with stage tabs and start/complete/pause actions"
```

---

## Task 10: Quote → job conversion button

**Files:**
- Create: `app/(portal)/admin/quotes/[id]/CreateJobButton.tsx`
- Modify: `app/(portal)/admin/quotes/[id]/page.tsx`

- [ ] **Step 1: Write CreateJobButton**

```tsx
// app/(portal)/admin/quotes/[id]/CreateJobButton.tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LayoutGrid, Loader2, CheckCircle2 } from 'lucide-react';
import { createJobFromQuote, getOrgListAction } from '@/lib/production/actions';
import { useEffect } from 'react';

interface CreateJobButtonProps {
    quoteId: string;
    existingJobId: string | null;
    existingJobNumber: string | null;
}

export function CreateJobButton({ quoteId, existingJobId, existingJobNumber }: CreateJobButtonProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [orgs, setOrgs] = useState<Array<{ id: string; name: string }>>([]);
    const [orgId, setOrgId] = useState('');
    const [showPicker, setShowPicker] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        getOrgListAction().then(setOrgs);
    }, []);

    if (existingJobId) {
        return (
            <a
                href={`/app/admin/jobs`}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 rounded-[var(--radius-sm)] transition-colors"
            >
                <CheckCircle2 size={14} />
                Job {existingJobNumber}
            </a>
        );
    }

    if (!showPicker) {
        return (
            <button
                onClick={() => setShowPicker(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-[#4e7e8c] hover:bg-[#3a5f6a] rounded-[var(--radius-sm)] transition-colors"
            >
                <LayoutGrid size={14} />
                Create Production Job
            </button>
        );
    }

    async function handleCreate() {
        if (!orgId) return;
        startTransition(async () => {
            const result = await createJobFromQuote(quoteId, orgId);
            if ('error' in result) {
                setError(result.error);
            } else {
                router.push(`/app/admin/jobs`);
            }
        });
    }

    return (
        <div className="flex items-center gap-2">
            {error && <span className="text-xs text-red-600">{error}</span>}
            <select
                value={orgId}
                onChange={e => setOrgId(e.target.value)}
                className="text-sm border border-neutral-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#4e7e8c]"
            >
                <option value="">Select org…</option>
                {orgs.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                ))}
            </select>
            <button
                onClick={handleCreate}
                disabled={!orgId || isPending}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-[#4e7e8c] hover:bg-[#3a5f6a] disabled:opacity-50 rounded-[var(--radius-sm)] transition-colors"
            >
                {isPending ? <Loader2 size={14} className="animate-spin" /> : <LayoutGrid size={14} />}
                Create Job
            </button>
            <button
                onClick={() => setShowPicker(false)}
                className="text-xs text-neutral-500 hover:text-neutral-700"
            >
                Cancel
            </button>
        </div>
    );
}
```

- [ ] **Step 2: Modify the quote detail page**

Open `app/(portal)/admin/quotes/[id]/page.tsx`. After the existing imports, add:

```typescript
import { CreateJobButton } from './CreateJobButton';
```

After fetching `audits` (around line 73), add:

```typescript
// Check for existing production job
const { data: existingProductionJob } = await supabase
    .from('production_jobs')
    .select('id, job_number')
    .eq('quote_id', id)
    .maybeSingle();
```

In the `PageHeader` action section (around line 112), add `CreateJobButton` alongside the existing Print/PDF buttons:

```tsx
{quoteData.status === 'accepted' && (
    <CreateJobButton
        quoteId={id}
        existingJobId={existingProductionJob?.id ?? null}
        existingJobNumber={existingProductionJob?.job_number ?? null}
    />
)}
```

Place this after the "Client PDF" link and before the `Chip`.

- [ ] **Step 3: Run build check**

```bash
npm run build 2>&1 | grep -E "Error|error TS" | head -20
```

- [ ] **Step 4: Commit**

```bash
git add "app/(portal)/admin/quotes/[id]/CreateJobButton.tsx" "app/(portal)/admin/quotes/[id]/page.tsx"
git commit -m "feat: add 'Create Production Job' button to accepted quote detail page"
```

---

## Task 11: Admin dashboard production summary

**Files:**
- Modify: `app/(portal)/admin/page.tsx`

- [ ] **Step 1: Update the admin page**

Open `app/(portal)/admin/page.tsx`. Add this import:

```typescript
import { getProductionStats } from '@/lib/production/queries';
import { LayoutGrid } from 'lucide-react';
import Link from 'next/link';
```

After the existing `await requireAdmin();`, add:

```typescript
// Try to get production stats — graceful fallback if migration 024 not yet run
let productionStats: { totalActive: number; overdueCount: number; byStage: Array<{ name: string; color: string; count: number; sortOrder: number }> } | null = null;
try {
    productionStats = await getProductionStats();
} catch {
    // Migration 024 not yet run — silently skip production stats
}
```

Before the closing `</div>` of the return (after the two-column grid), add:

```tsx
{/* Production Pipeline Summary */}
{productionStats !== null && (
    <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
                <LayoutGrid size={16} className="text-[#4e7e8c]" />
                <h2 className="text-sm font-semibold text-neutral-900">Production Pipeline</h2>
            </div>
            <Link href="/app/admin/jobs" className="text-xs text-[#4e7e8c] hover:underline">
                View board
            </Link>
        </div>

        <div className="bg-white rounded-[var(--radius-md)] border border-neutral-200 p-4">
            <div className="flex items-center gap-6 mb-4 text-sm">
                <div>
                    <span className="text-2xl font-bold text-neutral-900">{productionStats.totalActive}</span>
                    <span className="text-neutral-500 ml-1.5">active</span>
                </div>
                {productionStats.overdueCount > 0 && (
                    <div className="flex items-center gap-1.5 text-red-600">
                        <AlertCircle size={14} />
                        <span className="font-semibold">{productionStats.overdueCount} overdue</span>
                    </div>
                )}
            </div>

            {/* Stage bar */}
            <div className="flex gap-2 flex-wrap">
                {productionStats.byStage.map(stage => (
                    <div
                        key={stage.name}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium border"
                        style={{
                            backgroundColor: `${stage.color}15`,
                            borderColor: `${stage.color}40`,
                            color: stage.color,
                        }}
                    >
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: stage.color }} />
                        {stage.name}
                        <span className="font-bold ml-0.5">{stage.count}</span>
                    </div>
                ))}
            </div>
        </div>
    </div>
)}
```

Also add `AlertCircle` to the existing `lucide-react` import if not already there.

- [ ] **Step 2: Run build check**

```bash
npm run build 2>&1 | grep -E "Error|error TS" | head -20
```

- [ ] **Step 3: Commit**

```bash
git add "app/(portal)/admin/page.tsx"
git commit -m "feat: add production pipeline summary to admin dashboard"
```

---

## Task 12: Seed data

**Files:**
- Create: `supabase/seed_production_data.sql`

- [ ] **Step 1: Write the seed file**

```sql
-- Seed: Realistic production test data for development
-- Run AFTER migration 024 in Supabase Studio SQL Editor.
-- Requires at least one org to exist. Update org UUIDs to match your dev database.

-- =============================================================================
-- HELPER: get stage IDs by slug
-- =============================================================================
-- This seed uses CTEs to avoid hardcoding UUIDs.

WITH
stages AS (
    SELECT id, slug FROM public.production_stages WHERE org_id IS NULL
),
-- Replace this with a real org UUID from your dev database:
-- SELECT id, name FROM public.orgs;
target_org AS (
    SELECT id FROM public.orgs LIMIT 1
),

-- Insert jobs
inserted_jobs AS (
    INSERT INTO public.production_jobs
        (org_id, title, client_name, description, current_stage_id, priority, status, assigned_initials, due_date, total_items)
    VALUES
        -- Design stage
        ((SELECT id FROM target_org), 'Plot signage — Whitburn Meadows Ph.3',          'Persimmon Homes',    'Phase 3 plot numbers and street signs',         (SELECT id FROM stages WHERE slug = 'design'),          'urgent', 'active', 'MP', CURRENT_DATE + 3,  12),
        ((SELECT id FROM target_org), 'Reception desk lettering — brushed steel',       'Balfour Beatty',     'Fabricated steel lettering for HQ reception',   (SELECT id FROM stages WHERE slug = 'design'),          'high',   'active', 'KR', CURRENT_DATE + 7,   1),
        ((SELECT id FROM target_org), 'Links with Nature — batch 4 interpretation',    'NHS RVI',            '4 interpretation boards, outdoor grade',         (SELECT id FROM stages WHERE slug = 'design'),          'normal', 'active', 'JH', CURRENT_DATE + 14,  4),

        -- Artwork Approval stage
        ((SELECT id FROM target_org), 'Site hoarding panels — A1 corridor',            'SKS Construction',   'Full-wrap hoarding for roadworks corridor',      (SELECT id FROM stages WHERE slug = 'artwork-approval'), 'urgent', 'active', 'DS', CURRENT_DATE + 2,  24),
        ((SELECT id FROM target_org), 'Forecourt canopy fascia — rebrand',              'Slick Construction', 'Replace faded teal fascia with new brand',       (SELECT id FROM stages WHERE slug = 'artwork-approval'), 'high',   'active', 'MP', CURRENT_DATE + 5,   6),

        -- Print stage
        ((SELECT id FROM target_org), 'Victoria MSCP — Level 3 wayfinding',            'Sunderland Council', 'Directional signs and floor markers',            (SELECT id FROM stages WHERE slug = 'print'),           'normal', 'active', 'TW', CURRENT_DATE + 6,   8),
        ((SELECT id FROM target_org), 'Office directory board — brushed aluminium',    'Mapleleaf',          'A-board style floor-standing directory',          (SELECT id FROM stages WHERE slug = 'print'),           'normal', 'active', 'JH', CURRENT_DATE + 10,  1),

        -- Fabrication stage
        ((SELECT id FROM target_org), 'Heritage trail waymarkers — set of 6',          'Sunderland Council', 'Cast aluminium effect waymarker posts',          (SELECT id FROM stages WHERE slug = 'fabrication'),     'normal', 'active', 'DS', CURRENT_DATE + 8,   6),
        ((SELECT id FROM target_org), 'Site entrance totem — dual-post',                'Halman Thompson',    'Illuminated totem with logo panel',               (SELECT id FROM stages WHERE slug = 'fabrication'),     'high',   'active', 'KR', CURRENT_DATE + 4,   1),

        -- Finishing stage
        ((SELECT id FROM target_org), 'Vehicle fleet graphics — 3 vans',               'SKS Construction',   'Full wrap livery on Transit fleet',               (SELECT id FROM stages WHERE slug = 'finishing'),       'normal', 'active', 'MP', CURRENT_DATE + 9,   3),

        -- QC stage
        ((SELECT id FROM target_org), 'Retail fascia — unit 14 rebrand',               'Persimmon Homes',    'ACM fascia panels, push-through letters',         (SELECT id FROM stages WHERE slug = 'qc'),              'normal', 'active', 'TW', CURRENT_DATE + 11,  4),

        -- Dispatch stage (overdue — test alert)
        ((SELECT id FROM target_org), 'Temporary site hoardings — batch 2',            'Balfour Beatty',     'Replacement hoarding after weather damage',       (SELECT id FROM stages WHERE slug = 'dispatch'),        'high',   'active', 'DS', CURRENT_DATE - 1,   8)

    RETURNING id, title, current_stage_id
),

-- Add some initial stage log entries
log_entries AS (
    INSERT INTO public.job_stage_log (job_id, from_stage_id, to_stage_id, moved_by_name, notes)
    SELECT
        j.id,
        NULL,
        j.current_stage_id,
        'System',
        'Job created'
    FROM inserted_jobs j
)

SELECT 'Seed complete — ' || count(*) || ' jobs created' FROM inserted_jobs;
```

- [ ] **Step 2: Run seed in Supabase Studio**

Open Supabase Studio → SQL Editor → paste and run seed file.
Expected: `Seed complete — 12 jobs created`

- [ ] **Step 3: Verify board data**

```sql
SELECT j.job_number, j.client_name, j.priority, s.name AS stage
FROM public.production_jobs j
JOIN public.production_stages s ON s.id = j.current_stage_id
ORDER BY s.sort_order, j.created_at;
```

- [ ] **Step 4: Commit the seed file**

```bash
git add supabase/seed_production_data.sql
git commit -m "chore: add realistic production seed data for development"
```

---

## Task 13: Verify build and tests

- [ ] **Step 1: Run full test suite**

```bash
npm run test
```

Expected:
```
✓ lib/production/utils.test.ts (7 tests)
✓ lib/quoter/engine/panel-letters-v1.test.ts (18 tests)
Test Files  2 passed (2)
Tests       25 passed (25)
```

- [ ] **Step 2: Run production build**

```bash
npm run build
```

Expected: zero TypeScript errors. All routes present in output including:
```
ƒ /admin/jobs
○ /shop-floor
ƒ /admin/quotes/[id]
ƒ /admin
```

- [ ] **Step 3: Check no broken imports**

```bash
npm run build 2>&1 | grep -i "cannot find module\|does not provide"
```

Expected: no output.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: Phase 1 production job board complete

- Migration 024: 5 tables (production_stages, production_jobs, job_items, job_stage_log, department_instructions)
- RLS, indexes, Realtime enabled
- Server actions: createJobFromQuote, moveJobToStage, start/pause/completeJob, advanceJobToNextStage
- Kanban board at /app/admin/jobs with DnD, Realtime, detail panel
- Shop floor at /shop-floor with stage tabs and touch-friendly actions
- Quote detail: Create Production Job button for accepted quotes
- Admin dashboard: Production pipeline summary card
- 7 utility tests + 18 quoter tests passing"
```

---

## Post-implementation notes

### Sidebar link verification (spec step 7)
The sidebar already has `{ label: 'Job Board', href: '/app/admin/jobs', icon: LayoutGrid }` from the cleanup sprint. No changes needed — verify active state works correctly by navigating to `/app/admin/jobs` and checking the nav highlight.

### Artwork approval stage integration
When a job enters the `artwork-approval` stage (detectable via `stage.is_approval_stage === true`), the `JobDetailPanel` should display the artwork job link. In `JobDetailPanel`, after the "Move to Stage" section, add a check:

```tsx
{detail.stage?.is_approval_stage && detail.quote_id && (
    <div className="bg-orange-50 border border-orange-200 rounded p-3">
        <p className="text-xs font-semibold text-orange-700 uppercase mb-1">Artwork Approval Stage</p>
        <p className="text-sm text-neutral-700 mb-2">This job is in artwork approval.</p>
        <a
            href={`/app/admin/artwork`}
            className="text-xs text-[#4e7e8c] hover:underline"
        >
            View Artwork Jobs →
        </a>
    </div>
)}
```

This links to the existing artwork module. Full artwork ↔ production automation is Phase 2.

### What this unblocks
Once migration 024 is applied to production and seed data is populated with real jobs, Clarity Go can be cancelled. The Kanban board, shop floor view, and quote conversion cover the critical workflow.
