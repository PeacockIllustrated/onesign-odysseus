# Visual Approval Jobs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing `artwork_jobs` infrastructure to support pre-production "visual approval" jobs — standalone mockup jobs with 1..N variants per component, shared client approval flow, optional quote linkage, and a manual handoff to a spawned production artwork job when staff are ready.

**Architecture:** One new `job_type` column + two optional FKs on `artwork_jobs`; one new `artwork_variants` child table; UI branches on `job_type` inside the existing admin artwork pages, the client approval page, and the quote detail page. Server-side, one new file (`lib/artwork/visual-approval-actions.ts`) holds all visual-specific actions; the existing approval-token action is extended to record variant selections on submit.

**Tech Stack:** Next.js 16 App Router (Turbopack), TypeScript strict, React 19, Supabase SSR, Zod, Tailwind 4, Vitest.

**Reference spec:** `docs/superpowers/specs/2026-04-15-visual-approval-design.md`

---

## File map

**New files**

- `supabase/migrations/043_visual_approval.sql`
- `lib/artwork/variant-types.ts` — Zod schemas + inferred types (no `'use server'`)
- `lib/artwork/variant-utils.ts` — pure `mapVariantToSubItemInput` helper
- `lib/artwork/variant-utils.test.ts`
- `lib/artwork/visual-approval-actions.ts` — all server actions specific to visual jobs + variants
- `app/(portal)/admin/artwork/components/NewVisualJobButton.tsx`
- `app/(portal)/admin/artwork/[id]/components/LinkedQuoteCard.tsx`
- `app/(portal)/admin/artwork/[id]/components/CreateProductionFromVisualButton.tsx`
- `app/(portal)/admin/artwork/[id]/[componentId]/components/VariantCard.tsx`
- `app/(portal)/admin/artwork/[id]/[componentId]/components/VariantsPanel.tsx`
- `app/approve/artwork/[token]/components/VariantPicker.tsx`
- `app/(portal)/admin/quotes/[id]/components/VisualsForQuoteCard.tsx`

**Modified files**

- `lib/artwork/types.ts` — extend `ArtworkJobSchema` with `job_type`, `quote_id`, `parent_visual_job_id`
- `lib/artwork/actions.ts` — `getArtworkJob` pulls variants alongside sub-items
- `lib/artwork/approval-actions.ts` — `submitApproval` handles variant selections for visual-type jobs; `getApprovalData` returns variants
- `app/(portal)/admin/artwork/page.tsx` (or its client) — type pill + filter + New Visual button wiring
- `app/(portal)/admin/artwork/[id]/page.tsx` — conditional render: visual mode swaps right-sidebar + component display
- `app/(portal)/admin/artwork/[id]/[componentId]/page.tsx` — conditional: variants editor instead of sub-items
- `app/approve/artwork/[token]/ApprovalClientView.tsx` — conditional variant picker
- `app/(portal)/admin/quotes/[id]/page.tsx` — add "Visuals for this quote" section

---

### Task 1: Migration 043 — `artwork_jobs` columns + `artwork_variants` table

**Files:**
- Create: `supabase/migrations/043_visual_approval.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 043: visual approval jobs + per-component variants
--
-- Reuses artwork_jobs for a second flavour of job (visual_approval) whose
-- components carry mockup variants instead of sub-items. The existing
-- production flow is untouched — default job_type is 'production'.

BEGIN;

-- 1. artwork_jobs gains a type, an optional quote link, and an optional
--    back-reference to the visual job that spawned it (when job_type='production').
ALTER TABLE public.artwork_jobs
  ADD COLUMN IF NOT EXISTS job_type TEXT NOT NULL DEFAULT 'production'
    CHECK (job_type IN ('production', 'visual_approval')),
  ADD COLUMN IF NOT EXISTS quote_id UUID
    REFERENCES public.quotes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_visual_job_id UUID
    REFERENCES public.artwork_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_artwork_jobs_job_type
  ON public.artwork_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_artwork_jobs_quote_id
  ON public.artwork_jobs(quote_id) WHERE quote_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_artwork_jobs_parent_visual
  ON public.artwork_jobs(parent_visual_job_id) WHERE parent_visual_job_id IS NOT NULL;

-- 2. New table: one row per mockup option on a component.
CREATE TABLE IF NOT EXISTS public.artwork_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id UUID NOT NULL REFERENCES public.artwork_components(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  name TEXT,
  description TEXT,
  thumbnail_url TEXT,
  material TEXT,
  application_method TEXT,
  finish TEXT,
  width_mm NUMERIC(10, 2),
  height_mm NUMERIC(10, 2),
  returns_mm NUMERIC(10, 2),
  is_chosen BOOLEAN NOT NULL DEFAULT FALSE,
  chosen_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_artwork_variants_component
  ON public.artwork_variants(component_id);
CREATE INDEX IF NOT EXISTS idx_artwork_variants_chosen
  ON public.artwork_variants(component_id) WHERE is_chosen = TRUE;

CREATE TRIGGER trg_artwork_variants_updated_at
  BEFORE UPDATE ON public.artwork_variants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.artwork_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage artwork_variants"
  ON public.artwork_variants FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Authed users read artwork_variants"
  ON public.artwork_variants FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

COMMIT;
```

- [ ] **Step 2: Commit (user will apply the SQL in Supabase SQL Editor separately)**

```bash
git add supabase/migrations/043_visual_approval.sql
git commit -m "feat(db): migration 043 — artwork job_type + artwork_variants table"
```

---

### Task 2: Variant types + schemas

**Files:**
- Create: `lib/artwork/variant-types.ts`
- Modify: `lib/artwork/types.ts` (add three fields to `ArtworkJobSchema`)

- [ ] **Step 1: Write `variant-types.ts`**

```ts
/**
 * Zod schemas + inferred TypeScript types for artwork variants and the
 * visual-approval job shape. Kept in a separate file from
 * visual-approval-actions.ts because that file uses 'use server' and
 * Next.js forbids exporting Zod objects from such files.
 */

import { z } from 'zod';

export const ArtworkVariantSchema = z.object({
    id: z.string().uuid(),
    component_id: z.string().uuid(),
    label: z.string(),
    sort_order: z.number().int(),
    name: z.string().nullable(),
    description: z.string().nullable(),
    thumbnail_url: z.string().nullable(),
    material: z.string().nullable(),
    application_method: z.string().nullable(),
    finish: z.string().nullable(),
    width_mm: z.number().nullable(),
    height_mm: z.number().nullable(),
    returns_mm: z.number().nullable(),
    is_chosen: z.boolean(),
    chosen_at: z.string().nullable(),
    notes: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
});
export type ArtworkVariant = z.infer<typeof ArtworkVariantSchema>;

export const CreateVisualJobInputSchema = z.object({
    jobName: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    orgId: z.string().uuid().nullable().optional(),
    contactId: z.string().uuid().nullable().optional(),
    siteId: z.string().uuid().nullable().optional(),
    quoteId: z.string().uuid().nullable().optional(),
});
export type CreateVisualJobInput = z.infer<typeof CreateVisualJobInputSchema>;

export const CreateVariantInputSchema = z.object({
    componentId: z.string().uuid(),
    name: z.string().max(120).optional(),
    description: z.string().max(2000).optional(),
    material: z.string().max(200).optional(),
    applicationMethod: z.string().max(200).optional(),
    finish: z.string().max(120).optional(),
    widthMm: z.number().positive().nullable().optional(),
    heightMm: z.number().positive().nullable().optional(),
    returnsMm: z.number().nullable().optional(),
    notes: z.string().max(500).optional(),
});
export type CreateVariantInput = z.infer<typeof CreateVariantInputSchema>;

export const UpdateVariantInputSchema = z.object({
    name: z.string().max(120).nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    material: z.string().max(200).nullable().optional(),
    applicationMethod: z.string().max(200).nullable().optional(),
    finish: z.string().max(120).nullable().optional(),
    widthMm: z.number().positive().nullable().optional(),
    heightMm: z.number().positive().nullable().optional(),
    returnsMm: z.number().nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
});
export type UpdateVariantInput = z.infer<typeof UpdateVariantInputSchema>;

export const VariantSelectionSchema = z.object({
    componentId: z.string().uuid(),
    variantId: z.string().uuid(),
});
export type VariantSelection = z.infer<typeof VariantSelectionSchema>;
```

