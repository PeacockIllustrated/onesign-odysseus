# Shop Floor — guided LOOK → MEASURE → CONFIRM check — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give shop-floor workers a tablet-first, unskippable three-step guided check for every sub-item that lands in their department, with artwork preview, measurement capture, tolerance feedback, and per-sub-item production sign-off — culminating in a one-tap advance to the next stage.

**Architecture:** A new route `/shop-floor/check/[itemId]` hosts a full-screen client-side stepper that walks each sub-item (where `target_stage_id == current stage`) through LOOK → MEASURE → CONFIRM, reusing existing server actions (`submitSubItemProduction`, `advanceItemToNextRoutedStage`). One pure utility (`computeNextSubItem`) governs sub-item sequencing. One new table (`shop_floor_flags`) supports an escape-hatch "report a problem" flow. The Shop Floor queue itself is unchanged apart from making each item card tappable to navigate to the check route.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, React 19, Tailwind CSS 4, Supabase SSR, Zod, Vitest.

**Reference spec:** `docs/superpowers/specs/2026-04-15-shop-floor-guided-check-design.md`

---

## File map

**New files**

- `supabase/migrations/042_shop_floor_flags.sql` — migration for the flags table
- `lib/production/shop-floor-utils.ts` — pure `computeNextSubItem` helper
- `lib/production/shop-floor-utils.test.ts` — Vitest cases for the helper
- `lib/production/shop-floor-actions.ts` — `getSubItemsForItemAtStage`, `reportShopFloorProblem`
- `app/(portal)/shop-floor/check/[itemId]/page.tsx` — server component, loads item + sub-items
- `app/(portal)/shop-floor/check/[itemId]/GuidedCheckClient.tsx` — stepper state machine owner
- `app/(portal)/shop-floor/check/[itemId]/GuidedCheckHeader.tsx` — topbar + stepper pills + breadcrumb
- `app/(portal)/shop-floor/check/[itemId]/StepLook.tsx` — LOOK step UI
- `app/(portal)/shop-floor/check/[itemId]/StepMeasure.tsx` — MEASURE step UI
- `app/(portal)/shop-floor/check/[itemId]/StepConfirm.tsx` — CONFIRM step UI
- `app/(portal)/shop-floor/check/[itemId]/CompletionScreen.tsx` — post-final-signoff screen
- `app/(portal)/shop-floor/check/[itemId]/FlagProblemSheet.tsx` — bottom-sheet problem report
- `app/(portal)/shop-floor/check/[itemId]/ArtworkZoom.tsx` — tap-to-zoom lightbox

**Modified files**

- `app/(portal)/shop-floor/ShopFloorClient.tsx` — make each item card navigate to the check route

---

### Task 1: Migration 042 — `shop_floor_flags` table

**Files:**
- Create: `supabase/migrations/042_shop_floor_flags.sql`

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/042_shop_floor_flags.sql`:

```sql
-- Migration 042: shop-floor problem reports
--
-- Minimal escape-hatch table so a shop-floor worker can flag an issue
-- against a sub-item mid-check. Insert + read are open to any authed
-- user; resolve/delete are super-admin only.

BEGIN;

CREATE TABLE IF NOT EXISTS public.shop_floor_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sub_item_id UUID NOT NULL
        REFERENCES public.artwork_component_items(id) ON DELETE CASCADE,
    job_item_id UUID NOT NULL
        REFERENCES public.job_items(id) ON DELETE CASCADE,
    stage_id UUID REFERENCES public.production_stages(id) ON DELETE SET NULL,
    reported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reported_by_name TEXT,
    notes TEXT NOT NULL CHECK (length(notes) BETWEEN 1 AND 500),
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'resolved')),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shop_floor_flags_sub_item
    ON public.shop_floor_flags(sub_item_id);
CREATE INDEX IF NOT EXISTS idx_shop_floor_flags_job_item
    ON public.shop_floor_flags(job_item_id);
CREATE INDEX IF NOT EXISTS idx_shop_floor_flags_open
    ON public.shop_floor_flags(status) WHERE status = 'open';

ALTER TABLE public.shop_floor_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage flags"
    ON public.shop_floor_flags FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY "Authed users can create flags"
    ON public.shop_floor_flags FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authed users can read flags"
    ON public.shop_floor_flags FOR SELECT TO authenticated
    USING (auth.uid() IS NOT NULL);

COMMIT;
```

- [ ] **Step 2: Apply the migration locally**

Run in the Supabase SQL editor (project's dev DB) by pasting the file contents. Verify the table exists:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'shop_floor_flags'
ORDER BY ordinal_position;
```

Expected: 11 rows including `id`, `sub_item_id`, `notes`, `status`, etc.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/042_shop_floor_flags.sql
git commit -m "feat(db): migration 042 — shop_floor_flags table for problem reports"
```

---

### Task 2: Pure utility `computeNextSubItem` (TDD)

**Files:**
- Create: `lib/production/shop-floor-utils.ts`
- Test: `lib/production/shop-floor-utils.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/production/shop-floor-utils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeNextSubItem, type SubItemForStage } from './shop-floor-utils';

const stageId = 'stage-cnc';

function si(overrides: Partial<SubItemForStage>): SubItemForStage {
    return {
        id: overrides.id ?? 'x',
        label: overrides.label ?? 'A',
        target_stage_id: stageId,
        production_signed_off_at: null,
        ...overrides,
    };
}