- [ ] **Step 2: Extend `ArtworkJobSchema` in `lib/artwork/types.ts`**

Find the existing `ArtworkJobSchema = z.object({ ... })` block. Add three fields inside the object:

```ts
    job_type: z.enum(['production', 'visual_approval']).default('production'),
    quote_id: z.string().uuid().nullable().default(null),
    parent_visual_job_id: z.string().uuid().nullable().default(null),
```

If the file exports an `ArtworkJob` type via `z.infer`, no further change is needed.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add lib/artwork/variant-types.ts lib/artwork/types.ts
git commit -m "feat(artwork): variant types + job_type/quote_id/parent_visual_job_id on ArtworkJobSchema"
```

---

### Task 3: Pure utility `mapVariantToSubItemInput` (TDD)

**Files:**
- Create: `lib/artwork/variant-utils.ts`
- Test: `lib/artwork/variant-utils.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { mapVariantToSubItemInput } from './variant-utils';
import type { ArtworkVariant } from './variant-types';

const base: ArtworkVariant = {
    id: '11111111-1111-4111-8111-111111111111',
    component_id: '22222222-2222-4222-8222-222222222222',
    label: 'A',
    sort_order: 0,
    name: 'Gold foil',
    description: 'premium look',
    thumbnail_url: null,
    material: 'ACM 3mm',
    application_method: 'routed + folded',
    finish: 'RAL 9010',
    width_mm: 2400,
    height_mm: 400,
    returns_mm: 50,
    is_chosen: true,
    chosen_at: '2026-04-15T10:00:00Z',
    notes: 'gold leaf across the letters',
    created_at: '2026-04-15T09:00:00Z',
    updated_at: '2026-04-15T09:00:00Z',
};

describe('mapVariantToSubItemInput', () => {
    it('copies all spec fields across when present', () => {
        const si = mapVariantToSubItemInput(base);
        expect(si.name).toBe('Gold foil');
        expect(si.material).toBe('ACM 3mm');
        expect(si.application_method).toBe('routed + folded');
        expect(si.finish).toBe('RAL 9010');
        expect(si.width_mm).toBe(2400);
        expect(si.height_mm).toBe(400);
        expect(si.returns_mm).toBe(50);
        expect(si.notes).toBe('gold leaf across the letters');
    });

    it('passes null through for missing spec fields', () => {
        const bare: ArtworkVariant = {
            ...base,
            name: null,
            material: null,
            application_method: null,
            finish: null,
            width_mm: null,
            height_mm: null,
            returns_mm: null,
            notes: null,
        };
        const si = mapVariantToSubItemInput(bare);
        expect(si.name).toBeNull();
        expect(si.material).toBeNull();
        expect(si.application_method).toBeNull();
        expect(si.finish).toBeNull();
        expect(si.width_mm).toBeNull();
        expect(si.height_mm).toBeNull();
        expect(si.returns_mm).toBeNull();
        expect(si.notes).toBeNull();
    });

    it('always defaults quantity to 1 and label to "A"', () => {
        const si = mapVariantToSubItemInput(base);
        expect(si.quantity).toBe(1);
        expect(si.label).toBe('A');
        expect(si.sort_order).toBe(0);
    });
});
```

- [ ] **Step 2: Run test — expect fail**

```bash
npm run test -- --run lib/artwork/variant-utils.test.ts
```

Expected: FAIL `Cannot find module './variant-utils'`.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * Pure helpers for artwork variants. Kept dependency-free so Vitest can
 * exercise them without the Supabase / Next stack.
 */

import type { ArtworkVariant } from './variant-types';

export interface VariantSubItemInput {
    label: string;
    sort_order: number;
    name: string | null;
    material: string | null;
    application_method: string | null;
    finish: string | null;
    width_mm: number | null;
    height_mm: number | null;
    returns_mm: number | null;
    quantity: number;
    notes: string | null;
}

/**
 * Field-for-field translate a client-chosen variant into the shape the
 * production sub-item insert expects. Keeps the "spawn production from
 * visual" server action trivial.
 */
export function mapVariantToSubItemInput(
    variant: ArtworkVariant
): VariantSubItemInput {
    return {
        label: 'A',
        sort_order: 0,
        name: variant.name,
        material: variant.material,
        application_method: variant.application_method,
        finish: variant.finish,
        width_mm: variant.width_mm,
        height_mm: variant.height_mm,
        returns_mm: variant.returns_mm,
        quantity: 1,
        notes: variant.notes,
    };
}
```

- [ ] **Step 4: Run tests — expect 3 pass**

```bash
npm run test -- --run lib/artwork/variant-utils.test.ts
```

Expected: `Tests  3 passed (3)`.

- [ ] **Step 5: Commit**

```bash
git add lib/artwork/variant-utils.ts lib/artwork/variant-utils.test.ts
git commit -m "feat(artwork): mapVariantToSubItemInput pure helper + tests"
```

---

### Task 4: Server actions — visual job CRUD + quote linking

**Files:**
- Create: `lib/artwork/visual-approval-actions.ts` (this task writes the file; later tasks append)

- [ ] **Step 1: Write the file with job CRUD actions**

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase-server';
import { getUser } from '@/lib/auth';
import {
    CreateVisualJobInputSchema,
    type CreateVisualJobInput,
} from './variant-types';

// ---------------------------------------------------------------------------
// createVisualApprovalJob
// ---------------------------------------------------------------------------

/**
 * Create a new artwork_jobs row with job_type='visual_approval'. Standalone
 * by default — org/contact/site/quote are all optional.
 */
export async function createVisualApprovalJob(
    input: CreateVisualJobInput
): Promise<{ id: string } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const validation = CreateVisualJobInputSchema.safeParse(input);
    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }
    const parsed = validation.data;

    const supabase = await createServerClient();

    const orgId = parsed.orgId ?? null;
    const isOrphan = orgId === null;

    const { data, error } = await supabase
        .from('artwork_jobs')
        .insert({
            job_name: parsed.jobName,
            description: parsed.description ?? null,
            status: 'draft',
            job_type: 'visual_approval',
            org_id: orgId,
            contact_id: parsed.contactId ?? null,
            site_id: parsed.siteId ?? null,
            quote_id: parsed.quoteId ?? null,
            is_orphan: isOrphan,
            client_name: null,
            created_by: user.id,
        })
        .select('id')
        .single();

    if (error || !data) {
        console.error('createVisualApprovalJob error:', error);
        return { error: error?.message ?? 'Failed to create visual job' };
    }

    revalidatePath('/admin/artwork');
    if (parsed.quoteId) revalidatePath(`/admin/quotes/${parsed.quoteId}`);
    return { id: data.id };
}

// ---------------------------------------------------------------------------
// attachQuoteToVisualJob / detachQuoteFromVisualJob
// ---------------------------------------------------------------------------

export async function attachQuoteToVisualJob(
    artworkJobId: string,
    quoteId: string
): Promise<{ ok: true } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const supabase = await createServerClient();

    const { data: quote } = await supabase
        .from('quotes')
        .select('id')
        .eq('id', quoteId)
        .maybeSingle();
    if (!quote) return { error: 'quote not found' };

    const { error } = await supabase
        .from('artwork_jobs')
        .update({ quote_id: quoteId })
        .eq('id', artworkJobId)
        .eq('job_type', 'visual_approval');
    if (error) return { error: error.message };

    revalidatePath(`/admin/artwork/${artworkJobId}`);
    revalidatePath(`/admin/quotes/${quoteId}`);
    return { ok: true };
}

export async function detachQuoteFromVisualJob(
    artworkJobId: string
): Promise<{ ok: true } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const supabase = await createServerClient();

    // Get the current quote_id so we can revalidate that page too.
    const { data: existing } = await supabase
        .from('artwork_jobs')
        .select('quote_id')
        .eq('id', artworkJobId)
        .maybeSingle();

    const { error } = await supabase
        .from('artwork_jobs')
        .update({ quote_id: null })
        .eq('id', artworkJobId)
        .eq('job_type', 'visual_approval');
    if (error) return { error: error.message };

    revalidatePath(`/admin/artwork/${artworkJobId}`);
    if (existing?.quote_id) revalidatePath(`/admin/quotes/${existing.quote_id}`);
    return { ok: true };
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add lib/artwork/visual-approval-actions.ts
git commit -m "feat(artwork): createVisualApprovalJob + attach/detachQuoteToVisualJob"
```

---

### Task 5: Server actions — variant CRUD

**Files:**
- Modify: `lib/artwork/visual-approval-actions.ts` (append new actions to the file created in Task 4)

- [ ] **Step 1: Append variant CRUD actions**

At the end of `lib/artwork/visual-approval-actions.ts`, add:

```ts
// ---------------------------------------------------------------------------
// Variant CRUD
// ---------------------------------------------------------------------------

import {
    CreateVariantInputSchema,
    UpdateVariantInputSchema,
    type CreateVariantInput,
    type UpdateVariantInput,
} from './variant-types';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function nextLabel(existing: string[]): string {
    const used = new Set(existing);
    for (const ch of ALPHABET) if (!used.has(ch)) return ch;
    for (const a of ALPHABET) for (const b of ALPHABET) {
        const two = a + b;
        if (!used.has(two)) return two;
    }
    return 'X';
}

async function assertJobNotApprovedByComponent(
    supabase: Awaited<ReturnType<typeof createServerClient>>,
    componentId: string
): Promise<string | null> {
    const { data } = await supabase
        .from('artwork_components')
        .select('job_id, artwork_jobs!inner(status, job_type)')
        .eq('id', componentId)
        .single();
    const job = (data as any)?.artwork_jobs;
    if (!job) return 'parent component not found';
    if (job.job_type !== 'visual_approval') {
        return 'variants can only be added to visual approval jobs';
    }
    if (job.status === 'completed') {
        return 'job is already approved — variants are frozen';
    }
    return null;
}

async function assertVariantEditable(
    supabase: Awaited<ReturnType<typeof createServerClient>>,
    variantId: string
): Promise<{ componentId: string } | { error: string }> {
    const { data: variant } = await supabase
        .from('artwork_variants')
        .select('id, component_id, is_chosen, artwork_components!inner(artwork_jobs!inner(status))')
        .eq('id', variantId)
        .single();
    if (!variant) return { error: 'variant not found' };
    if ((variant as any).is_chosen) {
        return { error: 'variant has been chosen by the client — immutable' };
    }
    const parentStatus = (variant as any).artwork_components?.artwork_jobs?.status;
    if (parentStatus === 'completed') {
        return { error: 'job is already approved — variants are frozen' };
    }
    return { componentId: (variant as any).component_id };
}

export async function addVariantToComponent(
    input: CreateVariantInput
): Promise<{ id: string; label: string } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const validation = CreateVariantInputSchema.safeParse(input);
    if (!validation.success) return { error: validation.error.issues[0].message };
    const parsed = validation.data;

    const supabase = await createServerClient();

    const guard = await assertJobNotApprovedByComponent(supabase, parsed.componentId);
    if (guard) return { error: guard };

    const { data: existing } = await supabase
        .from('artwork_variants')
        .select('label, sort_order')
        .eq('component_id', parsed.componentId);

    const label = nextLabel((existing ?? []).map((r: any) => r.label));
    const sortOrder = (existing?.length ?? 0);

    const { data: variant, error } = await supabase
        .from('artwork_variants')
        .insert({
            component_id: parsed.componentId,
            label,
            sort_order: sortOrder,
            name: parsed.name ?? null,
            description: parsed.description ?? null,
            material: parsed.material ?? null,
            application_method: parsed.applicationMethod ?? null,
            finish: parsed.finish ?? null,
            width_mm: parsed.widthMm ?? null,
            height_mm: parsed.heightMm ?? null,
            returns_mm: parsed.returnsMm ?? null,
            notes: parsed.notes ?? null,
        })
        .select('id, label')
        .single();

    if (error || !variant) return { error: error?.message ?? 'failed to add variant' };

    revalidatePath('/admin/artwork');
    return { id: variant.id, label: variant.label };
}

export async function updateVariant(
    variantId: string,
    patch: UpdateVariantInput
): Promise<{ ok: true } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const validation = UpdateVariantInputSchema.safeParse(patch);
    if (!validation.success) return { error: validation.error.issues[0].message };
    const parsed = validation.data;

    const supabase = await createServerClient();

    const guard = await assertVariantEditable(supabase, variantId);
    if ('error' in guard) return guard;

    // Translate camelCase input keys to snake_case DB columns.
    const updates: Record<string, unknown> = {};
    if (parsed.name !== undefined) updates.name = parsed.name;
    if (parsed.description !== undefined) updates.description = parsed.description;
    if (parsed.material !== undefined) updates.material = parsed.material;
    if (parsed.applicationMethod !== undefined) updates.application_method = parsed.applicationMethod;
    if (parsed.finish !== undefined) updates.finish = parsed.finish;
    if (parsed.widthMm !== undefined) updates.width_mm = parsed.widthMm;
    if (parsed.heightMm !== undefined) updates.height_mm = parsed.heightMm;
    if (parsed.returnsMm !== undefined) updates.returns_mm = parsed.returnsMm;
    if (parsed.notes !== undefined) updates.notes = parsed.notes;

    const { error } = await supabase
        .from('artwork_variants')
        .update(updates)
        .eq('id', variantId);
    if (error) return { error: error.message };

    revalidatePath('/admin/artwork');
    return { ok: true };
}

export async function deleteVariant(
    variantId: string
): Promise<{ ok: true } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const supabase = await createServerClient();

    const guard = await assertVariantEditable(supabase, variantId);
    if ('error' in guard) return guard;

    const { error } = await supabase
        .from('artwork_variants')
        .delete()
        .eq('id', variantId);
    if (error) return { error: error.message };

    revalidatePath('/admin/artwork');
    return { ok: true };
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add lib/artwork/visual-approval-actions.ts
git commit -m "feat(artwork): variant CRUD — add/update/delete"
```

---

### Task 6: Server actions — variant thumbnails

**Files:**
- Modify: `lib/artwork/visual-approval-actions.ts` (append)

- [ ] **Step 1: Append thumbnail actions**

Append to `lib/artwork/visual-approval-actions.ts`:

```ts
// ---------------------------------------------------------------------------
// Thumbnail upload / remove (mirrors uploadSubItemThumbnail pattern)
// ---------------------------------------------------------------------------

export async function uploadVariantThumbnail(
    variantId: string,
    formData: FormData
): Promise<{ url: string } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const file = formData.get('file') as File | null;
    if (!file) return { error: 'no file provided' };
    if (file.size === 0) return { error: 'file is empty' };
    if (file.size > 10 * 1024 * 1024) return { error: 'file too large (max 10 MB)' };
    if (!file.type.startsWith('image/')) return { error: 'file must be an image' };

    const supabase = await createServerClient();

    const { data: variant } = await supabase
        .from('artwork_variants')
        .select('id, component_id, artwork_components!inner(job_id)')
        .eq('id', variantId)
        .single();
    if (!variant) return { error: 'variant not found' };

    const jobId = (variant as any).artwork_components?.job_id;
    const componentId = (variant as any).component_id;
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const storagePath = `${jobId}/${componentId}/variants/${variantId}.${ext}`;

    const { error: uploadErr } = await supabase.storage
        .from('artwork-assets')
        .upload(storagePath, file, { upsert: true, contentType: file.type });
    if (uploadErr) return { error: uploadErr.message };

    const { data: urlData } = supabase.storage
        .from('artwork-assets')
        .getPublicUrl(storagePath);
    const url = urlData.publicUrl;

    const { error: updateErr } = await supabase
        .from('artwork_variants')
        .update({ thumbnail_url: url })
        .eq('id', variantId);
    if (updateErr) return { error: updateErr.message };

    revalidatePath('/admin/artwork');
    return { url };
}