describe('computeNextSubItem', () => {
    it('returns 0 when nothing signed off yet', () => {
        const items = [si({ id: 'a' }), si({ id: 'b' })];
        expect(computeNextSubItem(items)).toBe(0);
    });

    it('skips the first sub-item if already signed off', () => {
        const items = [
            si({ id: 'a', production_signed_off_at: '2026-04-15T10:00:00Z' }),
            si({ id: 'b' }),
        ];
        expect(computeNextSubItem(items)).toBe(1);
    });

    it('returns null when every sub-item is signed off', () => {
        const items = [
            si({ id: 'a', production_signed_off_at: '2026-04-15T10:00:00Z' }),
            si({ id: 'b', production_signed_off_at: '2026-04-15T10:05:00Z' }),
        ];
        expect(computeNextSubItem(items)).toBeNull();
    });

    it('returns null for an empty list', () => {
        expect(computeNextSubItem([])).toBeNull();
    });

    it('ignores order of sub-items and returns the first pending by array index', () => {
        const items = [
            si({ id: 'a', production_signed_off_at: '2026-04-15T10:00:00Z' }),
            si({ id: 'b' }),
            si({ id: 'c', production_signed_off_at: '2026-04-15T11:00:00Z' }),
        ];
        expect(computeNextSubItem(items)).toBe(1);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run test -- --run lib/production/shop-floor-utils.test.ts
```

Expected: FAIL with "Cannot find module './shop-floor-utils'".

- [ ] **Step 3: Write the minimal implementation**

Create `lib/production/shop-floor-utils.ts`:

```typescript
/**
 * Shop-floor stepper helpers — pure functions used by the guided check UI.
 */

export interface SubItemForStage {
    id: string;
    label: string;
    target_stage_id: string | null;
    production_signed_off_at: string | null;
}

/**
 * Given the list of sub-items already filtered to the current stage,
 * return the array index of the next sub-item that still needs production
 * sign-off. Returns null when every sub-item is signed off (or the list
 * is empty).
 */
export function computeNextSubItem(items: SubItemForStage[]): number | null {
    for (let i = 0; i < items.length; i++) {
        if (!items[i].production_signed_off_at) return i;
    }
    return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm run test -- --run lib/production/shop-floor-utils.test.ts
```

Expected: `Tests  5 passed (5)`.

- [ ] **Step 5: Commit**

```bash
git add lib/production/shop-floor-utils.ts lib/production/shop-floor-utils.test.ts
git commit -m "feat(production): computeNextSubItem helper for shop-floor stepper"
```

---

### Task 3: Server actions — `getSubItemsForItemAtStage` and `reportShopFloorProblem`

**Files:**
- Create: `lib/production/shop-floor-actions.ts`

- [ ] **Step 1: Write the actions file**

Create `lib/production/shop-floor-actions.ts`:

```typescript
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase-server';
import { getUser } from '@/lib/auth';

// ---------------------------------------------------------------------------
// getSubItemsForItemAtStage
// ---------------------------------------------------------------------------

export interface ShopFloorSubItem {
    id: string;
    label: string;
    name: string | null;
    material: string | null;
    application_method: string | null;
    finish: string | null;
    quantity: number;
    width_mm: number | null;
    height_mm: number | null;
    returns_mm: number | null;
    measured_width_mm: number | null;
    measured_height_mm: number | null;
    dimension_flag: 'within_tolerance' | 'out_of_tolerance' | null;
    target_stage_id: string | null;
    design_signed_off_at: string | null;
    production_signed_off_at: string | null;
    thumbnail_url: string | null;
    component_id: string;
    component_name: string;
}

export interface ShopFloorCheckContext {
    item: {
        id: string;
        description: string;
        item_number: string | null;
        current_stage_id: string | null;
        stage_routing: string[] | null;
        job_id: string;
        job_number: string;
        client_name: string;
    };
    stage: { id: string; name: string; slug: string } | null;
    nextStage: { id: string; name: string; slug: string } | null;
    subItems: ShopFloorSubItem[];
    stageInstructions: string[];
}

/**
 * Load everything the shop-floor guided check needs in one round-trip:
 * the job_item, the artwork sub-items whose target_stage_id matches the
 * item's current stage, any admin instructions for that stage, and the
 * next stage in the item's routing (so "Complete & send to …" can label
 * itself correctly).
 */
export async function getSubItemsForItemAtStage(
    itemId: string
): Promise<ShopFloorCheckContext | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const supabase = await createServerClient();

    // 1. Load the job_item + its parent production_job (for breadcrumbs).
    const { data: item, error: itemErr } = await supabase
        .from('job_items')
        .select(
            `id, description, item_number, current_stage_id, stage_routing, job_id,
             production_jobs!inner(job_number, client_name)`
        )
        .eq('id', itemId)
        .single();
    if (itemErr || !item) return { error: 'job item not found' };

    const job = (item as any).production_jobs;

    // 2. Resolve the current + next stages.
    const { data: stages } = await supabase
        .from('production_stages')
        .select('id, name, slug, sort_order')
        .is('org_id', null)
        .order('sort_order', { ascending: true });

    const stage =
        stages?.find((s: any) => s.id === item.current_stage_id) ?? null;

    const routing = (item.stage_routing as string[] | null) ?? [];
    const currentIdx = stage ? routing.indexOf(stage.id) : -1;
    const nextStageId =
        currentIdx >= 0 && currentIdx < routing.length - 1
            ? routing[currentIdx + 1]
            : null;
    const nextStage =
        (nextStageId && stages?.find((s: any) => s.id === nextStageId)) || null;

    // 3. Find the artwork_job + its components + sub-items for this item.
    const { data: artworkJob } = await supabase
        .from('artwork_jobs')
        .select('id')
        .eq('job_item_id', itemId)
        .maybeSingle();

    let subItems: ShopFloorSubItem[] = [];
    if (artworkJob && stage) {
        const { data: components } = await supabase
            .from('artwork_components')
            .select(
                `id, name,
                 sub_items:artwork_component_items(
                    id, label, sort_order, name, material, application_method,
                    finish, quantity, width_mm, height_mm, returns_mm,
                    measured_width_mm, measured_height_mm, dimension_flag,
                    target_stage_id, design_signed_off_at,
                    production_signed_off_at, thumbnail_url
                 )`
            )
            .eq('job_id', artworkJob.id);

        const all: ShopFloorSubItem[] = [];
        for (const c of components ?? []) {
            for (const si of (c as any).sub_items ?? []) {
                if (si.target_stage_id === stage.id) {
                    all.push({
                        ...si,
                        component_id: (c as any).id,
                        component_name: (c as any).name,
                    });
                }
            }
        }
        all.sort((a, b) => {
            if (a.component_name !== b.component_name) {
                return a.component_name.localeCompare(b.component_name);
            }
            return a.label.localeCompare(b.label);
        });
        subItems = all;
    }

    // 4. Admin instructions for this (job, stage).
    let stageInstructions: string[] = [];
    if (stage) {
        const { data: instrs } = await supabase
            .from('department_instructions')
            .select('instruction')
            .eq('job_id', item.job_id)
            .eq('stage_id', stage.id)
            .order('created_at', { ascending: true });
        stageInstructions = (instrs ?? []).map((i: any) => i.instruction);
    }

    return {
        item: {
            id: item.id,
            description: item.description,
            item_number: item.item_number ?? null,
            current_stage_id: item.current_stage_id ?? null,
            stage_routing: (item.stage_routing as string[] | null) ?? null,
            job_id: item.job_id,
            job_number: job.job_number,
            client_name: job.client_name,
        },
        stage: stage
            ? { id: stage.id, name: stage.name, slug: stage.slug }
            : null,
        nextStage: nextStage
            ? { id: nextStage.id, name: nextStage.name, slug: nextStage.slug }
            : null,
        subItems,
        stageInstructions,
    };
}

// ---------------------------------------------------------------------------
// reportShopFloorProblem
// ---------------------------------------------------------------------------

export const ReportProblemInputSchema = z.object({
    subItemId: z.string().uuid(),
    jobItemId: z.string().uuid(),
    stageId: z.string().uuid().nullable(),
    notes: z.string().min(1, 'notes are required').max(500),
});
export type ReportProblemInput = z.infer<typeof ReportProblemInputSchema>;

/**
 * Record a worker-reported problem against a sub-item and pause the job_item.
 * Best-effort: if the pause fails we still return success for the flag so the
 * worker's report isn't lost.
 */
export async function reportShopFloorProblem(
    input: ReportProblemInput
): Promise<{ id: string } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const validation = ReportProblemInputSchema.safeParse(input);
    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }
    const parsed = validation.data;

    const supabase = await createServerClient();

    const { data: flag, error: flagErr } = await supabase
        .from('shop_floor_flags')
        .insert({
            sub_item_id: parsed.subItemId,
            job_item_id: parsed.jobItemId,
            stage_id: parsed.stageId,
            reported_by: user.id,
            reported_by_name: user.email ?? null,
            notes: parsed.notes,
            status: 'open',
        })
        .select('id')
        .single();

    if (flagErr || !flag) {
        console.error('reportShopFloorProblem insert error:', flagErr);
        return { error: flagErr?.message ?? 'Failed to record flag' };
    }

    // Pause the item so staff see it's held up.
    const { error: pauseErr } = await supabase
        .from('job_items')
        .update({ status: 'pending' })
        .eq('id', parsed.jobItemId);
    if (pauseErr) {
        console.error('reportShopFloorProblem pause error:', pauseErr);
        // intentionally not returning an error — the flag itself was recorded.
    }

    revalidatePath('/shop-floor');
    revalidatePath(`/shop-floor/check/${parsed.jobItemId}`);
    revalidatePath('/admin/artwork');
    revalidatePath('/admin/jobs');
    return { id: flag.id };
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add lib/production/shop-floor-actions.ts
git commit -m "feat(production): shop-floor actions — getSubItemsForItemAtStage + reportShopFloorProblem"
```

---

### Task 4: Route scaffold + `GuidedCheckClient` shell

**Files:**
- Create: `app/(portal)/shop-floor/check/[itemId]/page.tsx`
- Create: `app/(portal)/shop-floor/check/[itemId]/GuidedCheckClient.tsx`

- [ ] **Step 1: Write the server component**

Create `app/(portal)/shop-floor/check/[itemId]/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { getSubItemsForItemAtStage } from '@/lib/production/shop-floor-actions';
import { GuidedCheckClient } from './GuidedCheckClient';

export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ itemId: string }>;
}

export default async function ShopFloorCheckPage({ params }: PageProps) {
    await requireAuth();
    const { itemId } = await params;

    const ctx = await getSubItemsForItemAtStage(itemId);
    if ('error' in ctx) {
        // Most likely: item not found, or not authenticated (already caught).
        redirect('/shop-floor');
    }

    return <GuidedCheckClient ctx={ctx} />;
}
```

- [ ] **Step 2: Write the client shell with the stepper state machine**

Create `app/(portal)/shop-floor/check/[itemId]/GuidedCheckClient.tsx`:

```tsx
'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { ShopFloorCheckContext, ShopFloorSubItem } from '@/lib/production/shop-floor-actions';
import { computeNextSubItem } from '@/lib/production/shop-floor-utils';
import { GuidedCheckHeader } from './GuidedCheckHeader';
import { StepLook } from './StepLook';
import { StepMeasure } from './StepMeasure';
import { StepConfirm } from './StepConfirm';
import { CompletionScreen } from './CompletionScreen';
import { FlagProblemSheet } from './FlagProblemSheet';

export type StepName = 'look' | 'measure' | 'confirm';

interface Props {
    ctx: ShopFloorCheckContext;
}

export function GuidedCheckClient({ ctx }: Props) {
    const router = useRouter();
    const { subItems } = ctx;

    // Pending measurements (entered on MEASURE, committed on CONFIRM sign-off).
    const [measuredW, setMeasuredW] = useState<string>('');
    const [measuredH, setMeasuredH] = useState<string>('');

    // Start at the first not-yet-signed-off sub-item.
    const initialIdx = useMemo(() => computeNextSubItem(subItems), [subItems]);
    const [subIdx, setSubIdx] = useState<number | null>(initialIdx);
    const [step, setStep] = useState<StepName>('look');
    const [showFlag, setShowFlag] = useState(false);

    // All department sub-items done → show completion screen.
    if (subIdx === null || subItems.length === 0) {
        return (
            <CompletionScreen
                ctx={ctx}
                onDone={() => router.push('/shop-floor')}
            />
        );
    }

    const subItem: ShopFloorSubItem = subItems[subIdx];

    const goToStep = (next: StepName) => setStep(next);

    const goToBack = () => {
        if (step === 'measure') return setStep('look');
        if (step === 'confirm') return setStep('measure');
        router.push('/shop-floor');
    };

    // Called after successful production sign-off — advance to the next
    // un-signed-off sub-item, or surface the completion screen.
    const afterSignOff = () => {
        const remaining = subItems.map((si, i) => (i === subIdx ? { ...si, production_signed_off_at: new Date().toISOString() } : si));
        const next = computeNextSubItem(remaining);
        setMeasuredW('');
        setMeasuredH('');
        if (next === null) {
            router.refresh();
            setSubIdx(null);
        } else {
            setSubIdx(next);
            setStep('look');
            router.refresh();
        }
    };

    return (
        <div className="min-h-screen bg-neutral-50">
            <GuidedCheckHeader
                ctx={ctx}
                subItem={subItem}
                subIdx={subIdx}
                totalSubItems={subItems.length}
                step={step}
                onBack={goToBack}
            />

            <div className="max-w-3xl mx-auto p-4 pb-10">
                {step === 'look' && (
                    <StepLook
                        subItem={subItem}
                        stageInstructions={ctx.stageInstructions}
                        onNext={() => goToStep('measure')}
                        onReportProblem={() => setShowFlag(true)}
                    />
                )}

                {step === 'measure' && (
                    <StepMeasure
                        subItem={subItem}
                        measuredW={measuredW}
                        measuredH={measuredH}
                        onChangeW={setMeasuredW}
                        onChangeH={setMeasuredH}
                        onNext={() => goToStep('confirm')}
                        onReportProblem={() => setShowFlag(true)}
                    />
                )}

                {step === 'confirm' && (
                    <StepConfirm
                        subItem={subItem}
                        measuredW={measuredW}
                        measuredH={measuredH}
                        onSignedOff={afterSignOff}
                        onReportProblem={() => setShowFlag(true)}
                    />
                )}
            </div>

            {showFlag && (
                <FlagProblemSheet
                    subItem={subItem}
                    jobItemId={ctx.item.id}
                    stageId={ctx.stage?.id ?? null}
                    onClose={() => setShowFlag(false)}
                    onSubmitted={() => {
                        setShowFlag(false);
                        router.push('/shop-floor');
                    }}
                />
            )}
        </div>
    );
}
```

- [ ] **Step 3: Stub the child components so the typecheck passes**

The above imports six children that don't exist yet. Create each with a minimum stub so the page at least compiles — we'll flesh them out in later tasks.

Create `app/(portal)/shop-floor/check/[itemId]/GuidedCheckHeader.tsx`:

```tsx
'use client';
import type { ShopFloorCheckContext, ShopFloorSubItem } from '@/lib/production/shop-floor-actions';
import type { StepName } from './GuidedCheckClient';

interface Props {
    ctx: ShopFloorCheckContext;
    subItem: ShopFloorSubItem;
    subIdx: number;
    totalSubItems: number;
    step: StepName;
    onBack: () => void;
}
export function GuidedCheckHeader(_: Props) {
    return <div data-stub="header" />;
}
```

Create `app/(portal)/shop-floor/check/[itemId]/StepLook.tsx`:

```tsx
'use client';
import type { ShopFloorSubItem } from '@/lib/production/shop-floor-actions';

interface Props {
    subItem: ShopFloorSubItem;
    stageInstructions: string[];
    onNext: () => void;
    onReportProblem: () => void;
}
export function StepLook(_: Props) {
    return <div data-stub="step-look" />;
}
```

Create `app/(portal)/shop-floor/check/[itemId]/StepMeasure.tsx`:

```tsx
'use client';
import type { ShopFloorSubItem } from '@/lib/production/shop-floor-actions';

interface Props {
    subItem: ShopFloorSubItem;
    measuredW: string;
    measuredH: string;
    onChangeW: (v: string) => void;
    onChangeH: (v: string) => void;
    onNext: () => void;
    onReportProblem: () => void;
}
export function StepMeasure(_: Props) {
    return <div data-stub="step-measure" />;
}
```

Create `app/(portal)/shop-floor/check/[itemId]/StepConfirm.tsx`:

```tsx
'use client';
import type { ShopFloorSubItem } from '@/lib/production/shop-floor-actions';

interface Props {
    subItem: ShopFloorSubItem;
    measuredW: string;
    measuredH: string;
    onSignedOff: () => void;
    onReportProblem: () => void;
}
export function StepConfirm(_: Props) {
    return <div data-stub="step-confirm" />;
}
```

Create `app/(portal)/shop-floor/check/[itemId]/CompletionScreen.tsx`:

```tsx
'use client';
import type { ShopFloorCheckContext } from '@/lib/production/shop-floor-actions';

interface Props {
    ctx: ShopFloorCheckContext;
    onDone: () => void;
}
export function CompletionScreen(_: Props) {
    return <div data-stub="completion" />;
}
```

Create `app/(portal)/shop-floor/check/[itemId]/FlagProblemSheet.tsx`:

```tsx
'use client';
import type { ShopFloorSubItem } from '@/lib/production/shop-floor-actions';

interface Props {
    subItem: ShopFloorSubItem;
    jobItemId: string;
    stageId: string | null;
    onClose: () => void;
    onSubmitted: () => void;
}
export function FlagProblemSheet(_: Props) {
    return <div data-stub="flag-sheet" />;
}
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/"(portal)"/shop-floor/check
git commit -m "feat(shop-floor): route scaffold + GuidedCheckClient state machine"
```

---

### Task 5: `GuidedCheckHeader` — topbar + stepper pills + sub-item breadcrumb

**Files:**
- Modify: `app/(portal)/shop-floor/check/[itemId]/GuidedCheckHeader.tsx`

- [ ] **Step 1: Replace the stub with the real component**

Overwrite `app/(portal)/shop-floor/check/[itemId]/GuidedCheckHeader.tsx`:

```tsx
'use client';

import { ChevronLeft } from 'lucide-react';
import type { ShopFloorCheckContext, ShopFloorSubItem } from '@/lib/production/shop-floor-actions';
import type { StepName } from './GuidedCheckClient';

interface Props {
    ctx: ShopFloorCheckContext;
    subItem: ShopFloorSubItem;
    subIdx: number;
    totalSubItems: number;
    step: StepName;
    onBack: () => void;
}

const STEP_ORDER: StepName[] = ['look', 'measure', 'confirm'];
const STEP_LABEL: Record<StepName, string> = {
    look: '1 · LOOK',
    measure: '2 · MEASURE',
    confirm: '3 · CONFIRM',
};

export function GuidedCheckHeader({ ctx, subItem, subIdx, totalSubItems, step, onBack }: Props) {
    const currentStepIdx = STEP_ORDER.indexOf(step);

    return (
        <header className="sticky top-0 z-20 bg-[#1a1f23] text-white">
            <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
                <button
                    onClick={onBack}
                    className="flex items-center gap-1 px-3 py-2 rounded bg-neutral-700 hover:bg-neutral-600 text-sm font-semibold"
                    aria-label="Back"
                >
                    <ChevronLeft size={16} />
                    Back
                </button>
                <div className="flex-1 min-w-0 text-sm font-semibold truncate">
                    {ctx.item.job_number}
                    {ctx.item.item_number ? ` / ${ctx.item.item_number}` : ''} · {ctx.item.client_name}
                </div>
                {ctx.stage && (
                    <span className="px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider bg-[#4e7e8c]">
                        {ctx.stage.name}
                    </span>
                )}
            </div>

            <div className="max-w-3xl mx-auto px-4 pb-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-300 mb-2">
                    Sub-item {subIdx + 1} of {totalSubItems}
                    {subItem.label ? ` — ${subItem.label}` : ''}
                    {subItem.name ? ` · ${subItem.name}` : ''}
                </div>

                <div className="flex gap-1.5">
                    {STEP_ORDER.map((s, i) => {
                        const state =
                            i < currentStepIdx ? 'done' : i === currentStepIdx ? 'active' : 'pending';
                        const cls =
                            state === 'done'
                                ? 'bg-green-700 text-white'
                                : state === 'active'
                                    ? 'bg-black text-white ring-2 ring-[#4e7e8c]'
                                    : 'bg-neutral-700 text-neutral-400';
                        return (
                            <div
                                key={s}
                                className={`flex-1 px-2 py-2 rounded text-[11px] font-bold text-center ${cls}`}
                            >
                                {STEP_LABEL[s]}
                            </div>
                        );
                    })}
                </div>
            </div>
        </header>
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
git add app/"(portal)"/shop-floor/check/\[itemId\]/GuidedCheckHeader.tsx
git commit -m "feat(shop-floor): GuidedCheckHeader — topbar, breadcrumb, stepper pills"
```

---

### Task 6: `StepLook` + `ArtworkZoom`

**Files:**
- Create: `app/(portal)/shop-floor/check/[itemId]/ArtworkZoom.tsx`
- Modify: `app/(portal)/shop-floor/check/[itemId]/StepLook.tsx`

- [ ] **Step 1: Write the `ArtworkZoom` lightbox**

Create `app/(portal)/shop-floor/check/[itemId]/ArtworkZoom.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

interface Props {
    url: string | null;
    alt: string;
}

/**
 * Minimal tap-to-fullscreen viewer. Opens a fixed overlay showing the
 * artwork at the largest size the viewport allows. Pinch-zoom / double-tap
 * reset rely on the browser's native image zoom on tablets.
 */
export function ArtworkZoom({ url, alt }: Props) {
    const [open, setOpen] = useState(false);

    if (!url) {
        return (
            <div className="w-full aspect-[16/9] rounded-lg border-2 border-dashed border-neutral-300 bg-neutral-100 flex items-center justify-center text-neutral-500 italic text-sm">
                no artwork uploaded yet
            </div>
        );
    }

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="relative block w-full rounded-lg overflow-hidden border-2 border-neutral-200 bg-neutral-50 focus:outline-none focus:ring-4 focus:ring-[#4e7e8c]"
                aria-label="Zoom artwork"
            >
                <img src={url} alt={alt} className="w-full max-h-[55vh] object-contain" />
                <span className="absolute bottom-2 right-2 bg-black/70 text-white text-[11px] font-semibold px-2 py-1 rounded">
                    🔍 tap to zoom
                </span>
            </button>

            {open && (
                <div
                    className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
                    onClick={() => setOpen(false)}
                >
                    <button
                        type="button"
                        onClick={() => setOpen(false)}
                        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
                        aria-label="Close zoom"
                    >
                        <X size={22} />
                    </button>
                    <img
                        src={url}
                        alt={alt}
                        className="max-w-[95vw] max-h-[95vh] object-contain touch-pinch-zoom"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}
        </>
    );
}
```

- [ ] **Step 2: Write the `StepLook` component**

Overwrite `app/(portal)/shop-floor/check/[itemId]/StepLook.tsx`:

```tsx
'use client';

import { AlertTriangle } from 'lucide-react';
import type { ShopFloorSubItem } from '@/lib/production/shop-floor-actions';
import { ArtworkZoom } from './ArtworkZoom';

interface Props {
    subItem: ShopFloorSubItem;
    stageInstructions: string[];
    onNext: () => void;
    onReportProblem: () => void;
}

function specRow(k: string, v: string | number | null | undefined) {
    if (v === null || v === undefined || v === '') return null;
    return (
        <div className="flex justify-between text-sm py-1 border-b border-dotted border-neutral-200 last:border-none" key={k}>
            <span className="text-neutral-500">{k}</span>
            <span className="font-semibold text-neutral-900">{v}</span>
        </div>
    );
}

function dims(w: number | null, h: number | null, r: number | null) {
    if (!w && !h) return null;
    const parts = [w, h, r].filter((x): x is number => x != null).map((n) => `${n}`);
    return parts.join(' × ') + ' mm';
}

export function StepLook({ subItem, stageInstructions, onNext, onReportProblem }: Props) {
    const sizeText = dims(subItem.width_mm, subItem.height_mm, subItem.returns_mm);

    return (
        <div className="space-y-4 md:grid md:grid-cols-[1.4fr_1fr] md:gap-4 md:space-y-0">
            <div>
                <ArtworkZoom url={subItem.thumbnail_url} alt={subItem.name ?? 'Artwork'} />
            </div>

            <div className="space-y-3">
                <div className="bg-white rounded-lg border border-neutral-200 p-4">
                    <h4 className="text-[11px] uppercase tracking-[0.1em] font-bold text-neutral-500 mb-2">Spec</h4>
                    {specRow('Material', subItem.material)}
                    {specRow('Method', subItem.application_method)}
                    {specRow('Finish', subItem.finish)}
                    {specRow('Size', sizeText)}
                    {specRow('Qty', subItem.quantity)}
                </div>

                {stageInstructions.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <h4 className="text-[11px] uppercase tracking-[0.1em] font-bold text-amber-800 mb-2">
                            Notes for this stage
                        </h4>
                        <ul className="space-y-1">
                            {stageInstructions.map((t, i) => (
                                <li key={i} className="text-sm text-amber-900">• {t}</li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            <div className="md:col-span-2 space-y-2">
                <button
                    type="button"
                    onClick={onNext}
                    className="w-full py-4 rounded-lg bg-[#1a1f23] hover:bg-black text-white text-base font-bold"
                >
                    Next — Measure →
                </button>
                <button
                    type="button"
                    onClick={onReportProblem}
                    className="w-full py-2 text-xs text-red-700 hover:underline flex items-center justify-center gap-1"
                >
                    <AlertTriangle size={14} />
                    Report a problem
                </button>
            </div>
        </div>
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
git add app/"(portal)"/shop-floor/check/\[itemId\]/StepLook.tsx app/"(portal)"/shop-floor/check/\[itemId\]/ArtworkZoom.tsx
git commit -m "feat(shop-floor): StepLook + ArtworkZoom — artwork + spec + stage notes"
```

---

### Task 7: `StepMeasure` — measurement inputs + live tolerance pill

**Files:**
- Modify: `app/(portal)/shop-floor/check/[itemId]/StepMeasure.tsx`

- [ ] **Step 1: Write the component**

Overwrite `app/(portal)/shop-floor/check/[itemId]/StepMeasure.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { ShopFloorSubItem } from '@/lib/production/shop-floor-actions';
import { checkDimensionTolerance } from '@/lib/artwork/utils';

interface Props {
    subItem: ShopFloorSubItem;
    measuredW: string;
    measuredH: string;
    onChangeW: (v: string) => void;
    onChangeH: (v: string) => void;
    onNext: () => void;
    onReportProblem: () => void;
}

/**
 * Capture measured width + height (returns ignored in v1 — spec already
 * shows them on LOOK). Live tolerance pill is driven by the existing
 * checkDimensionTolerance helper. Worker may proceed even when out of
 * tolerance — the pill is informational, not a hard gate.
 */
export function StepMeasure({
    subItem, measuredW, measuredH, onChangeW, onChangeH, onNext, onReportProblem,
}: Props) {
    // Pre-fill from whatever's already on the sub-item (idempotent reloads).
    useEffect(() => {
        if (!measuredW && subItem.measured_width_mm != null) {
            onChangeW(String(subItem.measured_width_mm));
        }
        if (!measuredH && subItem.measured_height_mm != null) {
            onChangeH(String(subItem.measured_height_mm));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [subItem.id]);

    const wNum = measuredW === '' ? null : Number(measuredW);
    const hNum = measuredH === '' ? null : Number(measuredH);
    const bothEntered = wNum != null && !Number.isNaN(wNum) && hNum != null && !Number.isNaN(hNum);
    const canProceed = bothEntered;

    const tol =
        bothEntered && subItem.width_mm != null && subItem.height_mm != null
            ? checkDimensionTolerance(
                Number(subItem.width_mm),
                Number(subItem.height_mm),
                wNum,
                hNum,
            )
            : null;

    return (
        <div className="space-y-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
            <div className="bg-white rounded-lg border border-neutral-200 p-4">
                <h4 className="text-[11px] uppercase tracking-[0.1em] font-bold text-neutral-500 mb-2">
                    Design says
                </h4>
                <div className="flex justify-between text-sm py-1 border-b border-dotted border-neutral-200">
                    <span className="text-neutral-500">Width</span>
                    <span className="font-mono font-semibold">{subItem.width_mm ?? '—'} mm</span>
                </div>
                <div className="flex justify-between text-sm py-1 border-b border-dotted border-neutral-200">
                    <span className="text-neutral-500">Height</span>
                    <span className="font-mono font-semibold">{subItem.height_mm ?? '—'} mm</span>
                </div>
                {subItem.returns_mm != null && (
                    <div className="flex justify-between text-sm py-1">
                        <span className="text-neutral-500">Returns</span>
                        <span className="font-mono font-semibold">{subItem.returns_mm} mm</span>
                    </div>
                )}
            </div>

            <div className="space-y-2">
                <label className="block">
                    <span className="block text-xs font-semibold text-neutral-700 mb-1">Measured width (mm)</span>
                    <input
                        type="number"
                        inputMode="decimal"
                        value={measuredW}
                        onChange={(e) => onChangeW(e.target.value)}
                        className="w-full text-2xl font-mono font-bold px-4 py-3 rounded-lg border-2 border-[#4e7e8c] focus:outline-none focus:ring-2 focus:ring-black"
                        placeholder="0"
                    />
                </label>
                <label className="block">
                    <span className="block text-xs font-semibold text-neutral-700 mb-1">Measured height (mm)</span>
                    <input
                        type="number"
                        inputMode="decimal"
                        value={measuredH}
                        onChange={(e) => onChangeH(e.target.value)}
                        className="w-full text-2xl font-mono font-bold px-4 py-3 rounded-lg border-2 border-[#4e7e8c] focus:outline-none focus:ring-2 focus:ring-black"
                        placeholder="0"
                    />
                </label>

                {tol && (
                    <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                            tol.flag === 'within_tolerance'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                        }`}
                    >
                        {tol.flag === 'within_tolerance' ? '✓ Within tolerance' : '⚠ Out of tolerance'}
                    </span>
                )}
            </div>

            <div className="md:col-span-2 space-y-2">
                <button
                    type="button"
                    onClick={onNext}
                    disabled={!canProceed}
                    className="w-full py-4 rounded-lg bg-[#1a1f23] hover:bg-black text-white text-base font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Next — Confirm →
                </button>
                <button
                    type="button"
                    onClick={onReportProblem}
                    className="w-full py-2 text-xs text-red-700 hover:underline flex items-center justify-center gap-1"
                >
                    <AlertTriangle size={14} />
                    Report a problem
                </button>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Verify `checkDimensionTolerance` signature matches**

Open `lib/artwork/utils.ts` and find `checkDimensionTolerance`. If the signature differs from `(designW, designH, measuredW, measuredH) => { flag, ... }`, adjust the call in `StepMeasure.tsx` to match. (As of this writing the helper returns `{ flag, widthDeviation, heightDeviation }` taking those four numbers, but verify with a quick `grep -n "export function checkDimensionTolerance" lib/artwork/utils.ts`.)

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: exit 0. If the signature mismatches, fix the call site and re-run.

- [ ] **Step 4: Commit**

```bash
git add app/"(portal)"/shop-floor/check/\[itemId\]/StepMeasure.tsx
git commit -m "feat(shop-floor): StepMeasure — large inputs + live tolerance pill"
```

---

### Task 8: `StepConfirm` — recap + production sign-off

**Files:**
- Modify: `app/(portal)/shop-floor/check/[itemId]/StepConfirm.tsx`

- [ ] **Step 1: Write the component**

Overwrite `app/(portal)/shop-floor/check/[itemId]/StepConfirm.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import type { ShopFloorSubItem } from '@/lib/production/shop-floor-actions';
import { submitSubItemProduction } from '@/lib/artwork/sub-item-actions';
import { checkDimensionTolerance } from '@/lib/artwork/utils';

interface Props {
    subItem: ShopFloorSubItem;
    measuredW: string;
    measuredH: string;
    onSignedOff: () => void;
    onReportProblem: () => void;
}

export function StepConfirm({ subItem, measuredW, measuredH, onSignedOff, onReportProblem }: Props) {
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const wNum = Number(measuredW);
    const hNum = Number(measuredH);

    const tol =
        subItem.width_mm != null && subItem.height_mm != null
            ? checkDimensionTolerance(
                Number(subItem.width_mm),
                Number(subItem.height_mm),
                wNum,
                hNum,
            )
            : null;

    const doSignOff = () => {
        setError(null);
        startTransition(async () => {
            const res = await submitSubItemProduction(
                subItem.id,
                {
                    measured_width_mm: wNum,
                    measured_height_mm: hNum,
                },
                true, // signOff
            );
            if ('error' in res) {
                setError(res.error);
                return;
            }
            onSignedOff();
        });
    };

    return (
        <div className="space-y-4">
            <div className="bg-white rounded-lg border border-neutral-200 p-4">
                <h4 className="text-[11px] uppercase tracking-[0.1em] font-bold text-neutral-500 mb-2">Recap</h4>
                <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                    <span className="text-neutral-500">Spec</span>
                    <span className="font-semibold text-neutral-900 text-right">
                        {[subItem.material, subItem.finish, subItem.width_mm && `${subItem.width_mm} × ${subItem.height_mm}`]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                    </span>

                    <span className="text-neutral-500">Measured</span>
                    <span className="font-mono font-semibold text-neutral-900 text-right">
                        {wNum || '—'} × {hNum || '—'} mm
                    </span>

                    <span className="text-neutral-500">Tolerance</span>
                    <span
                        className={`font-semibold text-right ${
                            tol?.flag === 'within_tolerance' ? 'text-green-700' : tol ? 'text-red-700' : 'text-neutral-400'
                        }`}
                    >
                        {tol ? (tol.flag === 'within_tolerance' ? 'within ±1 mm' : `out of tolerance`) : '—'}
                    </span>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                    {error}
                </div>
            )}

            <button
                type="button"
                onClick={doSignOff}
                disabled={pending}
                className="w-full py-5 rounded-lg bg-green-700 hover:bg-green-800 text-white text-base font-bold flex items-center justify-center gap-2 disabled:opacity-60"
            >
                {pending ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                {pending ? 'Signing off…' : 'Production checked — sign off'}
            </button>

            <button
                type="button"
                onClick={onReportProblem}
                className="w-full py-2 text-xs text-red-700 hover:underline flex items-center justify-center gap-1"
            >
                <AlertTriangle size={14} />
                Report a problem instead
            </button>
        </div>
    );
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: exit 0. If `submitSubItemProduction` has a different signature than `(subItemId, { measured_width_mm, measured_height_mm }, signOff: boolean)`, adjust to match (grep `export async function submitSubItemProduction` in `lib/artwork/sub-item-actions.ts` to confirm).

- [ ] **Step 3: Commit**

```bash
git add app/"(portal)"/shop-floor/check/\[itemId\]/StepConfirm.tsx
git commit -m "feat(shop-floor): StepConfirm — recap + production sign-off"
```

---

### Task 9: `CompletionScreen` — advance to next stage

**Files:**
- Modify: `app/(portal)/shop-floor/check/[itemId]/CompletionScreen.tsx`

- [ ] **Step 1: Write the component**

Overwrite `app/(portal)/shop-floor/check/[itemId]/CompletionScreen.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { ArrowRight, Loader2, Pause } from 'lucide-react';
import type { ShopFloorCheckContext } from '@/lib/production/shop-floor-actions';
import { advanceItemToNextRoutedStage, pauseItem } from '@/lib/production/actions';

interface Props {
    ctx: ShopFloorCheckContext;
    onDone: () => void;
}

export function CompletionScreen({ ctx, onDone }: Props) {
    const [pendingKind, setPendingKind] = useState<'advance' | 'pause' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [, startTransition] = useTransition();

    const doAdvance = () => {
        setError(null);
        setPendingKind('advance');
        startTransition(async () => {
            const res = await advanceItemToNextRoutedStage(ctx.item.id);
            if ('error' in res) {
                setError(res.error);
                setPendingKind(null);
                return;
            }
            onDone();
        });
    };

    const doPause = () => {
        setError(null);
        setPendingKind('pause');
        startTransition(async () => {
            const res = await pauseItem(ctx.item.id);
            if ('error' in res) {
                setError(res.error);
                setPendingKind(null);
                return;
            }
            onDone();
        });
    };

    const nextLabel = ctx.nextStage ? `Send to ${ctx.nextStage.name}` : 'Complete item';

    return (
        <div className="min-h-screen bg-neutral-50 p-4">
            <div className="max-w-xl mx-auto pt-8 space-y-4">
                <h1 className="text-2xl font-bold text-neutral-900">
                    {ctx.item.job_number}{ctx.item.item_number ? ` / ${ctx.item.item_number}` : ''}
                </h1>
                <p className="text-sm text-neutral-600">
                    All sub-items for <strong>{ctx.stage?.name ?? 'this stage'}</strong> are signed off. Ready to hand this item on.
                </p>

                <div className="flex flex-wrap gap-2">
                    {ctx.subItems.map((si) => (
                        <span
                            key={si.id}
                            className="px-3 py-1.5 rounded bg-green-700 text-white text-xs font-semibold"
                        >
                            ✓ {si.label}{si.name ? ` · ${si.name}` : ''}
                        </span>
                    ))}
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                        {error}
                    </div>
                )}

                <button
                    type="button"
                    onClick={doAdvance}
                    disabled={pendingKind !== null}
                    className="w-full py-5 rounded-lg bg-green-700 hover:bg-green-800 text-white text-base font-bold flex items-center justify-center gap-2 disabled:opacity-60"
                >
                    {pendingKind === 'advance' ? <Loader2 className="animate-spin" size={18} /> : <ArrowRight size={18} />}
                    → Complete &amp; {nextLabel}
                </button>

                <button
                    type="button"
                    onClick={doPause}
                    disabled={pendingKind !== null}
                    className="w-full py-3 rounded-lg bg-white border border-neutral-300 hover:bg-neutral-100 text-neutral-700 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                >
                    {pendingKind === 'pause' ? <Loader2 className="animate-spin" size={16} /> : <Pause size={16} />}
                    Stay on {ctx.stage?.name ?? 'this stage'} (pause)
                </button>
            </div>
        </div>
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
git add app/"(portal)"/shop-floor/check/\[itemId\]/CompletionScreen.tsx
git commit -m "feat(shop-floor): CompletionScreen — advance to next stage or pause"
```

---

### Task 10: `FlagProblemSheet` — bottom-sheet problem report

**Files:**
- Modify: `app/(portal)/shop-floor/check/[itemId]/FlagProblemSheet.tsx`

- [ ] **Step 1: Write the component**

Overwrite `app/(portal)/shop-floor/check/[itemId]/FlagProblemSheet.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { Loader2, X, AlertTriangle } from 'lucide-react';
import type { ShopFloorSubItem } from '@/lib/production/shop-floor-actions';
import { reportShopFloorProblem } from '@/lib/production/shop-floor-actions';

interface Props {
    subItem: ShopFloorSubItem;
    jobItemId: string;
    stageId: string | null;
    onClose: () => void;
    onSubmitted: () => void;
}

export function FlagProblemSheet({ subItem, jobItemId, stageId, onClose, onSubmitted }: Props) {
    const [notes, setNotes] = useState('');
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const submit = () => {
        const trimmed = notes.trim();
        if (!trimmed) {
            setError('Please describe the problem in a sentence or two.');
            return;
        }
        setError(null);
        startTransition(async () => {
            const res = await reportShopFloorProblem({
                subItemId: subItem.id,
                jobItemId,
                stageId,
                notes: trimmed,
            });
            if ('error' in res) {
                setError(res.error);
                return;
            }
            onSubmitted();
        });
    };

    return (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/60" onClick={onClose}>
            <div
                className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-5 space-y-4"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                        <AlertTriangle size={18} className="text-red-600" />
                        Report a problem
                    </h3>
                    <button onClick={onClose} className="p-1 text-neutral-500 hover:text-neutral-900" aria-label="Close">
                        <X size={20} />
                    </button>
                </div>

                <p className="text-xs text-neutral-500">
                    Flagging sub-item <strong>{subItem.label}{subItem.name ? ` · ${subItem.name}` : ''}</strong>.
                    The item will be paused and an admin will pick this up.
                </p>

                <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value.slice(0, 500))}
                    placeholder="What's wrong? e.g. material is the wrong colour, dimensions don't match, artwork file missing…"
                    rows={5}
                    className="w-full p-3 rounded-lg border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#4e7e8c]"
                />
                <div className="text-[10px] text-neutral-400 text-right">{notes.length}/500</div>

                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                        {error}
                    </div>
                )}

                <button
                    type="button"
                    onClick={submit}
                    disabled={pending}
                    className="w-full py-4 rounded-lg bg-red-600 hover:bg-red-700 text-white text-base font-bold flex items-center justify-center gap-2 disabled:opacity-60"
                >
                    {pending && <Loader2 className="animate-spin" size={16} />}
                    Flag & pause this item
                </button>
            </div>
        </div>
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
git add app/"(portal)"/shop-floor/check/\[itemId\]/FlagProblemSheet.tsx
git commit -m "feat(shop-floor): FlagProblemSheet — report-a-problem bottom sheet"
```

---

### Task 11: Make Shop Floor item cards navigate to the check route

**Files:**
- Modify: `app/(portal)/shop-floor/ShopFloorClient.tsx` (lines ~190–280)

- [ ] **Step 1: Wrap the card body in a `Link`**

Open `app/(portal)/shop-floor/ShopFloorClient.tsx`. Find the card map — the `jobs.map(item => (...))` block that currently renders `<div key={item.id} ...>`.

Add `import Link from 'next/link';` near the top of the file (if not already imported).

Replace the outer card `<div>` with a `Link` wrapper so tapping anywhere on the card that isn't an action button opens the check route. The action buttons (Start/Pause/Complete/Expand) stay functional — just add `onClick={e => e.stopPropagation()}` to each so the parent `Link` navigation is cancelled when a button is tapped.

Rough shape after the edit:

```tsx
{jobs.map(item => (
    <div
        key={item.id}
        className={`bg-white rounded-xl border-2 transition-all ${
            item.status === 'in_progress' ? 'border-neutral-200' : 'border-amber-300 opacity-80'
        }`}
    >
        <Link
            href={`/shop-floor/check/${item.id}`}
            className="block p-4"
            aria-label={`Open check for ${item.description}`}
        >
            {/* existing card header content — job_number, client_name, description, badges */}
        </Link>

        <div className="px-4 pb-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
            {/* existing Start / Pause / Complete → Next Stage / Expand buttons */}
        </div>

        {expandedItemId === item.id && (
            /* existing expanded detail block */
        )}
    </div>
))}
```

The literal edits:

- Split the existing `<div className="p-4">` into two siblings: a `<Link ... className="block p-4">` wrapping the header block (lines ~200–237), and a `<div className="px-4 pb-4 flex gap-2">` wrapping the action buttons (lines ~239–279).
- Keep every existing className on the buttons. Add `onClick={(e) => e.stopPropagation()}` to each `<button>` inside the action row — the wheel of buttons already calls `handleStart/handlePause/handleAdvance/handleExpand`; just wrap or extend each existing `onClick` so it still calls the handler *and* stops propagation:

```tsx
onClick={(e) => { e.stopPropagation(); handleStart(item.id); }}
```

Do this for Start, Pause, Complete → Next Stage, and the Expand chevron buttons.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Smoke — start the dev server and eyeball it**

```bash
npm run dev
```

Open `http://localhost:3000/shop-floor`, log in, pick a stage that has a demo item, and confirm:
- Tapping the card header navigates to `/shop-floor/check/<id>`
- Tapping Start / Pause / Complete / Expand still works and does NOT navigate

- [ ] **Step 4: Commit**

```bash
git add app/"(portal)"/shop-floor/ShopFloorClient.tsx
git commit -m "feat(shop-floor): make item cards navigate to guided check route"
```

---

### Task 12: End-to-end manual smoke against the demo seed

No code changes — this is the human verification gate before we push.

- [ ] **Step 1: Ensure the demo seed is loaded**

In the Supabase SQL editor:

```sql
-- Tear down any stale demo first
DELETE FROM public.deliveries
 WHERE org_id IN (SELECT id FROM public.orgs WHERE name LIKE '[DEMO]%');
DELETE FROM public.artwork_jobs
 WHERE org_id IN (SELECT id FROM public.orgs WHERE name LIKE '[DEMO]%');
DELETE FROM public.production_jobs
 WHERE org_id IN (SELECT id FROM public.orgs WHERE name LIKE '[DEMO]%');
DELETE FROM public.quotes
 WHERE org_id IN (SELECT id FROM public.orgs WHERE name LIKE '[DEMO]%');
DELETE FROM public.orgs WHERE name LIKE '[DEMO]%';
```

Then paste and run `supabase/seed_one_demo_job.sql`.

- [ ] **Step 2: Walk the flow on tablet-width (dev tools → ~820 px wide)**

On `http://localhost:3000/shop-floor`:
1. Select **CNC** in the stage tabs. The Test-O's fascia item should appear.
2. Tap the card. You should land on `/shop-floor/check/<itemId>`.
3. Verify header: job number, client name ("[DEMO] Test-O's"), stage chip ("CNC"), breadcrumb "Sub-item 1 of 1 — A · Fascia substrate", stepper on **1 · LOOK**.
4. Verify LOOK: spec rows show Material=ACM 3mm, Method, Finish, Size=2400 × 400 × 50 mm, Qty=1. Yellow "Notes for this stage" panel hidden (or empty) since the seed doesn't add CNC instructions.
5. Tap **Next — Measure →**. Enter measured width `2401`, height `400`. Tolerance pill turns green "✓ Within tolerance".
6. Tap **Next — Confirm →**. Recap shows ACM 3mm · RAL · 2400 × 400, Measured 2401 × 400 mm, within ±1 mm.
7. Tap **Production checked — sign off**. Spinner, then the completion screen loads with the green "Send to Vinyl" button (Vinyl is the next stage in the seed's stage_routing).
8. Tap **→ Complete & Send to Vinyl**. You land back on `/shop-floor`. Switch stage tab to **Vinyl**, confirm the fascia item is now there.

- [ ] **Step 3: Walk the Vinyl sub-item (letters)**

1. On the Vinyl tab, tap the fascia card. Verify breadcrumb shows "Sub-item 1 of 1 — B · TEST-O'S letters".
2. Spec: Material=Oracal 651 gold vinyl, Method=weeded stuck to face, Finish=gloss gold, Size=180 × 220 mm, Qty=7.
3. Walk LOOK → MEASURE (180, 220) → CONFIRM → sign off.
4. Completion screen says "Send to Painters" (the next stage after Vinyl in the routing).
5. Tap through, land on `/shop-floor`. Painters tab should now show the item.

- [ ] **Step 4: Walk the window vinyl item**

1. On Vinyl tab, the `Window manifestation (frosted)` item is there.
2. Open it, LOOK → MEASURE (3200, 1800) → CONFIRM → sign off.
3. Completion screen says "Send to Goods Out" (vinyl routes straight to goods-out for that item).
4. Tap advance. `/shop-floor/goods-out` should now list it. In `/admin/deliveries`, verify a new `scheduled` delivery auto-created for `[DEMO] Test-O's`.

- [ ] **Step 5: Smoke the problem-report flow**

On any item, tap "Report a problem", enter some notes, tap "Flag & pause this item". Confirm:
- You land back on `/shop-floor`.
- The item's status is pending (amber border) on the queue.
- `SELECT * FROM shop_floor_flags ORDER BY created_at DESC LIMIT 1` shows the row.

- [ ] **Step 6: Commit any final tweaks and push**

If any UX niggles surfaced during smoke (copy, sizing, color), fix them inline and commit with a message like `fix(shop-floor): copy + tolerance pill polish after real-device smoke`. Then:

```bash
git push origin master
```

---

## Self-review notes

- **Spec coverage:** every section of the spec (LOOK, MEASURE, CONFIRM, completion, report-a-problem, migration 042, reuse of `submitSubItemProduction` + `advanceItemToNextRoutedStage`, landscape responsiveness via `md:` breakpoints) has at least one task. ✓
- **No placeholders:** every code block is literal; no "TBD", "fill in", or "similar to Task N". ✓
- **Type consistency:** `ShopFloorCheckContext`, `ShopFloorSubItem`, and `StepName` referenced across tasks all agree with their definitions in Tasks 3 and 4. `submitSubItemProduction` + `checkDimensionTolerance` signatures are called out as verify-before-committing items in Tasks 7 and 8. ✓