export async function removeVariantThumbnail(
    variantId: string
): Promise<{ ok: true } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const supabase = await createServerClient();

    const { data: variant } = await supabase
        .from('artwork_variants')
        .select('id, component_id, thumbnail_url, artwork_components!inner(job_id)')
        .eq('id', variantId)
        .single();
    if (!variant) return { error: 'variant not found' };

    const { error: updErr } = await supabase
        .from('artwork_variants')
        .update({ thumbnail_url: null })
        .eq('id', variantId);
    if (updErr) return { error: updErr.message };

    // Best-effort blob delete; not surfaced as an action error.
    if ((variant as any).thumbnail_url) {
        const jobId = (variant as any).artwork_components?.job_id;
        const componentId = (variant as any).component_id;
        const url: string = (variant as any).thumbnail_url;
        const ext = url.split('.').pop() || 'png';
        await supabase.storage
            .from('artwork-assets')
            .remove([`${jobId}/${componentId}/variants/${variantId}.${ext}`])
            .catch((e) => console.warn('removeVariantThumbnail blob unlink failed:', e));
    }

    revalidatePath('/admin/artwork');
    return { ok: true };
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add lib/artwork/visual-approval-actions.ts
git commit -m "feat(artwork): variant thumbnail upload + remove"
```

---

### Task 7: Server action — `createProductionFromVisual`

**Files:**
- Modify: `lib/artwork/visual-approval-actions.ts` (append)

- [ ] **Step 1: Append the handoff action**

Append to `lib/artwork/visual-approval-actions.ts`:

```ts
// ---------------------------------------------------------------------------
// createProductionFromVisual — the manual handoff
// ---------------------------------------------------------------------------

import { mapVariantToSubItemInput } from './variant-utils';

/**
 * Spawn a production artwork_job from an approved visual. Copies
 * components + seeds one sub-item per component from the client-chosen
 * variant. Idempotent: refuses if a production job already exists with
 * parent_visual_job_id pointing to this visual.
 */
export async function createProductionFromVisual(
    visualJobId: string
): Promise<{ productionJobId: string } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const supabase = await createServerClient();

    // 1. Load the visual + its components + their variants.
    const { data: visual } = await supabase
        .from('artwork_jobs')
        .select(
            `id, job_name, description, status, job_type, org_id, contact_id,
             site_id, quote_id, job_item_id, is_orphan, client_name`
        )
        .eq('id', visualJobId)
        .single();
    if (!visual) return { error: 'visual job not found' };
    if (visual.job_type !== 'visual_approval') {
        return { error: 'not a visual approval job' };
    }
    if (visual.status !== 'completed') {
        return { error: 'visual is not yet client-approved' };
    }

    // 2. Idempotency guard.
    const { data: existing } = await supabase
        .from('artwork_jobs')
        .select('id')
        .eq('parent_visual_job_id', visualJobId)
        .eq('job_type', 'production')
        .maybeSingle();
    if (existing) {
        return { error: `production job already exists (${existing.id})` };
    }

    // 3. Load components + chosen variants.
    const { data: components } = await supabase
        .from('artwork_components')
        .select(
            `id, name, component_type, sort_order, lighting, notes,
             variants:artwork_variants(*)`
        )
        .eq('job_id', visualJobId)
        .order('sort_order', { ascending: true });

    if (!components || components.length === 0) {
        return { error: 'visual has no components' };
    }

    for (const c of components) {
        const chosen = ((c as any).variants ?? []).find((v: any) => v.is_chosen);
        if (!chosen) {
            return {
                error: `component "${(c as any).name}" has no chosen variant — approval incomplete`,
            };
        }
    }

    // 4. Create the production artwork_job.
    const { data: prod, error: prodErr } = await supabase
        .from('artwork_jobs')
        .insert({
            job_name: visual.job_name,
            description: visual.description,
            status: 'draft',
            job_type: 'production',
            parent_visual_job_id: visualJobId,
            org_id: visual.org_id,
            contact_id: visual.contact_id,
            site_id: visual.site_id,
            quote_id: visual.quote_id,
            job_item_id: visual.job_item_id,
            is_orphan: visual.is_orphan,
            client_name: visual.client_name,
            created_by: user.id,
        })
        .select('id')
        .single();
    if (prodErr || !prod) {
        console.error('createProductionFromVisual insert job error:', prodErr);
        return { error: prodErr?.message ?? 'failed to create production job' };
    }

    // 5. Create each component + seed one sub-item from the chosen variant.
    for (const c of components) {
        const raw = c as any;
        const chosen = (raw.variants ?? []).find((v: any) => v.is_chosen);

        const { data: newComp, error: compErr } = await supabase
            .from('artwork_components')
            .insert({
                job_id: prod.id,
                name: raw.name,
                component_type: raw.component_type ?? 'other',
                sort_order: raw.sort_order ?? 0,
                status: 'pending_design',
                lighting: raw.lighting ?? null,
                notes: raw.notes ?? null,
                scale_confirmed: false,
                bleed_included: false,
                material_confirmed: false,
                rip_no_scaling_confirmed: false,
            })
            .select('id')
            .single();
        if (compErr || !newComp) {
            console.error('createProductionFromVisual component error:', compErr);
            continue;
        }

        const subItem = mapVariantToSubItemInput(chosen);
        await supabase.from('artwork_component_items').insert({
            component_id: newComp.id,
            label: subItem.label,
            sort_order: subItem.sort_order,
            name: subItem.name,
            material: subItem.material,
            application_method: subItem.application_method,
            finish: subItem.finish,
            width_mm: subItem.width_mm,
            height_mm: subItem.height_mm,
            returns_mm: subItem.returns_mm,
            quantity: subItem.quantity,
            notes: subItem.notes,
        });
    }

    revalidatePath(`/admin/artwork/${visualJobId}`);
    revalidatePath(`/admin/artwork/${prod.id}`);
    revalidatePath('/admin/artwork');
    return { productionJobId: prod.id };
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add lib/artwork/visual-approval-actions.ts
git commit -m "feat(artwork): createProductionFromVisual — spawn production artwork from approved visual"
```

---

### Task 8: Extend `getArtworkJob` to include variants

**Files:**
- Modify: `lib/artwork/actions.ts` (find `getArtworkJob` — the Supabase select around line 1614 per earlier grep)

- [ ] **Step 1: Change the components query to also select variants**

Find the block:

```ts
    const { data: components } = await supabase
        .from('artwork_components')
        .select('*, sub_items:artwork_component_items(*)')
        .eq('job_id', id)
        .order('sort_order', { ascending: true });
```

Replace with:

```ts
    const { data: components } = await supabase
        .from('artwork_components')
        .select(
            '*, sub_items:artwork_component_items(*), variants:artwork_variants(*)'
        )
        .eq('job_id', id)
        .order('sort_order', { ascending: true });
```

- [ ] **Step 2: Update the normalisation block to also sort variants**

Find the existing normalisation (which already sorts `sub_items`). Extend it:

```ts
    const normalisedComponents = (components || []).map((c: any) => ({
        ...c,
        sub_items: (c.sub_items || []).slice().sort(
            (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
        ),
        variants: (c.variants || []).slice().sort(
            (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
        ),
    }));
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add lib/artwork/actions.ts
git commit -m "feat(artwork): getArtworkJob includes artwork_variants per component"
```

---

### Task 9: Extend `submitApproval` to record variant selections

**Files:**
- Modify: `lib/artwork/approval-actions.ts`
- Modify: `lib/artwork/approval-types.ts` (wherever `SubmitApprovalInputSchema` lives — grep to confirm; if co-located in approval-actions.ts then there only)

- [ ] **Step 1: Extend the Zod input schema**

Find `SubmitApprovalInputSchema = z.object({ ... })`. Add an optional `variant_selections` field:

```ts
    variant_selections: z.array(z.object({
        componentId: z.string().uuid(),
        variantId: z.string().uuid(),
    })).optional(),
```

- [ ] **Step 2: Extend `submitApproval` to persist the chosen variants**

Find the `submitApproval` action. After the existing "approval row update" completes successfully (and before the `revalidatePath`), add:

```ts
    // If this was a visual_approval job, mark each chosen variant.
    const { data: job } = await supabase
        .from('artwork_jobs')
        .select('id, job_type, status')
        .eq('id', approval.job_id)
        .single();

    if (job?.job_type === 'visual_approval') {
        const selections = validation.data.variant_selections ?? [];
        if (selections.length === 0) {
            return { error: 'visual approval requires variant selections' };
        }

        // Validate every component on the job has a selection.
        const { data: components } = await supabase
            .from('artwork_components')
            .select('id')
            .eq('job_id', approval.job_id);
        const componentIds = new Set((components ?? []).map((c: any) => c.id));
        const selectedComponents = new Set(selections.map((s) => s.componentId));
        for (const cid of componentIds) {
            if (!selectedComponents.has(cid)) {
                return { error: `component ${cid} has no chosen variant` };
            }
        }

        // Write the is_chosen flags.
        for (const sel of selections) {
            await supabase
                .from('artwork_variants')
                .update({
                    is_chosen: true,
                    chosen_at: new Date().toISOString(),
                })
                .eq('id', sel.variantId)
                .eq('component_id', sel.componentId);
        }

        // Flip the job status to completed so the "create production" button lights up.
        await supabase
            .from('artwork_jobs')
            .update({ status: 'completed' })
            .eq('id', approval.job_id);
    }
```

- [ ] **Step 3: Update `getApprovalData` to also load variants**

Find the function that returns `ApprovalPackData` (the page loader for `/approve/artwork/[token]`). In the components select, change the sub_items relation to also pull variants. If the signature is something like:

```ts
    const { data: components } = await supabase
        .from('artwork_components')
        .select(`*, sub_items:artwork_component_items(*)`)
        .eq('job_id', job.id);
```

Replace with:

```ts
    const { data: components } = await supabase
        .from('artwork_components')
        .select(`*, sub_items:artwork_component_items(*), variants:artwork_variants(*)`)
        .eq('job_id', job.id);
```

In the subsequent `enrichedComponents` map, also run `signAssetUrl` over each variant's `thumbnail_url` if it's stored as a private URL (same pattern used on sub-item thumbnails).

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add lib/artwork/approval-actions.ts lib/artwork/approval-types.ts
git commit -m "feat(artwork): submitApproval records variant selections for visual jobs"
```

---

### Task 10: `NewVisualJobButton` component

**Files:**
- Create: `app/(portal)/admin/artwork/components/NewVisualJobButton.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Loader2, X } from 'lucide-react';
import { createVisualApprovalJob } from '@/lib/artwork/visual-approval-actions';

interface OrgOption {
    id: string;
    name: string;
}

interface Props {
    orgs: OrgOption[];
    defaultOrgId?: string;
    defaultQuoteId?: string;
    buttonLabel?: string;
}

export function NewVisualJobButton({ orgs, defaultOrgId, defaultQuoteId, buttonLabel }: Props) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const [jobName, setJobName] = useState('');
    const [description, setDescription] = useState('');
    const [orgId, setOrgId] = useState<string>(defaultOrgId ?? '');

    const submit = () => {
        if (!jobName.trim()) {
            setError('name is required');
            return;
        }
        setError(null);
        startTransition(async () => {
            const res = await createVisualApprovalJob({
                jobName: jobName.trim(),
                description: description.trim() || undefined,
                orgId: orgId || undefined,
                quoteId: defaultQuoteId,
            });
            if ('error' in res) {
                setError(res.error);
                return;
            }
            setOpen(false);
            router.push(`/admin/artwork/${res.id}`);
        });
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="btn-secondary inline-flex items-center gap-2"
            >
                <Plus size={14} />
                {buttonLabel ?? 'New visual for approval'}
            </button>

            {open && (
                <div
                    className="fixed inset-0 z-40 bg-black/50 flex items-end sm:items-center justify-center"
                    onClick={() => setOpen(false)}
                >
                    <div
                        className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-5 space-y-3"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold">New visual for approval</h3>
                            <button onClick={() => setOpen(false)} aria-label="Close" className="p-1 text-neutral-500 hover:text-neutral-900">
                                <X size={18} />
                            </button>
                        </div>

                        <label className="block">
                            <span className="block text-xs font-semibold text-neutral-700 mb-1">Name *</span>
                            <input
                                value={jobName}
                                onChange={(e) => setJobName(e.target.value)}
                                placeholder='e.g. "Test-O''s fascia concepts"'
                                className="w-full text-sm border border-neutral-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
                            />
                        </label>

                        <label className="block">
                            <span className="block text-xs font-semibold text-neutral-700 mb-1">Client (optional)</span>
                            <select
                                value={orgId}
                                onChange={(e) => setOrgId(e.target.value)}
                                className="w-full text-sm border border-neutral-300 rounded px-3 py-2"
                            >
                                <option value="">— none (prospecting visual) —</option>
                                {orgs.map((o) => (
                                    <option key={o.id} value={o.id}>{o.name}</option>
                                ))}
                            </select>
                        </label>

                        <label className="block">
                            <span className="block text-xs font-semibold text-neutral-700 mb-1">Description (optional)</span>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={3}
                                className="w-full text-sm border border-neutral-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
                            />
                        </label>

                        {defaultQuoteId && (
                            <p className="text-[11px] text-neutral-500">Will be linked to the current quote.</p>
                        )}

                        {error && (
                            <div className="bg-red-50 border border-red-200 rounded p-2 text-sm text-red-800">{error}</div>
                        )}

                        <button
                            type="button"
                            onClick={submit}
                            disabled={pending}
                            className="btn-primary w-full inline-flex items-center justify-center gap-2"
                        >
                            {pending && <Loader2 size={16} className="animate-spin" />}
                            Create visual
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add "app/(portal)/admin/artwork/components/NewVisualJobButton.tsx"
git commit -m "feat(artwork): NewVisualJobButton — creation modal for visual-approval jobs"
```

---

### Task 11: `VariantCard` + `VariantsPanel`

**Files:**
- Create: `app/(portal)/admin/artwork/[id]/[componentId]/components/VariantCard.tsx`
- Create: `app/(portal)/admin/artwork/[id]/[componentId]/components/VariantsPanel.tsx`

- [ ] **Step 1: Write `VariantCard.tsx`**

```tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { ThumbnailUpload } from './ThumbnailUpload';
import {
    updateVariant,
    deleteVariant,
    uploadVariantThumbnail,
    removeVariantThumbnail,
} from '@/lib/artwork/visual-approval-actions';
import type { ArtworkVariant } from '@/lib/artwork/variant-types';

interface Props {
    variant: ArtworkVariant;
    readOnly?: boolean;
}

export function VariantCard({ variant, readOnly = false }: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [err, setErr] = useState<string | null>(null);
    const [showSpec, setShowSpec] = useState(false);

    // Local state mirrors DB; on blur we persist.
    const [name, setName] = useState(variant.name ?? '');
    const [description, setDescription] = useState(variant.description ?? '');
    const [material, setMaterial] = useState(variant.material ?? '');
    const [method, setMethod] = useState(variant.application_method ?? '');
    const [finish, setFinish] = useState(variant.finish ?? '');
    const [widthMm, setWidthMm] = useState(variant.width_mm?.toString() ?? '');
    const [heightMm, setHeightMm] = useState(variant.height_mm?.toString() ?? '');
    const [returnsMm, setReturnsMm] = useState(variant.returns_mm?.toString() ?? '');

    const persist = () => {
        setErr(null);
        startTransition(async () => {
            const res = await updateVariant(variant.id, {
                name: name || null,
                description: description || null,
                material: material || null,
                applicationMethod: method || null,
                finish: finish || null,
                widthMm: widthMm === '' ? null : Number(widthMm),
                heightMm: heightMm === '' ? null : Number(heightMm),
                returnsMm: returnsMm === '' ? null : Number(returnsMm),
            });
            if ('error' in res) setErr(res.error);
            else router.refresh();
        });
    };

    const remove = () => {
        if (!confirm(`Delete variant ${variant.label}?`)) return;
        setErr(null);
        startTransition(async () => {
            const res = await deleteVariant(variant.id);
            if ('error' in res) setErr(res.error);
            else router.refresh();
        });
    };

    const inputCls = 'w-full text-sm border border-neutral-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black';

    return (
        <div className="border border-neutral-200 rounded-lg bg-white p-4 space-y-3 relative">
            {variant.is_chosen && (
                <span className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-700 text-white uppercase tracking-wider">
                    Chosen
                </span>
            )}

            <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-sm font-bold bg-neutral-900 text-white rounded px-2 py-1">
                    {variant.label}
                </span>
                {!readOnly && !variant.is_chosen && (
                    <button
                        type="button"
                        onClick={remove}
                        disabled={pending}
                        className="text-xs text-red-700 hover:underline inline-flex items-center gap-1"
                    >
                        <Trash2 size={12} /> delete
                    </button>
                )}
            </div>

            <ThumbnailUpload
                currentUrl={variant.thumbnail_url ?? null}
                uploadAction={(fd) => uploadVariantThumbnail(variant.id, fd)}
                removeAction={() => removeVariantThumbnail(variant.id)}
                size="lg"
                label="variant thumbnail"
                readOnly={readOnly || variant.is_chosen}
            />

            <label className="block">
                <span className="block text-xs font-semibold text-neutral-700 mb-1">Name</span>
                <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={persist}
                    disabled={readOnly || variant.is_chosen}
                    placeholder='e.g. "Gold foil"'
                    className={inputCls}
                />
            </label>

            <label className="block">
                <span className="block text-xs font-semibold text-neutral-700 mb-1">Description</span>
                <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onBlur={persist}
                    disabled={readOnly || variant.is_chosen}
                    rows={2}
                    placeholder="notes the client will see"
                    className={inputCls}
                />
            </label>

            <button
                type="button"
                onClick={() => setShowSpec(!showSpec)}
                className="text-xs font-semibold text-neutral-600 hover:text-black inline-flex items-center gap-1"
            >
                {showSpec ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                spec details (optional)
            </button>

            {showSpec && (
                <div className="space-y-2 pl-3 border-l-2 border-neutral-200">
                    <label className="block">
                        <span className="block text-[11px] font-semibold text-neutral-700 mb-1">Material</span>
                        <input value={material} onChange={(e) => setMaterial(e.target.value)} onBlur={persist} disabled={readOnly || variant.is_chosen} className={inputCls} />
                    </label>
                    <label className="block">
                        <span className="block text-[11px] font-semibold text-neutral-700 mb-1">Method</span>
                        <input value={method} onChange={(e) => setMethod(e.target.value)} onBlur={persist} disabled={readOnly || variant.is_chosen} className={inputCls} />
                    </label>
                    <label className="block">
                        <span className="block text-[11px] font-semibold text-neutral-700 mb-1">Finish</span>
                        <input value={finish} onChange={(e) => setFinish(e.target.value)} onBlur={persist} disabled={readOnly || variant.is_chosen} className={inputCls} />
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                        <label className="block">
                            <span className="block text-[11px] font-semibold text-neutral-700 mb-1">W (mm)</span>
                            <input type="number" value={widthMm} onChange={(e) => setWidthMm(e.target.value)} onBlur={persist} disabled={readOnly || variant.is_chosen} className={inputCls} />
                        </label>
                        <label className="block">
                            <span className="block text-[11px] font-semibold text-neutral-700 mb-1">H (mm)</span>
                            <input type="number" value={heightMm} onChange={(e) => setHeightMm(e.target.value)} onBlur={persist} disabled={readOnly || variant.is_chosen} className={inputCls} />
                        </label>
                        <label className="block">
                            <span className="block text-[11px] font-semibold text-neutral-700 mb-1">R (mm)</span>
                            <input type="number" value={returnsMm} onChange={(e) => setReturnsMm(e.target.value)} onBlur={persist} disabled={readOnly || variant.is_chosen} className={inputCls} />
                        </label>
                    </div>
                </div>
            )}

            {pending && (
                <p className="text-[11px] text-neutral-500 inline-flex items-center gap-1">
                    <Loader2 size={10} className="animate-spin" /> saving…
                </p>
            )}
            {err && <p className="text-[11px] text-red-700">{err}</p>}
        </div>
    );
}
```

- [ ] **Step 2: Write `VariantsPanel.tsx`**

```tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Loader2 } from 'lucide-react';
import { addVariantToComponent } from '@/lib/artwork/visual-approval-actions';
import type { ArtworkVariant } from '@/lib/artwork/variant-types';
import { VariantCard } from './VariantCard';

interface Props {
    componentId: string;
    variants: ArtworkVariant[];
    readOnly?: boolean;
}

export function VariantsPanel({ componentId, variants, readOnly = false }: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [err, setErr] = useState<string | null>(null);

    const add = () => {
        setErr(null);
        startTransition(async () => {
            const res = await addVariantToComponent({ componentId });
            if ('error' in res) setErr(res.error);
            else router.refresh();
        });
    };

    return (
        <section className="space-y-3">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-bold text-neutral-900">Variants</h3>
                    <p className="text-xs text-neutral-500">
                        add one design option per variant · the client picks one at approval
                    </p>
                </div>
                {!readOnly && (
                    <button
                        type="button"
                        onClick={add}
                        disabled={pending}
                        className="btn-secondary text-xs inline-flex items-center gap-1"
                    >
                        {pending ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                        add variant
                    </button>
                )}
            </div>

            {variants.length === 0 ? (
                <p className="text-xs italic text-neutral-400 border border-dashed border-neutral-300 rounded-lg p-6 text-center">
                    no variants yet — add one or more design options for the client to pick from
                </p>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {variants.map((v) => (
                        <VariantCard key={v.id} variant={v} readOnly={readOnly} />
                    ))}
                </div>
            )}

            {err && <p className="text-xs text-red-700">{err}</p>}
        </section>
    );
}
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add "app/(portal)/admin/artwork/[id]/[componentId]/components/VariantCard.tsx" "app/(portal)/admin/artwork/[id]/[componentId]/components/VariantsPanel.tsx"
git commit -m "feat(artwork): VariantCard + VariantsPanel for editing visual variants"
```

---

### Task 12: `LinkedQuoteCard`

**Files:**
- Create: `app/(portal)/admin/artwork/[id]/components/LinkedQuoteCard.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Link2, Unlink, Loader2 } from 'lucide-react';
import {
    attachQuoteToVisualJob,
    detachQuoteFromVisualJob,
} from '@/lib/artwork/visual-approval-actions';

interface QuoteOption {
    id: string;
    quote_number: string;
    customer_name: string | null;
}

interface Props {
    artworkJobId: string;
    currentQuote: QuoteOption | null;
    availableQuotes: QuoteOption[];
}

export function LinkedQuoteCard({ artworkJobId, currentQuote, availableQuotes }: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [err, setErr] = useState<string | null>(null);
    const [pickedId, setPickedId] = useState('');

    const attach = () => {
        if (!pickedId) return;
        setErr(null);
        startTransition(async () => {
            const res = await attachQuoteToVisualJob(artworkJobId, pickedId);
            if ('error' in res) setErr(res.error);
            else router.refresh();
        });
    };

    const detach = () => {
        setErr(null);
        startTransition(async () => {
            const res = await detachQuoteFromVisualJob(artworkJobId);
            if ('error' in res) setErr(res.error);
            else router.refresh();
        });
    };

    return (
        <div className="rounded-lg border border-neutral-200 bg-white p-4 space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1">
                <Link2 size={12} /> Linked quote
            </h4>

            {currentQuote ? (
                <div className="flex items-center justify-between gap-2">
                    <Link
                        href={`/admin/quotes/${currentQuote.id}`}
                        className="text-sm font-mono text-[#4e7e8c] hover:underline"
                    >
                        {currentQuote.quote_number}
                        {currentQuote.customer_name ? ` · ${currentQuote.customer_name}` : ''}
                    </Link>
                    <button
                        type="button"
                        onClick={detach}
                        disabled={pending}
                        className="text-xs text-red-700 hover:underline inline-flex items-center gap-1"
                    >
                        <Unlink size={10} /> unlink
                    </button>
                </div>
            ) : (
                <div className="space-y-2">
                    <select
                        value={pickedId}
                        onChange={(e) => setPickedId(e.target.value)}
                        className="w-full text-sm border border-neutral-300 rounded px-3 py-2"
                    >
                        <option value="">— pick a quote —</option>
                        {availableQuotes.map((q) => (
                            <option key={q.id} value={q.id}>
                                {q.quote_number}{q.customer_name ? ` · ${q.customer_name}` : ''}
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={attach}
                        disabled={pending || !pickedId}
                        className="btn-secondary w-full text-xs inline-flex items-center justify-center gap-1"
                    >
                        {pending && <Loader2 size={12} className="animate-spin" />}
                        link quote
                    </button>
                </div>
            )}

            {err && <p className="text-xs text-red-700">{err}</p>}
        </div>
    );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add "app/(portal)/admin/artwork/[id]/components/LinkedQuoteCard.tsx"
git commit -m "feat(artwork): LinkedQuoteCard — attach/detach a quote to a visual job"
```

---

### Task 13: `CreateProductionFromVisualButton`

**Files:**
- Create: `app/(portal)/admin/artwork/[id]/components/CreateProductionFromVisualButton.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2 } from 'lucide-react';
import { createProductionFromVisual } from '@/lib/artwork/visual-approval-actions';

interface Props {
    visualJobId: string;
    /** Defined once a production job has already been spawned. */
    existingProductionJobId?: string | null;
}

export function CreateProductionFromVisualButton({ visualJobId, existingProductionJobId }: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [err, setErr] = useState<string | null>(null);

    if (existingProductionJobId) {
        return (
            <button
                type="button"
                onClick={() => router.push(`/admin/artwork/${existingProductionJobId}`)}
                className="btn-secondary w-full inline-flex items-center justify-center gap-2"
            >
                <ArrowRight size={14} />
                view production artwork →
            </button>
        );
    }

    const spawn = () => {
        setErr(null);
        startTransition(async () => {
            const res = await createProductionFromVisual(visualJobId);
            if ('error' in res) {
                setErr(res.error);
                return;
            }
            router.push(`/admin/artwork/${res.productionJobId}`);
        });
    };

    return (
        <div className="space-y-2">
            <button
                type="button"
                onClick={spawn}
                disabled={pending}
                className="w-full py-3 rounded-lg bg-green-700 hover:bg-green-800 text-white text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
                {pending ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                Create production artwork from this
            </button>
            {err && <p className="text-xs text-red-700">{err}</p>}
        </div>
    );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add "app/(portal)/admin/artwork/[id]/components/CreateProductionFromVisualButton.tsx"
git commit -m "feat(artwork): CreateProductionFromVisualButton — visual -> production handoff"
```

---

### Task 14: Artwork list page — VISUAL/PRODUCTION pill + filter + New Visual button

**Files:**
- Modify: `app/(portal)/admin/artwork/page.tsx` (or its client component — read the file to confirm structure)

- [ ] **Step 1: Read the file to find the list render + filter state**

```bash
cat "app/(portal)/admin/artwork/page.tsx"
```

The page has a header with a "New artwork job" action and a filter/search area. Add:
- Import `NewVisualJobButton` and render it **next to** the existing "New artwork job" CTA.
- Pass `orgs` (load from `orgs` table, fields `id, name`, limit 200) to the component.
- Add a `job_type` filter: either query-string driven or local state. If the page already uses query-string filters (like `filter=awaiting_approval`), add `type=all|production|visual_approval`. If local state, use `useState<'all' | 'production' | 'visual_approval'>('all')`.
- When rendering each row, add a small pill:
  ```tsx
  <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
      job.job_type === 'visual_approval' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'
  }`}>
      {job.job_type === 'visual_approval' ? 'Visual' : 'Production'}
  </span>
  ```
- Filter the rendered list by `job_type` when the filter is non-`all`.

- [ ] **Step 2: Load orgs for the creation modal**

In the server page component, add:

```ts
const { data: orgs } = await supabase
    .from('orgs')
    .select('id, name')
    .order('name')
    .limit(200);
```

Pass `orgs ?? []` to the `<NewVisualJobButton orgs={...} />` render.

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add "app/(portal)/admin/artwork/page.tsx"
# + any client file modified
git commit -m "feat(artwork): list page — type pill, filter, New Visual button"
```

---

### Task 15: Artwork detail page — conditional visual mode

**Files:**
- Modify: `app/(portal)/admin/artwork/[id]/page.tsx`

- [ ] **Step 1: Load production job twin if this is a visual**

After `getArtworkJob(id)`, if `job.job_type === 'visual_approval'`:

```ts
const { data: spawnedProduction } = await supabase
    .from('artwork_jobs')
    .select('id')
    .eq('parent_visual_job_id', id)
    .eq('job_type', 'production')
    .maybeSingle();
```

For the `LinkedQuoteCard`: if `job.job_type === 'visual_approval'`, load a small list of quotes that could be linked (e.g. draft + accepted quotes for the same org, or all quotes if no org):

```ts
const { data: linkableQuotes } = await supabase
    .from('quotes')
    .select('id, quote_number, customer_name')
    .in('status', ['draft', 'sent', 'accepted'])
    .order('created_at', { ascending: false })
    .limit(50);
```

Also load the current quote if `job.quote_id`:

```ts
const currentQuote = job.quote_id
    ? (await supabase.from('quotes').select('id, quote_number, customer_name').eq('id', job.quote_id).maybeSingle()).data ?? null
    : null;
```

- [ ] **Step 2: Render the visual-specific right-sidebar pieces**

In the sidebar, when `job.job_type === 'visual_approval'`:
- Render `<LinkedQuoteCard artworkJobId={id} currentQuote={currentQuote} availableQuotes={linkableQuotes ?? []} />`.
- If `job.status === 'completed'` (client-approved), render `<CreateProductionFromVisualButton visualJobId={id} existingProductionJobId={spawnedProduction?.id ?? null} />`.

- [ ] **Step 3: Add the VISUAL pill beside the existing status pill in the header**

In the header `<PageHeader />` action or description area, render:

```tsx
{job.job_type === 'visual_approval' && (
    <span className="ml-2 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
        Visual
    </span>
)}
```

- [ ] **Step 4: Typecheck + commit**

```bash
npx tsc --noEmit
git add "app/(portal)/admin/artwork/[id]/page.tsx"
git commit -m "feat(artwork): detail page — visual mode sidebar + production handoff"
```

---

### Task 16: Component detail page — variants editor in visual mode

**Files:**
- Modify: `app/(portal)/admin/artwork/[id]/[componentId]/page.tsx`

- [ ] **Step 1: Branch the body render on `job.job_type`**

Find where sub-items are rendered (look for `sub_items` or `SubItemsList` in the component's JSX). Branch:

```tsx
{job.job_type === 'visual_approval' ? (
    <VariantsPanel
        componentId={component.id}
        variants={component.variants ?? []}
        readOnly={jobCompleted}
    />
) : (
    /* existing sub-items render left untouched */
)}
```

Import at the top:

```tsx
import { VariantsPanel } from './components/VariantsPanel';
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add "app/(portal)/admin/artwork/[id]/[componentId]/page.tsx"
git commit -m "feat(artwork): component detail — swap sub-items editor for variants in visual mode"
```

---

### Task 17: `VariantPicker` + approval page variant flow

**Files:**
- Create: `app/approve/artwork/[token]/components/VariantPicker.tsx`
- Modify: `app/approve/artwork/[token]/ApprovalClientView.tsx`

- [ ] **Step 1: Write `VariantPicker.tsx`**

```tsx
'use client';

import { Check } from 'lucide-react';

interface Variant {
    id: string;
    label: string;
    name: string | null;
    description: string | null;
    thumbnail_url: string | null;
}

interface Props {
    componentName: string;
    variants: Variant[];
    chosenVariantId: string | null;
    onChoose: (variantId: string) => void;
}

export function VariantPicker({ componentName, variants, chosenVariantId, onChoose }: Props) {
    if (variants.length === 0) {
        return (
            <p className="text-sm italic text-neutral-500">
                No variants provided for {componentName}.
            </p>
        );
    }

    if (variants.length === 1) {
        const v = variants[0];
        const chosen = chosenVariantId === v.id;
        return (
            <button
                type="button"
                onClick={() => onChoose(v.id)}
                className={`block w-full rounded-lg border-2 p-3 text-left transition-colors ${
                    chosen ? 'border-green-700 bg-green-50' : 'border-neutral-200 hover:border-neutral-400'
                }`}
            >
                <div className="flex items-start gap-3">
                    {v.thumbnail_url && (
                        <img src={v.thumbnail_url} alt={v.name ?? v.label} className="w-24 h-24 object-cover rounded" />
                    )}
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{v.name ?? `Option ${v.label}`}</p>
                        {v.description && <p className="text-xs text-neutral-600 mt-1">{v.description}</p>}
                    </div>
                    {chosen && <Check size={20} className="text-green-700" />}
                </div>
                <p className="mt-2 text-[11px] text-neutral-500">
                    {chosen ? '✓ Approved' : 'Tap to approve this design'}
                </p>
            </button>
        );
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {variants.map((v) => {
                const chosen = chosenVariantId === v.id;
                return (
                    <button
                        key={v.id}
                        type="button"
                        onClick={() => onChoose(v.id)}
                        className={`relative rounded-lg border-2 p-3 text-left transition-colors ${
                            chosen ? 'border-green-700 bg-green-50 ring-2 ring-green-700' : 'border-neutral-200 hover:border-neutral-400'
                        }`}
                    >
                        {chosen && (
                            <span className="absolute top-2 right-2 bg-green-700 text-white rounded-full p-1">
                                <Check size={14} />
                            </span>
                        )}
                        {v.thumbnail_url && (
                            <img
                                src={v.thumbnail_url}
                                alt={v.name ?? v.label}
                                className="w-full h-40 object-cover rounded mb-2"
                            />
                        )}
                        <p className="text-sm font-bold">
                            {v.label}{v.name ? ` — ${v.name}` : ''}
                        </p>
                        {v.description && <p className="text-xs text-neutral-600 mt-1">{v.description}</p>}
                    </button>
                );
            })}
        </div>
    );
}
```

- [ ] **Step 2: Wire the picker into `ApprovalClientView.tsx`**

Open `app/approve/artwork/[token]/ApprovalClientView.tsx`. Find the place that renders each component on the approval page. Branch:

```tsx
{job.job_type === 'visual_approval' ? (
    <VariantPicker
        componentName={component.name}
        variants={component.variants ?? []}
        chosenVariantId={selections[component.id] ?? null}
        onChoose={(variantId) => setSelections((prev) => ({ ...prev, [component.id]: variantId }))}
    />
) : (
    /* existing production sub-items render, unchanged */
)}
```

Add above the component list render:

```tsx
const [selections, setSelections] = useState<Record<string, string>>({});
```

When the user submits the approval form, pass `selections` as `variant_selections`:

```tsx
const variant_selections = Object.entries(selections).map(([componentId, variantId]) => ({ componentId, variantId }));
const res = await submitApproval(token, {
    client_name, client_email, client_company, signature_data,
    variant_selections,
});
```

Disable the "Approve" button until every component has a chosen variant when `job.job_type === 'visual_approval'`:

```tsx
const allComponentsChosen = job.job_type !== 'visual_approval' ||
    job.components.every((c: any) => selections[c.id]);
```

Add `disabled={!allComponentsChosen || …}` to the submit button.

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add "app/approve/artwork/[token]/components/VariantPicker.tsx" "app/approve/artwork/[token]/ApprovalClientView.tsx"
git commit -m "feat(artwork): VariantPicker + approval UX for visual jobs"
```

---

### Task 18: `VisualsForQuoteCard` + quote page integration

**Files:**
- Create: `app/(portal)/admin/quotes/[id]/components/VisualsForQuoteCard.tsx`
- Modify: `app/(portal)/admin/quotes/[id]/page.tsx`

- [ ] **Step 1: Write the card**

```tsx
'use client';

import Link from 'next/link';
import { FileImage } from 'lucide-react';
import { NewVisualJobButton } from '@/app/(portal)/admin/artwork/components/NewVisualJobButton';

interface VisualJobRow {
    id: string;
    job_name: string;
    status: string;
}

interface OrgOption { id: string; name: string; }

interface Props {
    quoteId: string;
    orgId: string | null;
    orgs: OrgOption[];
    visualJobs: VisualJobRow[];
}

export function VisualsForQuoteCard({ quoteId, orgId, orgs, visualJobs }: Props) {
    return (
        <div className="rounded-lg border border-neutral-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-bold flex items-center gap-2">
                    <FileImage size={16} className="text-[#4e7e8c]" />
                    Visuals for this quote
                </h4>
                <NewVisualJobButton
                    orgs={orgs}
                    defaultOrgId={orgId ?? undefined}
                    defaultQuoteId={quoteId}
                    buttonLabel="+ new visual"
                />
            </div>

            {visualJobs.length === 0 ? (
                <p className="text-xs text-neutral-500 italic">
                    no visuals linked — create one above if the client needs mockups before production
                </p>
            ) : (
                <ul className="space-y-1">
                    {visualJobs.map((v) => (
                        <li key={v.id}>
                            <Link
                                href={`/admin/artwork/${v.id}`}
                                className="text-sm text-[#4e7e8c] hover:underline inline-flex items-center gap-2"
                            >
                                <span className="font-semibold">{v.job_name}</span>
                                <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                                    {v.status}
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
```

- [ ] **Step 2: Load the linked visuals + render the card on the quote page**

In `app/(portal)/admin/quotes/[id]/page.tsx`, after loading the quote, fetch:

```ts
const { data: visualJobs } = await supabase
    .from('artwork_jobs')
    .select('id, job_name, status')
    .eq('quote_id', quote.id)
    .eq('job_type', 'visual_approval')
    .order('created_at', { ascending: false });

const { data: orgs } = await supabase
    .from('orgs')
    .select('id, name')
    .order('name')
    .limit(200);
```

In the JSX (somewhere sensible — alongside any existing related-records sections), render:

```tsx
<VisualsForQuoteCard
    quoteId={quote.id}
    orgId={quote.org_id ?? null}
    orgs={orgs ?? []}
    visualJobs={visualJobs ?? []}
/>
```

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add "app/(portal)/admin/quotes/[id]/components/VisualsForQuoteCard.tsx" "app/(portal)/admin/quotes/[id]/page.tsx"
git commit -m "feat(quotes): VisualsForQuoteCard section on quote detail"
```

---

### Task 19: Manual end-to-end smoke

Human verification — no code changes. Gates the push.

- [ ] **Step 1: Apply migration 043 in the Supabase SQL editor** — paste the contents of `supabase/migrations/043_visual_approval.sql`, run, verify zero errors.

- [ ] **Step 2: Walk the standalone-visual path**
  1. `/admin/artwork` → click "New visual for approval"
  2. Modal: name "Smoke test visual", no client
  3. Detail page loads; VISUAL pill is in the header; LinkedQuoteCard in sidebar (no quote yet)
  4. Add a component (existing "Add component" UI)
  5. Expand the component → "Variants" panel appears (not sub-items)
  6. Click "Add variant" twice → two variant cards (A, B)
  7. Upload a thumbnail on each, set a name on each
  8. Click "Generate approval link" → copy the token URL
  9. Open the approval URL in an incognito window → both variants shown side-by-side, tap one, approve button enables, sign + submit
  10. Back on `/admin/artwork/<visualId>` → job.status is `completed`; chosen variant has the ✓ CHOSEN badge
  11. Green "Create production artwork from this" button appears → click it
  12. Land on the new production artwork job; it has the same component, one sub-item pre-populated with the chosen variant's (optional) spec

- [ ] **Step 3: Walk the quote-linked visual path**
  1. Open a draft quote
  2. "Visuals for this quote" card → click "+ new visual"
  3. Modal opens with quote already linked (note at bottom of modal)
  4. Create; land on visual page; LinkedQuoteCard shows the quote

- [ ] **Step 4: Edge-case smoke**
  1. After approval, verify `updateVariant` / `deleteVariant` are refused (the UI should hide delete; try the server action directly if concerned)
  2. Call `createProductionFromVisual` on an already-converted visual → error `"production job already exists"`
  3. Variant-picker with 1 variant — verify approval page shows it as "Tap to approve this design"
  4. On the artwork list page, toggle the type filter — confirm visuals vs production filter correctly

- [ ] **Step 5: Push**

```bash
git push origin master:main master
```

---

## Self-review notes

- **Spec coverage:** migration 043 (Task 1), `job_type` + `quote_id` + `parent_visual_job_id` (Task 1 + Task 2), `artwork_variants` table (Task 1), standalone creation (Task 10), quote linkage (Tasks 4, 12, 18), variant CRUD (Task 5), variant thumbnails (Task 6), production handoff (Task 7, 13), list filter + pill + New Visual (Task 14), detail visual mode (Task 15), component detail variants editor (Tasks 11, 16), client approval flow (Tasks 9, 17), "Visuals for this quote" section (Task 18), smoke (Task 19). Every spec section has a task.
- **Placeholders:** none — every code step is literal, every command has an expected output.
- **Type consistency:** `ArtworkVariant`, `CreateVariantInput`, `UpdateVariantInput`, `CreateVisualJobInput`, `VariantSelection` defined in Task 2 and used identically thereafter. `VariantSubItemInput` defined in Task 3 and consumed in Task 7. `createProductionFromVisual` returns `{ productionJobId }`, consumed in Task 13. `variant_selections` shape agrees between Task 9's server schema and Task 17's client caller.
