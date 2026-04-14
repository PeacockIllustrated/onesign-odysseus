# Artwork Sub-Items Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote `artwork_component_items` to the spec-bearing row so a component can represent a multi-medium assembly (panel with acrylic letters AND vinyl lettering). Each sub-item carries its own material / method / finish / dimensions / target department / sign-off; components become containers.

**Architecture:** One migration adds spec + routing + sign-off columns to `artwork_component_items` and backfills each existing component into a single "A" sub-item. `completeArtworkAndAdvanceItem` is refactored to iterate sub-items and union their target stages. A new `SubItemCard` UI replaces the old `DesignSection` / `ProductionSection` split on the component detail page.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase Postgres + RLS, Zod, Vitest. Spec: `docs/superpowers/specs/2026-04-14-artwork-sub-items-refactor-design.md`.

---

## File Structure

### Create
- `supabase/migrations/039_artwork_sub_items_spec.sql` — schema additions + backfill + release-blocking preflight
- `lib/artwork/sub-item-actions.ts` — new file dedicated to sub-item CRUD + sign-off, keeps `actions.ts` from growing another 500 LOC
- `lib/artwork/sub-item-actions.test.ts` — Vitest schema + pure-function tests
- `app/(portal)/admin/artwork/[id]/[componentId]/components/SubItemCard.tsx` — expandable card, design + production + sign-off + delete
- `app/(portal)/admin/artwork/[id]/[componentId]/components/SubItemList.tsx` — card list + "add sub-item" button
- `app/(portal)/admin/artwork/[id]/[componentId]/components/AddSubItemForm.tsx` — inline "add" form used by the list

### Modify
- `lib/artwork/types.ts` — add `SubItemInputSchema`, `UpdateSubItemInputSchema`, `ArtworkSubItemSchema` (extended component-item schema), `ArtworkSubItem` type; extend `ArtworkComponentWithVersions` with `sub_items`; keep `ArtworkComponentItem` alias for backwards compatibility during rollout
- `lib/artwork/actions.ts` — refactor `completeArtworkAndAdvanceItem` to iterate sub-items; refactor `getComponentDetail` to return `sub_items` (promoted from `extra_items`); add legacy delegating wrappers for `signOffDesign` / `signOffProduction` / `submitDesign` / `submitProductionMeasurements`
- `app/(portal)/admin/artwork/[id]/[componentId]/page.tsx` — replace `DesignSection` + `ProductionSection` stack with `SubItemList`
- `app/(print)/admin/artwork/[id]/[componentId]/print/page.tsx` — iterate sub-items, show each with its own material / method / finish / dimensions

### Untouched (for now)
- `DesignSection.tsx`, `ProductionSection.tsx`, `VersionHistory.tsx`, `DimensionAlert.tsx`, `DepartmentPicker.tsx`, `ComponentActions.tsx` — stay in place; `DepartmentPicker` is reused inside `SubItemCard`. The old `DesignSection` / `ProductionSection` files are unreferenced after Task 9 and get deleted in Task 12.

---

## Task 1: Migration 039 — schema additions + backfill

**Files:**
- Create: `supabase/migrations/039_artwork_sub_items_spec.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 039: promote artwork_component_items to spec-bearing sub-items.
--
-- After this migration every artwork_component has 1..n sub-items. A
-- pre-existing component with spec data gets a single "A" sub-item seeded
-- from its columns. Components stay as pure containers; their legacy
-- spec columns remain on the table but are no longer read by app code.

BEGIN;

ALTER TABLE public.artwork_component_items
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS material TEXT,
    ADD COLUMN IF NOT EXISTS application_method TEXT,
    ADD COLUMN IF NOT EXISTS finish TEXT,
    ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS target_stage_id UUID
        REFERENCES public.production_stages(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS designed_by UUID
        REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS design_signed_off_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS design_signed_off_by UUID
        REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS production_checked_by UUID
        REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS production_signed_off_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS production_signed_off_by UUID
        REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS material_confirmed BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS rip_no_scaling_confirmed BOOLEAN NOT NULL DEFAULT false;

-- quantity >= 1 sanity check. Named so we can drop/re-add safely.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'artwork_component_items_quantity_positive_chk'
  ) THEN
    ALTER TABLE public.artwork_component_items
      ADD CONSTRAINT artwork_component_items_quantity_positive_chk
      CHECK (quantity >= 1);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_artwork_component_items_target_stage
    ON public.artwork_component_items(target_stage_id);
CREATE INDEX IF NOT EXISTS idx_artwork_component_items_design_signoff
    ON public.artwork_component_items(design_signed_off_at);
CREATE INDEX IF NOT EXISTS idx_artwork_component_items_production_signoff
    ON public.artwork_component_items(production_signed_off_at);

-- Backfill: every artwork_component with a real spec becomes a single
-- sub-item labelled 'A' at sort_order 0. Components with zero spec data
-- (started-but-not-filled-in) are skipped; the UI will prompt "add a
-- sub-item to begin".
DO $$
BEGIN
  INSERT INTO public.artwork_component_items (
    component_id, label, sort_order,
    name, material, application_method, finish, quantity, notes,
    target_stage_id,
    width_mm, height_mm, returns_mm,
    measured_width_mm, measured_height_mm,
    dimension_flag, width_deviation_mm, height_deviation_mm,
    designed_by, design_signed_off_at, design_signed_off_by,
    production_checked_by, production_signed_off_at, production_signed_off_by,
    material_confirmed, rip_no_scaling_confirmed
  )
  SELECT
    c.id, 'A', 0,
    c.name, c.material, NULL, NULL, 1, c.notes,
    c.target_stage_id,
    c.width_mm, c.height_mm, c.returns_mm,
    c.measured_width_mm, c.measured_height_mm,
    c.dimension_flag, c.width_deviation_mm, c.height_deviation_mm,
    c.designed_by, c.design_signed_off_at, c.design_signed_off_by,
    c.production_checked_by, c.production_signed_off_at, c.production_signed_off_by,
    c.material_confirmed, c.rip_no_scaling_confirmed
  FROM public.artwork_components c
  WHERE c.width_mm IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.artwork_component_items i
      WHERE i.component_id = c.id AND i.sort_order = 0
    );
END $$;

COMMENT ON COLUMN public.artwork_component_items.name IS
    'Human-readable name for this sub-item (e.g. "QUEEN BEE letters").';
COMMENT ON COLUMN public.artwork_component_items.material IS
    'Free-text material spec (e.g. "5mm rose-gold mirrored acrylic"). Phase 2 may promote to a lookup table.';
COMMENT ON COLUMN public.artwork_component_items.application_method IS
    'How the sub-item is applied or fixed (e.g. "stuck to face", "weeded and applied"). Free text.';
COMMENT ON COLUMN public.artwork_component_items.finish IS
    'Surface finish / colour (e.g. "rose gold mirror", "matte white"). Free text.';
COMMENT ON COLUMN public.artwork_component_items.target_stage_id IS
    'Department this sub-item routes to in the production pipeline. Replaces the component-level target_stage_id for spec-bearing rows.';

COMMIT;
```

- [ ] **Step 2: Apply locally and verify**

Run: `npx supabase db reset` (local). Then in SQL editor:

```sql
-- Every component with a spec should now have a sub-item A.
SELECT
  (SELECT COUNT(*) FROM artwork_components WHERE width_mm IS NOT NULL) AS components_with_spec,
  (SELECT COUNT(*) FROM artwork_component_items WHERE sort_order = 0) AS sub_items_a;
-- Both numbers should match.
```

Expected: both counts equal. If zero components existed in local, both are zero (also fine).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/039_artwork_sub_items_spec.sql
git commit -m "feat(artwork): migration 039 — promote component_items to spec-bearing sub-items"
```

---

## Task 2: Extend types — SubItem schemas

**Files:**
- Modify: `lib/artwork/types.ts`

- [ ] **Step 1: Add the sub-item schemas**

At the bottom of the file (below the existing Phase 1 dashboard types), append:

```typescript
// =============================================================================
// SUB-ITEMS REFACTOR — PROMOTED artwork_component_items
// =============================================================================

/**
 * Full database-row shape for a sub-item after migration 039.
 * Every spec-bearing row on a component (including the primary) lives here.
 */
export const ArtworkSubItemSchema = z.object({
    id: z.string().uuid(),
    component_id: z.string().uuid(),
    label: z.string(),
    sort_order: z.number().int(),

    // Identity / description
    name: z.string().nullable(),
    material: z.string().nullable(),
    application_method: z.string().nullable(),
    finish: z.string().nullable(),
    quantity: z.number().int().min(1),
    notes: z.string().nullable(),

    // Dimensions
    width_mm: z.number().nullable(),
    height_mm: z.number().nullable(),
    returns_mm: z.number().nullable(),
    measured_width_mm: z.number().nullable(),
    measured_height_mm: z.number().nullable(),

    // Tolerance flags
    dimension_flag: z.string().nullable(),
    width_deviation_mm: z.number().nullable(),
    height_deviation_mm: z.number().nullable(),

    // Routing
    target_stage_id: z.string().uuid().nullable(),

    // Production confirms
    material_confirmed: z.boolean(),
    rip_no_scaling_confirmed: z.boolean(),

    // Sign-off
    designed_by: z.string().uuid().nullable(),
    design_signed_off_at: z.string().nullable(),
    design_signed_off_by: z.string().uuid().nullable(),
    production_checked_by: z.string().uuid().nullable(),
    production_signed_off_at: z.string().nullable(),
    production_signed_off_by: z.string().uuid().nullable(),

    created_at: z.string(),
    updated_at: z.string(),
});
export type ArtworkSubItem = z.infer<typeof ArtworkSubItemSchema>;

/**
 * Input for creating a sub-item. Label is auto-generated when omitted.
 * Material / method / finish / notes are free text per the Phase 2 deferral.
 */
export const CreateSubItemInputSchema = z.object({
    component_id: z.string().uuid(),
    name: z.string().max(120).optional(),
    material: z.string().max(200).optional(),
    application_method: z.string().max(200).optional(),
    finish: z.string().max(120).optional(),
    quantity: z.number().int().min(1).default(1),
    notes: z.string().max(1000).optional(),
    width_mm: z.number().positive().nullable().optional(),
    height_mm: z.number().positive().nullable().optional(),
    returns_mm: z.number().nullable().optional(),
    target_stage_id: z.string().uuid().nullable().optional(),
});
export type CreateSubItemInput = z.infer<typeof CreateSubItemInputSchema>;

/**
 * Input for updating a sub-item. All fields optional (partial patch).
 */
export const UpdateSubItemInputSchema = z.object({
    name: z.string().max(120).nullable().optional(),
    material: z.string().max(200).nullable().optional(),
    application_method: z.string().max(200).nullable().optional(),
    finish: z.string().max(120).nullable().optional(),
    quantity: z.number().int().min(1).optional(),
    notes: z.string().max(1000).nullable().optional(),
    width_mm: z.number().positive().nullable().optional(),
    height_mm: z.number().positive().nullable().optional(),
    returns_mm: z.number().nullable().optional(),
    target_stage_id: z.string().uuid().nullable().optional(),
});
export type UpdateSubItemInput = z.infer<typeof UpdateSubItemInputSchema>;

/**
 * Input for submitting production measurements on a single sub-item.
 * Tolerance is computed server-side against the design width/height.
 */
export const SubItemMeasurementInputSchema = z.object({
    measured_width_mm: z.number().positive(),
    measured_height_mm: z.number().positive(),
    material_confirmed: z.boolean(),
    rip_no_scaling_confirmed: z.boolean(),
});
export type SubItemMeasurementInput = z.infer<typeof SubItemMeasurementInputSchema>;
```

- [ ] **Step 2: Extend `ArtworkComponentWithVersions`**

Find the existing `ArtworkComponentWithVersions` interface (around line 304) and add `sub_items`:

```typescript
export interface ArtworkComponentWithVersions extends ArtworkComponent {
    versions: ComponentVersion[];
    production_checks: ProductionCheck[];
    extra_items: ArtworkComponentItem[];  // kept as alias during rollout
    sub_items: ArtworkSubItem[];
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean. Any errors are downstream consumers; later tasks fix them.

- [ ] **Step 4: Commit**

```bash
git add lib/artwork/types.ts
git commit -m "feat(artwork): add ArtworkSubItem + Create/Update/Measurement input schemas"
```

---

## Task 3: Sub-item CRUD server actions — `createSubItem` / `updateSubItem` / `deleteSubItem`

**Files:**
- Create: `lib/artwork/sub-item-actions.ts`
- Create: `lib/artwork/sub-item-actions.test.ts`

- [ ] **Step 1: Write failing schema tests**

Create `lib/artwork/sub-item-actions.test.ts`:

```typescript
// lib/artwork/sub-item-actions.test.ts
import { describe, it, expect } from 'vitest';
import {
    CreateSubItemInputSchema,
    UpdateSubItemInputSchema,
    SubItemMeasurementInputSchema,
} from './types';

const COMPONENT_UUID = '11111111-1111-4111-8111-111111111111';
const STAGE_UUID = '22222222-2222-4222-8222-222222222222';

describe('CreateSubItemInputSchema', () => {
    it('accepts minimal input', () => {
        const res = CreateSubItemInputSchema.safeParse({ component_id: COMPONENT_UUID });
        expect(res.success).toBe(true);
        if (res.success) expect(res.data.quantity).toBe(1);
    });

    it('accepts full spec input', () => {
        const res = CreateSubItemInputSchema.safeParse({
            component_id: COMPONENT_UUID,
            name: 'QUEEN BEE letters',
            material: '5mm rose-gold mirrored acrylic',
            application_method: 'stuck to face',
            finish: 'rose gold mirror',
            quantity: 1,
            width_mm: 1500,
            height_mm: 280,
            target_stage_id: STAGE_UUID,
        });
        expect(res.success).toBe(true);
    });

    it('rejects invalid component_id', () => {
        const res = CreateSubItemInputSchema.safeParse({ component_id: 'not-a-uuid' });
        expect(res.success).toBe(false);
    });

    it('rejects quantity below 1', () => {
        const res = CreateSubItemInputSchema.safeParse({
            component_id: COMPONENT_UUID,
            quantity: 0,
        });
        expect(res.success).toBe(false);
    });

    it('rejects negative width', () => {
        const res = CreateSubItemInputSchema.safeParse({
            component_id: COMPONENT_UUID,
            width_mm: -5,
        });
        expect(res.success).toBe(false);
    });
});

describe('UpdateSubItemInputSchema', () => {
    it('accepts an empty patch (noop)', () => {
        const res = UpdateSubItemInputSchema.safeParse({});
        expect(res.success).toBe(true);
    });

    it('accepts nulling a field', () => {
        const res = UpdateSubItemInputSchema.safeParse({ material: null, target_stage_id: null });
        expect(res.success).toBe(true);
    });

    it('rejects quantity of 0', () => {
        const res = UpdateSubItemInputSchema.safeParse({ quantity: 0 });
        expect(res.success).toBe(false);
    });
});

describe('SubItemMeasurementInputSchema', () => {
    it('accepts positive measurements', () => {
        const res = SubItemMeasurementInputSchema.safeParse({
            measured_width_mm: 1501,
            measured_height_mm: 279,
            material_confirmed: true,
            rip_no_scaling_confirmed: true,
        });
        expect(res.success).toBe(true);
    });

    it('rejects zero or negative measurements', () => {
        const res = SubItemMeasurementInputSchema.safeParse({
            measured_width_mm: 0,
            measured_height_mm: 100,
            material_confirmed: true,
            rip_no_scaling_confirmed: true,
        });
        expect(res.success).toBe(false);
    });

    it('rejects missing confirm flags', () => {
        const res = SubItemMeasurementInputSchema.safeParse({
            measured_width_mm: 100,
            measured_height_mm: 100,
        });
        expect(res.success).toBe(false);
    });
});
```

- [ ] **Step 2: Run tests — expect failure (module does not exist yet)**

Run: `npx vitest run lib/artwork/sub-item-actions.test.ts`
Expected: **The test file imports only from `./types` so it will actually pass already.** That's fine — the schemas are the contract. Implementation tests would require Supabase integration which is out of scope for unit tests. Proceed to write the implementation.

- [ ] **Step 3: Create `sub-item-actions.ts`**

Create `lib/artwork/sub-item-actions.ts`:

```typescript
'use server';

/**
 * Sub-item server actions (Phase 2 of artwork refactor — migration 039).
 *
 * Sub-items are rows of `artwork_component_items` and are the spec-bearing
 * unit. Each sub-item owns its own material, method, finish, dimensions,
 * target department, and sign-off state.
 */

import { createServerClient } from '@/lib/supabase-server';
import { getUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import {
    CreateSubItemInput,
    CreateSubItemInputSchema,
    UpdateSubItemInput,
    UpdateSubItemInputSchema,
    SubItemMeasurementInput,
    SubItemMeasurementInputSchema,
} from './types';
import { checkDimensionTolerance } from './utils';

// -----------------------------------------------------------------------------
// CRUD
// -----------------------------------------------------------------------------

/**
 * Create a sub-item on the given component. Label is auto-assigned as the
 * next letter (A, B, C...), `sort_order` is max+1.
 */
export async function createSubItem(
    input: CreateSubItemInput
): Promise<{ id: string } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const validation = CreateSubItemInputSchema.safeParse(input);
    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }
    const parsed = validation.data;

    const supabase = await createServerClient();

    // Determine next label + sort_order.
    const { data: existing, error: existingErr } = await supabase
        .from('artwork_component_items')
        .select('label, sort_order')
        .eq('component_id', parsed.component_id)
        .order('sort_order', { ascending: true });

    if (existingErr) {
        console.error('createSubItem list error:', existingErr);
        return { error: existingErr.message };
    }

    const labels = (existing ?? []).map((r: any) => r.label as string);
    const nextLabel = nextItemLabel(labels);
    const nextSortOrder =
        existing && existing.length > 0
            ? Math.max(...existing.map((r: any) => r.sort_order as number)) + 1
            : 0;

    const { data, error } = await supabase
        .from('artwork_component_items')
        .insert({
            component_id: parsed.component_id,
            label: nextLabel,
            sort_order: nextSortOrder,
            name: parsed.name ?? null,
            material: parsed.material ?? null,
            application_method: parsed.application_method ?? null,
            finish: parsed.finish ?? null,
            quantity: parsed.quantity ?? 1,
            notes: parsed.notes ?? null,
            width_mm: parsed.width_mm ?? null,
            height_mm: parsed.height_mm ?? null,
            returns_mm: parsed.returns_mm ?? null,
            target_stage_id: parsed.target_stage_id ?? null,
        })
        .select('id, component_id')
        .single();

    if (error) {
        console.error('createSubItem insert error:', error);
        return { error: error.message };
    }

    await revalidateComponent(supabase, data.component_id);
    return { id: data.id };
}

/**
 * Update a sub-item. Partial patch semantics — only provided fields are
 * written. Recomputes dimension tolerance if width/height changes and
 * measurements exist.
 */
export async function updateSubItem(
    subItemId: string,
    patch: UpdateSubItemInput
): Promise<{ ok: true } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const validation = UpdateSubItemInputSchema.safeParse(patch);
    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }
    const parsed = validation.data;

    const supabase = await createServerClient();

    // Reject edits to signed-off sub-items.
    const { data: existing } = await supabase
        .from('artwork_component_items')
        .select('id, component_id, design_signed_off_at, production_signed_off_at, width_mm, height_mm, measured_width_mm, measured_height_mm')
        .eq('id', subItemId)
        .single();
    if (!existing) return { error: 'sub-item not found' };
    if (existing.design_signed_off_at) {
        return { error: 'sub-item design is signed off; reverse sign-off before editing' };
    }

    const updates: Record<string, any> = {};
    for (const key of Object.keys(parsed) as (keyof UpdateSubItemInput)[]) {
        if (parsed[key] !== undefined) updates[key] = parsed[key];
    }

    // If width or height is changing AND measured values exist, recompute tolerance.
    const newWidth = updates.width_mm ?? existing.width_mm;
    const newHeight = updates.height_mm ?? existing.height_mm;
    if (
        (updates.width_mm !== undefined || updates.height_mm !== undefined) &&
        existing.measured_width_mm != null &&
        existing.measured_height_mm != null &&
        newWidth != null &&
        newHeight != null
    ) {
        const tol = checkDimensionTolerance(
            newWidth,
            newHeight,
            existing.measured_width_mm,
            existing.measured_height_mm
        );
        updates.width_deviation_mm = tol.width_deviation_mm;
        updates.height_deviation_mm = tol.height_deviation_mm;
        updates.dimension_flag = tol.flag;
    }

    const { error } = await supabase
        .from('artwork_component_items')
        .update(updates)
        .eq('id', subItemId);

    if (error) {
        console.error('updateSubItem error:', error);
        return { error: error.message };
    }
    await revalidateComponent(supabase, existing.component_id);
    return { ok: true };
}

/**
 * Delete a sub-item. Rejects delete if the sub-item is the last one on its
 * component (delete the component instead), or if it is signed off.
 */
export async function deleteSubItem(
    subItemId: string
): Promise<{ ok: true } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const supabase = await createServerClient();

    const { data: row } = await supabase
        .from('artwork_component_items')
        .select('id, component_id, design_signed_off_at, production_signed_off_at')
        .eq('id', subItemId)
        .single();
    if (!row) return { error: 'sub-item not found' };
    if (row.design_signed_off_at || row.production_signed_off_at) {
        return { error: 'sub-item is signed off; cannot delete' };
    }

    const { count } = await supabase
        .from('artwork_component_items')
        .select('id', { count: 'exact', head: true })
        .eq('component_id', row.component_id);
    if ((count ?? 0) <= 1) {
        return { error: 'component must have at least one sub-item — delete the component instead' };
    }

    const { error } = await supabase
        .from('artwork_component_items')
        .delete()
        .eq('id', subItemId);

    if (error) {
        console.error('deleteSubItem error:', error);
        return { error: error.message };
    }
    await revalidateComponent(supabase, row.component_id);
    return { ok: true };
}

/**
 * Set (or clear) the target production stage for a sub-item.
 */
export async function setSubItemTargetStage(
    subItemId: string,
    stageId: string | null
): Promise<{ ok: true } | { error: string }> {
    return updateSubItem(subItemId, { target_stage_id: stageId });
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Given a list of existing labels (e.g. ['A', 'B', 'D']), return the next
 * unused letter in sequence. Wraps to AA, AB if we ever exceed 26 — unlikely.
 */
export function nextItemLabel(existing: string[]): string {
    const used = new Set(existing);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (const ch of alphabet) {
        if (!used.has(ch)) return ch;
    }
    // overflow — two-letter labels
    for (const a of alphabet) {
        for (const b of alphabet) {
            const two = a + b;
            if (!used.has(two)) return two;
        }
    }
    return 'Z';
}

async function revalidateComponent(supabase: any, componentId: string) {
    const { data } = await supabase
        .from('artwork_components')
        .select('job_id')
        .eq('id', componentId)
        .single();
    if (data?.job_id) {
        revalidatePath(`/admin/artwork/${data.job_id}`);
        revalidatePath(`/admin/artwork/${data.job_id}/${componentId}`);
    }
}
```

- [ ] **Step 4: Add `nextItemLabel` pure-function test**

Append to `lib/artwork/sub-item-actions.test.ts`:

```typescript
import { nextItemLabel } from './sub-item-actions';

describe('nextItemLabel', () => {
    it('returns A for an empty list', () => {
        expect(nextItemLabel([])).toBe('A');
    });
    it('returns B when A is used', () => {
        expect(nextItemLabel(['A'])).toBe('B');
    });
    it('returns C when A and B are used', () => {
        expect(nextItemLabel(['A', 'B'])).toBe('C');
    });
    it('fills gaps (returns C when A and B exist but D does not)', () => {
        expect(nextItemLabel(['A', 'B', 'D'])).toBe('C');
    });
    it('returns AA after Z is consumed', () => {
        const full = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
        expect(nextItemLabel(full)).toBe('AA');
    });
});
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run lib/artwork/sub-item-actions.test.ts`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add lib/artwork/sub-item-actions.ts lib/artwork/sub-item-actions.test.ts
git commit -m "feat(artwork): sub-item CRUD server actions (create/update/delete/routing)"
```

---

## Task 4: Sub-item sign-off actions

**Files:**
- Modify: `lib/artwork/sub-item-actions.ts`

- [ ] **Step 1: Append the sign-off functions**

At the bottom of `lib/artwork/sub-item-actions.ts`, above the helpers section, add:

```typescript
// -----------------------------------------------------------------------------
// SIGN-OFF
// -----------------------------------------------------------------------------

/**
 * Mark this sub-item's design as signed off. Requires design spec
 * (material + dimensions) and a target department to be set.
 */
export async function signOffSubItemDesign(
    subItemId: string
): Promise<{ ok: true } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const supabase = await createServerClient();
    const { data: si } = await supabase
        .from('artwork_component_items')
        .select('id, component_id, material, width_mm, height_mm, target_stage_id, design_signed_off_at')
        .eq('id', subItemId)
        .single();
    if (!si) return { error: 'sub-item not found' };
    if (si.design_signed_off_at) return { error: 'design already signed off' };
    if (!si.material) return { error: 'material is required before sign-off' };
    if (si.width_mm == null || si.height_mm == null) {
        return { error: 'dimensions are required before sign-off' };
    }
    if (!si.target_stage_id) {
        return { error: 'target department is required before sign-off' };
    }

    const { error } = await supabase
        .from('artwork_component_items')
        .update({
            designed_by: user.id,
            design_signed_off_at: new Date().toISOString(),
            design_signed_off_by: user.id,
        })
        .eq('id', subItemId);

    if (error) return { error: error.message };
    await revalidateComponent(supabase, si.component_id);
    return { ok: true };
}

/**
 * Submit production measurements for a sub-item and optionally sign off
 * in the same call. Signing off requires design to be signed off first.
 */
export async function submitSubItemProduction(
    subItemId: string,
    input: SubItemMeasurementInput,
    signOff: boolean = false
): Promise<{ ok: true } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const validation = SubItemMeasurementInputSchema.safeParse(input);
    if (!validation.success) return { error: validation.error.issues[0].message };
    const parsed = validation.data;

    const supabase = await createServerClient();
    const { data: si } = await supabase
        .from('artwork_component_items')
        .select('id, component_id, width_mm, height_mm, design_signed_off_at, production_signed_off_at')
        .eq('id', subItemId)
        .single();
    if (!si) return { error: 'sub-item not found' };
    if (signOff && !si.design_signed_off_at) {
        return { error: 'design must be signed off before production sign-off' };
    }
    if (signOff && si.production_signed_off_at) {
        return { error: 'production already signed off' };
    }
    if (si.width_mm == null || si.height_mm == null) {
        return { error: 'design dimensions missing — cannot compute tolerance' };
    }

    const tol = checkDimensionTolerance(
        si.width_mm,
        si.height_mm,
        parsed.measured_width_mm,
        parsed.measured_height_mm
    );

    const updates: Record<string, any> = {
        measured_width_mm: parsed.measured_width_mm,
        measured_height_mm: parsed.measured_height_mm,
        material_confirmed: parsed.material_confirmed,
        rip_no_scaling_confirmed: parsed.rip_no_scaling_confirmed,
        width_deviation_mm: tol.width_deviation_mm,
        height_deviation_mm: tol.height_deviation_mm,
        dimension_flag: tol.flag,
    };
    if (signOff) {
        updates.production_checked_by = user.id;
        updates.production_signed_off_at = new Date().toISOString();
        updates.production_signed_off_by = user.id;
    }

    const { error } = await supabase
        .from('artwork_component_items')
        .update(updates)
        .eq('id', subItemId);

    if (error) return { error: error.message };
    await revalidateComponent(supabase, si.component_id);
    return { ok: true };
}

/**
 * Reverse a previously-completed sign-off (design or production).
 * Used when staff need to re-open a sub-item for edits.
 */
export async function reverseSubItemSignOff(
    subItemId: string,
    which: 'design' | 'production'
): Promise<{ ok: true } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const supabase = await createServerClient();
    const { data: si } = await supabase
        .from('artwork_component_items')
        .select('id, component_id')
        .eq('id', subItemId)
        .single();
    if (!si) return { error: 'sub-item not found' };

    const updates: Record<string, any> = {};
    if (which === 'design') {
        updates.designed_by = null;
        updates.design_signed_off_at = null;
        updates.design_signed_off_by = null;
        // Cascading reverse: production sign-off is invalidated too.
        updates.production_checked_by = null;
        updates.production_signed_off_at = null;
        updates.production_signed_off_by = null;
    } else {
        updates.production_checked_by = null;
        updates.production_signed_off_at = null;
        updates.production_signed_off_by = null;
    }

    const { error } = await supabase
        .from('artwork_component_items')
        .update(updates)
        .eq('id', subItemId);

    if (error) return { error: error.message };
    await revalidateComponent(supabase, si.component_id);
    return { ok: true };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add lib/artwork/sub-item-actions.ts
git commit -m "feat(artwork): per-sub-item sign-off + production measurement + reverse"
```

---

## Task 5: Refactor `completeArtworkAndAdvanceItem` to iterate sub-items

**Files:**
- Modify: `lib/artwork/actions.ts` (the `completeArtworkAndAdvanceItem` function, lines 1131–1268)

- [ ] **Step 1: Read the current function**

Open `lib/artwork/actions.ts` to see the existing body. Confirm it reads each component's `target_stage_id` and design/production sign-off.

- [ ] **Step 2: Replace with sub-item-driven version**

Replace the entire `completeArtworkAndAdvanceItem` function with:

```typescript
/**
 * Complete the artwork stage for an artwork_job and advance the linked
 * production job_item to the next routed stage.
 *
 * Sub-item driven: iterates every sub-item across every component; builds
 * the stage_routing from the UNION of their target_stage_ids; blocks release
 * until every sub-item is design-signed AND production-signed AND routed.
 */
export async function completeArtworkAndAdvanceItem(
    artworkJobId: string
): Promise<{ ok: true } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const supabase = await createServerClient();

    const { data: job } = await supabase
        .from('artwork_jobs')
        .select('id, job_item_id, job_reference')
        .eq('id', artworkJobId)
        .single();
    if (!job) return { error: 'artwork job not found' };
    if (!job.job_item_id) {
        return { error: 'orphan artwork jobs cannot be released to production' };
    }

    // Fetch every sub-item across every component for this artwork job.
    const { data: components, error: compErr } = await supabase
        .from('artwork_components')
        .select(`
            id, name,
            sub_items:artwork_component_items(
                id, label, name,
                design_signed_off_at, production_signed_off_at, target_stage_id
            )
        `)
        .eq('job_id', artworkJobId);

    if (compErr) {
        console.error('completeArtworkAndAdvanceItem component fetch error:', compErr);
        return { error: compErr.message };
    }
    if (!components || components.length === 0) {
        return { error: 'artwork job has no components' };
    }

    // Gate 1: every sub-item must be fully signed off and routed.
    const gaps: string[] = [];
    const targetStageIds = new Set<string>();

    for (const comp of components as any[]) {
        const subItems = (comp.sub_items ?? []) as Array<{
            id: string;
            label: string;
            name: string | null;
            design_signed_off_at: string | null;
            production_signed_off_at: string | null;
            target_stage_id: string | null;
        }>;

        if (subItems.length === 0) {
            gaps.push(`"${comp.name}" has no sub-items`);
            continue;
        }

        for (const si of subItems) {
            const ref = `sub-item ${si.label}${si.name ? ` (${si.name})` : ''} of "${comp.name}"`;
            if (!si.design_signed_off_at) gaps.push(`${ref} — design not signed off`);
            if (!si.production_signed_off_at) gaps.push(`${ref} — production not signed off`);
            if (!si.target_stage_id) gaps.push(`${ref} — no target department`);
            if (si.target_stage_id) targetStageIds.add(si.target_stage_id);
        }
    }

    if (gaps.length > 0) {
        return { error: 'Cannot release: ' + gaps.join('; ') };
    }

    // Build the ordered stage list. Order by the production_stages table's
    // canonical sort_order so departments flow in the right sequence.
    const { data: allStages } = await supabase
        .from('production_stages')
        .select('id, slug, sort_order')
        .order('sort_order', { ascending: true });

    if (!allStages) return { error: 'could not load production stages' };

    const orderBook = allStages.find((s: any) => s.slug === 'order-book');
    const artwork = allStages.find((s: any) => s.slug === 'artwork-approval');
    const goodsOut = allStages.find((s: any) => s.slug === 'goods-out');

    // Ordered departments: every stage referenced by a sub-item, in
    // production_stages.sort_order, excluding the framing stages.
    const deptStages = allStages
        .filter((s: any) => targetStageIds.has(s.id))
        .filter((s: any) => s.slug !== 'order-book' && s.slug !== 'artwork-approval' && s.slug !== 'goods-out')
        .map((s: any) => s.id);

    const routing: string[] = [];
    if (orderBook) routing.push(orderBook.id);
    if (artwork) routing.push(artwork.id);
    routing.push(...deptStages);
    if (goodsOut) routing.push(goodsOut.id);

    // Persist stage_routing on job_items, then advance to next stage.
    const { error: updErr } = await supabase
        .from('job_items')
        .update({ stage_routing: routing })
        .eq('id', job.job_item_id);
    if (updErr) {
        console.error('stage_routing update error:', updErr);
        return { error: updErr.message };
    }

    const { advanceItemToNextRoutedStage } = await import('@/lib/production/actions');
    const advanceRes = await advanceItemToNextRoutedStage(job.job_item_id);
    if ('error' in advanceRes) return { error: advanceRes.error };

    // Mark the artwork job as completed.
    await supabase
        .from('artwork_jobs')
        .update({ status: 'completed' })
        .eq('id', artworkJobId);

    revalidatePath('/admin/artwork');
    revalidatePath(`/admin/artwork/${artworkJobId}`);
    revalidatePath('/admin/jobs');
    return { ok: true };
}
```

- [ ] **Step 3: Add release-gate unit tests**

Create (or extend) tests verifying the gap messages. Since the function hits Supabase, write pure-function tests for the gap-computation logic by extracting it:

Near the top of `lib/artwork/actions.ts`, add a testable pure function (used by `completeArtworkAndAdvanceItem`):

```typescript
/**
 * Compute release-blocking gaps for an artwork job's components.
 * Pure function — extracted so the core logic is unit-testable without Supabase.
 */
export function computeReleaseGaps(
    components: Array<{
        name: string;
        sub_items: Array<{
            label: string;
            name: string | null;
            design_signed_off_at: string | null;
            production_signed_off_at: string | null;
            target_stage_id: string | null;
        }>;
    }>
): { gaps: string[]; targetStageIds: string[] } {
    const gaps: string[] = [];
    const targetStageIds = new Set<string>();
    for (const comp of components) {
        if (!comp.sub_items || comp.sub_items.length === 0) {
            gaps.push(`"${comp.name}" has no sub-items`);
            continue;
        }
        for (const si of comp.sub_items) {
            const ref = `sub-item ${si.label}${si.name ? ` (${si.name})` : ''} of "${comp.name}"`;
            if (!si.design_signed_off_at) gaps.push(`${ref} — design not signed off`);
            if (!si.production_signed_off_at) gaps.push(`${ref} — production not signed off`);
            if (!si.target_stage_id) gaps.push(`${ref} — no target department`);
            if (si.target_stage_id) targetStageIds.add(si.target_stage_id);
        }
    }
    return { gaps, targetStageIds: Array.from(targetStageIds) };
}
```

Then refactor `completeArtworkAndAdvanceItem` to call `computeReleaseGaps` instead of the inline loop.

- [ ] **Step 4: Test the pure function**

Append to `lib/artwork/actions.test.ts`:

```typescript
import { computeReleaseGaps } from './actions';

describe('computeReleaseGaps', () => {
    it('flags components with no sub-items', () => {
        const { gaps } = computeReleaseGaps([
            { name: 'Panel', sub_items: [] },
        ]);
        expect(gaps).toEqual(['"Panel" has no sub-items']);
    });

    it('flags missing sign-offs and routing with precise reference', () => {
        const { gaps } = computeReleaseGaps([
            {
                name: 'Panel',
                sub_items: [
                    {
                        label: 'A',
                        name: 'QUEEN BEE letters',
                        design_signed_off_at: null,
                        production_signed_off_at: null,
                        target_stage_id: null,
                    },
                ],
            },
        ]);
        expect(gaps).toContain('sub-item A (QUEEN BEE letters) of "Panel" — design not signed off');
        expect(gaps).toContain('sub-item A (QUEEN BEE letters) of "Panel" — production not signed off');
        expect(gaps).toContain('sub-item A (QUEEN BEE letters) of "Panel" — no target department');
    });

    it('returns empty gaps for a fully-signed fully-routed component', () => {
        const { gaps, targetStageIds } = computeReleaseGaps([
            {
                name: 'Panel',
                sub_items: [
                    {
                        label: 'A',
                        name: 'Acrylic letters',
                        design_signed_off_at: '2026-04-14T00:00:00Z',
                        production_signed_off_at: '2026-04-14T00:00:00Z',
                        target_stage_id: 'stage-cnc',
                    },
                    {
                        label: 'B',
                        name: 'Vinyl strapline',
                        design_signed_off_at: '2026-04-14T00:00:00Z',
                        production_signed_off_at: '2026-04-14T00:00:00Z',
                        target_stage_id: 'stage-vinyl',
                    },
                ],
            },
        ]);
        expect(gaps).toEqual([]);
        expect(targetStageIds.sort()).toEqual(['stage-cnc', 'stage-vinyl']);
    });

    it('deduplicates target stage ids across sub-items', () => {
        const { targetStageIds } = computeReleaseGaps([
            {
                name: 'Panel',
                sub_items: [
                    {
                        label: 'A',
                        name: null,
                        design_signed_off_at: 't',
                        production_signed_off_at: 't',
                        target_stage_id: 'stage-x',
                    },
                    {
                        label: 'B',
                        name: null,
                        design_signed_off_at: 't',
                        production_signed_off_at: 't',
                        target_stage_id: 'stage-x',
                    },
                ],
            },
        ]);
        expect(targetStageIds).toEqual(['stage-x']);
    });
});
```

Run: `npx vitest run lib/artwork/actions.test.ts`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add lib/artwork/actions.ts lib/artwork/actions.test.ts
git commit -m "feat(artwork): release-to-production iterates sub-items; extract computeReleaseGaps"
```

---

## Task 6: Refactor `getComponentDetail` to return `sub_items`

**Files:**
- Modify: `lib/artwork/actions.ts` (function `getComponentDetail`, around line 1348)

- [ ] **Step 1: Locate and replace**

Find `getComponentDetail` and update its `.select(...)` to alias `artwork_component_items` as `sub_items`:

```typescript
export async function getComponentDetail(
    id: string
): Promise<ArtworkComponentWithVersions | null> {
    const supabase = await createServerClient();

    const { data: component } = await supabase
        .from('artwork_components')
        .select('*')
        .eq('id', id)
        .single();
    if (!component) return null;

    const [versionsRes, checksRes, subItemsRes] = await Promise.all([
        supabase
            .from('artwork_component_versions')
            .select('*')
            .eq('component_id', id)
            .order('version_number', { ascending: false }),
        supabase
            .from('artwork_production_checks')
            .select('*')
            .eq('component_id', id)
            .order('created_at', { ascending: false }),
        supabase
            .from('artwork_component_items')
            .select('*')
            .eq('component_id', id)
            .order('sort_order', { ascending: true }),
    ]);

    return {
        ...(component as ArtworkComponent),
        versions: (versionsRes.data ?? []) as any,
        production_checks: (checksRes.data ?? []) as any,
        extra_items: (subItemsRes.data ?? []) as any,    // legacy alias — kept during rollout
        sub_items: (subItemsRes.data ?? []) as any,
    };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add lib/artwork/actions.ts
git commit -m "feat(artwork): getComponentDetail returns sub_items (extra_items kept as alias)"
```

---

## Task 7: Build `<SubItemCard>` component

**Files:**
- Create: `app/(portal)/admin/artwork/[id]/[componentId]/components/SubItemCard.tsx`

- [ ] **Step 1: Write the card**

Create `app/(portal)/admin/artwork/[id]/[componentId]/components/SubItemCard.tsx`:

```typescript
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Trash2, Check, RotateCcw } from 'lucide-react';
import { Chip } from '@/app/(portal)/components/ui';
import {
    updateSubItem,
    deleteSubItem,
    signOffSubItemDesign,
    submitSubItemProduction,
    reverseSubItemSignOff,
    setSubItemTargetStage,
} from '@/lib/artwork/sub-item-actions';
import type { ArtworkSubItem } from '@/lib/artwork/types';
import type { ProductionStage } from '@/lib/production/types';

interface Props {
    subItem: ArtworkSubItem;
    stages: ProductionStage[];
    jobSignedOffAt: string | null; // when the whole job is completed, card is read-only
}

export function SubItemCard({ subItem, stages, jobSignedOffAt }: Props) {
    const router = useRouter();
    const [expanded, setExpanded] = useState(!subItem.design_signed_off_at);
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    // Design fields (local buffer)
    const [name, setName] = useState(subItem.name ?? '');
    const [material, setMaterial] = useState(subItem.material ?? '');
    const [method, setMethod] = useState(subItem.application_method ?? '');
    const [finish, setFinish] = useState(subItem.finish ?? '');
    const [widthMm, setWidthMm] = useState(subItem.width_mm?.toString() ?? '');
    const [heightMm, setHeightMm] = useState(subItem.height_mm?.toString() ?? '');
    const [returnsMm, setReturnsMm] = useState(subItem.returns_mm?.toString() ?? '');
    const [quantity, setQuantity] = useState(subItem.quantity);
    const [notes, setNotes] = useState(subItem.notes ?? '');
    const [stageId, setStageId] = useState(subItem.target_stage_id ?? '');

    // Production fields
    const [measuredW, setMeasuredW] = useState(subItem.measured_width_mm?.toString() ?? '');
    const [measuredH, setMeasuredH] = useState(subItem.measured_height_mm?.toString() ?? '');
    const [materialConfirmed, setMaterialConfirmed] = useState(subItem.material_confirmed);
    const [ripConfirmed, setRipConfirmed] = useState(subItem.rip_no_scaling_confirmed);

    const designLocked = !!subItem.design_signed_off_at;
    const productionLocked = !!subItem.production_signed_off_at;
    const readOnly = jobSignedOffAt != null;
    const stageName = stages.find((s) => s.id === subItem.target_stage_id)?.name ?? null;

    const status: { label: string; variant: 'approved' | 'neutral' | 'warning' } =
        productionLocked
            ? { label: 'production signed off', variant: 'approved' }
            : designLocked
              ? { label: 'design signed off', variant: 'neutral' }
              : { label: 'in design', variant: 'warning' };

    const saveDesign = () => {
        setError(null);
        startTransition(async () => {
            const res = await updateSubItem(subItem.id, {
                name: name || null,
                material: material || null,
                application_method: method || null,
                finish: finish || null,
                quantity,
                notes: notes || null,
                width_mm: widthMm ? Number(widthMm) : null,
                height_mm: heightMm ? Number(heightMm) : null,
                returns_mm: returnsMm ? Number(returnsMm) : null,
                target_stage_id: stageId || null,
            });
            if ('error' in res) setError(res.error);
            else router.refresh();
        });
    };

    const doSignOffDesign = () => {
        setError(null);
        startTransition(async () => {
            const saveRes = await updateSubItem(subItem.id, {
                name: name || null,
                material: material || null,
                application_method: method || null,
                finish: finish || null,
                quantity,
                notes: notes || null,
                width_mm: widthMm ? Number(widthMm) : null,
                height_mm: heightMm ? Number(heightMm) : null,
                returns_mm: returnsMm ? Number(returnsMm) : null,
                target_stage_id: stageId || null,
            });
            if ('error' in saveRes) { setError(saveRes.error); return; }
            const res = await signOffSubItemDesign(subItem.id);
            if ('error' in res) setError(res.error);
            else router.refresh();
        });
    };

    const submitProduction = (alsoSignOff: boolean) => {
        setError(null);
        if (!measuredW || !measuredH) {
            setError('measured width and height are required');
            return;
        }
        startTransition(async () => {
            const res = await submitSubItemProduction(
                subItem.id,
                {
                    measured_width_mm: Number(measuredW),
                    measured_height_mm: Number(measuredH),
                    material_confirmed: materialConfirmed,
                    rip_no_scaling_confirmed: ripConfirmed,
                },
                alsoSignOff
            );
            if ('error' in res) setError(res.error);
            else router.refresh();
        });
    };

    const reverse = (which: 'design' | 'production') => {
        setError(null);
        if (!confirm(`Reverse ${which} sign-off for sub-item ${subItem.label}?`)) return;
        startTransition(async () => {
            const res = await reverseSubItemSignOff(subItem.id, which);
            if ('error' in res) setError(res.error);
            else router.refresh();
        });
    };

    const del = () => {
        setError(null);
        if (!confirm(`Delete sub-item ${subItem.label}? This cannot be undone.`)) return;
        startTransition(async () => {
            const res = await deleteSubItem(subItem.id);
            if ('error' in res) setError(res.error);
            else router.refresh();
        });
    };

    return (
        <div className="border border-neutral-200 rounded-[var(--radius-md)] bg-white overflow-hidden">
            {/* Collapsed header */}
            <button
                onClick={() => setExpanded((v) => !v)}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-neutral-50 text-left"
            >
                <span className="shrink-0 w-8 h-8 rounded bg-neutral-900 text-white font-mono text-xs font-bold flex items-center justify-center">
                    {subItem.label}
                </span>
                <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                        {subItem.name || <span className="text-neutral-400 italic">unnamed</span>}
                    </p>
                    <p className="text-xs text-neutral-500 truncate">
                        {subItem.material || 'no material set'}
                        {subItem.width_mm && subItem.height_mm ? ` · ${subItem.width_mm} × ${subItem.height_mm} mm` : ''}
                    </p>
                </div>
                {stageName && (
                    <Chip variant="neutral">{stageName}</Chip>
                )}
                <Chip variant={status.variant}>{status.label}</Chip>
                {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>

            {expanded && (
                <div className="px-4 py-4 border-t border-neutral-200 space-y-4">
                    {error && (
                        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                            {error}
                        </p>
                    )}

                    {/* DESIGN */}
                    <section>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">
                            design {designLocked && <span className="text-green-700">· signed off</span>}
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="name">
                                <input disabled={designLocked || readOnly} value={name} onChange={e => setName(e.target.value)} className="input" />
                            </Field>
                            <Field label="quantity">
                                <input type="number" min={1} disabled={designLocked || readOnly} value={quantity} onChange={e => setQuantity(Math.max(1, Number(e.target.value)))} className="input" />
                            </Field>
                            <Field label="material">
                                <input disabled={designLocked || readOnly} value={material} onChange={e => setMaterial(e.target.value)} placeholder="e.g. 5mm rose-gold mirrored acrylic" className="input" />
                            </Field>
                            <Field label="application method">
                                <input disabled={designLocked || readOnly} value={method} onChange={e => setMethod(e.target.value)} placeholder="e.g. stuck to face" className="input" />
                            </Field>
                            <Field label="finish">
                                <input disabled={designLocked || readOnly} value={finish} onChange={e => setFinish(e.target.value)} placeholder="e.g. rose gold mirror" className="input" />
                            </Field>
                            <Field label="target department">
                                <select disabled={designLocked || readOnly} value={stageId} onChange={e => setStageId(e.target.value)} className="input">
                                    <option value="">— select —</option>
                                    {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </Field>
                            <Field label="width (mm)">
                                <input type="number" step="0.1" disabled={designLocked || readOnly} value={widthMm} onChange={e => setWidthMm(e.target.value)} className="input" />
                            </Field>
                            <Field label="height (mm)">
                                <input type="number" step="0.1" disabled={designLocked || readOnly} value={heightMm} onChange={e => setHeightMm(e.target.value)} className="input" />
                            </Field>
                            <Field label="returns (mm)">
                                <input type="number" step="0.1" disabled={designLocked || readOnly} value={returnsMm} onChange={e => setReturnsMm(e.target.value)} className="input" />
                            </Field>
                        </div>
                        <Field label="notes">
                            <textarea disabled={designLocked || readOnly} value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="input" />
                        </Field>
                        {!readOnly && (
                            <div className="flex gap-2 mt-3">
                                {!designLocked && (
                                    <>
                                        <button disabled={pending} onClick={saveDesign} className="btn-secondary text-xs">save</button>
                                        <button disabled={pending} onClick={doSignOffDesign} className="btn-primary text-xs inline-flex items-center gap-1">
                                            <Check size={12} /> save & sign off design
                                        </button>
                                    </>
                                )}
                                {designLocked && !productionLocked && (
                                    <button disabled={pending} onClick={() => reverse('design')} className="btn-secondary text-xs inline-flex items-center gap-1">
                                        <RotateCcw size={12} /> reverse design sign-off
                                    </button>
                                )}
                            </div>
                        )}
                    </section>

                    {/* PRODUCTION */}
                    {designLocked && (
                        <section className="pt-3 border-t border-neutral-100">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">
                                production {productionLocked && <span className="text-green-700">· signed off</span>}
                            </h3>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="measured width (mm)">
                                    <input type="number" step="0.1" disabled={productionLocked || readOnly} value={measuredW} onChange={e => setMeasuredW(e.target.value)} className="input" />
                                </Field>
                                <Field label="measured height (mm)">
                                    <input type="number" step="0.1" disabled={productionLocked || readOnly} value={measuredH} onChange={e => setMeasuredH(e.target.value)} className="input" />
                                </Field>
                            </div>
                            {subItem.dimension_flag === 'out_of_tolerance' && (
                                <p className="mt-2 text-xs text-red-700">
                                    ⚠ Out of tolerance — Δw {subItem.width_deviation_mm ?? '?'} mm, Δh {subItem.height_deviation_mm ?? '?'} mm
                                </p>
                            )}
                            <div className="flex flex-wrap gap-4 mt-3">
                                <label className="text-xs flex items-center gap-1.5">
                                    <input type="checkbox" disabled={productionLocked || readOnly} checked={materialConfirmed} onChange={e => setMaterialConfirmed(e.target.checked)} />
                                    material confirmed
                                </label>
                                <label className="text-xs flex items-center gap-1.5">
                                    <input type="checkbox" disabled={productionLocked || readOnly} checked={ripConfirmed} onChange={e => setRipConfirmed(e.target.checked)} />
                                    RIP no-scaling confirmed
                                </label>
                            </div>
                            {!readOnly && (
                                <div className="flex gap-2 mt-3">
                                    {!productionLocked && (
                                        <>
                                            <button disabled={pending} onClick={() => submitProduction(false)} className="btn-secondary text-xs">save measurements</button>
                                            <button disabled={pending} onClick={() => submitProduction(true)} className="btn-primary text-xs inline-flex items-center gap-1">
                                                <Check size={12} /> sign off production
                                            </button>
                                        </>
                                    )}
                                    {productionLocked && (
                                        <button disabled={pending} onClick={() => reverse('production')} className="btn-secondary text-xs inline-flex items-center gap-1">
                                            <RotateCcw size={12} /> reverse production sign-off
                                        </button>
                                    )}
                                </div>
                            )}
                        </section>
                    )}

                    {/* DELETE */}
                    {!readOnly && !designLocked && !productionLocked && (
                        <section className="pt-3 border-t border-neutral-100">
                            <button onClick={del} disabled={pending} className="text-xs text-red-700 hover:underline inline-flex items-center gap-1">
                                <Trash2 size={12} /> delete sub-item
                            </button>
                        </section>
                    )}
                </div>
            )}
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{label}</span>
            <div className="mt-0.5">{children}</div>
        </label>
    );
}
```

Note: uses class `.input` — this must exist in the design system. If not, the classes `w-full text-sm border border-neutral-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#4e7e8c] disabled:bg-neutral-50 disabled:text-neutral-500` should be applied directly to each input. Verify `.input` exists in `app/globals.css` or the UI kit; if not, replace `className="input"` occurrences with the full Tailwind chain shown.

- [ ] **Step 2: Verify `.input` utility**

Run: `grep -rn "\.input" app/globals.css 2>&1 | head -5`

If the class is defined, leave as-is. If not, replace the occurrences of `className="input"` with:

```
className="w-full text-sm border border-neutral-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#4e7e8c] disabled:bg-neutral-50 disabled:text-neutral-500"
```

(Use a one-shot `sed` or editor replace across the file.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. If `Chip` variant type rejects `'warning'`, adjust the Chip import / props accordingly — check `app/(portal)/components/ui/index.tsx` for the ChipProps variant union.

- [ ] **Step 4: Commit**

```bash
git add "app/(portal)/admin/artwork/[id]/[componentId]/components/SubItemCard.tsx"
git commit -m "feat(artwork): SubItemCard — collapsible card with design + production + sign-off"
```

---

## Task 8: Build `<SubItemList>` + `<AddSubItemForm>`

**Files:**
- Create: `app/(portal)/admin/artwork/[id]/[componentId]/components/AddSubItemForm.tsx`
- Create: `app/(portal)/admin/artwork/[id]/[componentId]/components/SubItemList.tsx`

- [ ] **Step 1: Write AddSubItemForm**

Create `app/(portal)/admin/artwork/[id]/[componentId]/components/AddSubItemForm.tsx`:

```typescript
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { createSubItem } from '@/lib/artwork/sub-item-actions';
import type { ProductionStage } from '@/lib/production/types';

interface Props {
    componentId: string;
    stages: ProductionStage[];
}

export function AddSubItemForm({ componentId, stages }: Props) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const [name, setName] = useState('');
    const [material, setMaterial] = useState('');
    const [stageId, setStageId] = useState('');

    const submit = () => {
        setError(null);
        startTransition(async () => {
            const res = await createSubItem({
                component_id: componentId,
                name: name || undefined,
                material: material || undefined,
                target_stage_id: stageId || undefined,
            });
            if ('error' in res) { setError(res.error); return; }
            setOpen(false);
            setName('');
            setMaterial('');
            setStageId('');
            router.refresh();
        });
    };

    if (!open) {
        return (
            <button
                onClick={() => setOpen(true)}
                className="w-full border-2 border-dashed border-neutral-200 hover:border-neutral-400 rounded-[var(--radius-md)] px-4 py-3 text-sm text-neutral-500 hover:text-neutral-700 inline-flex items-center justify-center gap-1.5"
            >
                <Plus size={14} /> add sub-item
            </button>
        );
    }

    return (
        <div className="border border-neutral-300 rounded-[var(--radius-md)] p-4 bg-neutral-50 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-600">new sub-item</p>
            <div className="grid grid-cols-2 gap-3">
                <label className="block">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">name (optional)</span>
                    <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. QUEEN BEE letters"
                        className="mt-0.5 w-full text-sm border border-neutral-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#4e7e8c]" />
                </label>
                <label className="block">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">material (optional)</span>
                    <input value={material} onChange={e => setMaterial(e.target.value)} placeholder="e.g. 5mm acrylic"
                        className="mt-0.5 w-full text-sm border border-neutral-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#4e7e8c]" />
                </label>
                <label className="block col-span-2">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">target department</span>
                    <select value={stageId} onChange={e => setStageId(e.target.value)}
                        className="mt-0.5 w-full text-sm border border-neutral-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#4e7e8c]">
                        <option value="">— select (can set later) —</option>
                        {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </label>
            </div>
            {error && <p className="text-xs text-red-700">{error}</p>}
            <div className="flex justify-end gap-2">
                <button onClick={() => setOpen(false)} className="btn-secondary text-xs">cancel</button>
                <button onClick={submit} disabled={pending} className="btn-primary text-xs">
                    {pending ? 'adding…' : 'add sub-item'}
                </button>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Write SubItemList**

Create `app/(portal)/admin/artwork/[id]/[componentId]/components/SubItemList.tsx`:

```typescript
'use client';

import { SubItemCard } from './SubItemCard';
import { AddSubItemForm } from './AddSubItemForm';
import type { ArtworkSubItem } from '@/lib/artwork/types';
import type { ProductionStage } from '@/lib/production/types';

interface Props {
    componentId: string;
    subItems: ArtworkSubItem[];
    stages: ProductionStage[];
    jobSignedOffAt: string | null;
}

export function SubItemList({ componentId, subItems, stages, jobSignedOffAt }: Props) {
    return (
        <div className="space-y-3">
            {subItems.length === 0 ? (
                <div className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    This component has no sub-items yet. Add one to begin entering design spec.
                </div>
            ) : (
                subItems
                    .slice()
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((si) => (
                        <SubItemCard
                            key={si.id}
                            subItem={si}
                            stages={stages}
                            jobSignedOffAt={jobSignedOffAt}
                        />
                    ))
            )}
            {!jobSignedOffAt && <AddSubItemForm componentId={componentId} stages={stages} />}
        </div>
    );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add "app/(portal)/admin/artwork/[id]/[componentId]/components/AddSubItemForm.tsx" "app/(portal)/admin/artwork/[id]/[componentId]/components/SubItemList.tsx"
git commit -m "feat(artwork): SubItemList + AddSubItemForm — card list with inline add"
```

---

## Task 9: Wire `<SubItemList>` into the component detail page

**Files:**
- Modify: `app/(portal)/admin/artwork/[id]/[componentId]/page.tsx`

- [ ] **Step 1: Read the current page**

Read the file — note how `DesignSection` and `ProductionSection` are currently imported and used.

- [ ] **Step 2: Replace their usage with `SubItemList`**

Near the top, update imports:

```typescript
import { SubItemList } from './components/SubItemList';
```

Remove the imports of `DesignSection` and `ProductionSection` (they will stay in the codebase for now but are unused).

In the JSX, wherever `<DesignSection ...>` and `<ProductionSection ...>` are rendered, replace with a single:

```tsx
<SubItemList
    componentId={component.id}
    subItems={component.sub_items}
    stages={stages}
    jobSignedOffAt={job.status === 'completed' ? job.updated_at : null}
/>
```

Keep the `VersionHistory` and `DimensionAlert` sections if they still provide value — but comment out their props if they referenced component-level spec fields. Concretely:
- `DimensionAlert` — remove. Tolerance is now per-sub-item and rendered inside `SubItemCard`.
- `VersionHistory` — keep, still relevant (component-level artwork file versions).

- [ ] **Step 3: Smoke test**

Run: `npm run dev`. Open `/admin/artwork/<jobId>/<componentId>` for any existing component. Expected:
- The page renders without error.
- A single sub-item "A" card appears (the backfilled one).
- Expanding the card shows the design + production fields.
- Adding a second sub-item works — `createSubItem` succeeds, page refreshes, new card appears.

If the "add sub-item" button fails with a FK error, something is wrong with the migration or the RLS policy on `artwork_component_items`.

- [ ] **Step 4: Commit**

```bash
git add "app/(portal)/admin/artwork/[id]/[componentId]/page.tsx"
git commit -m "feat(artwork): component detail page renders SubItemList (replaces Design+Production sections)"
```

---

## Task 10: Print page iterates sub-items

**Files:**
- Modify: `app/(print)/admin/artwork/[id]/[componentId]/print/page.tsx`

- [ ] **Step 1: Read the current print page**

Look at lines 360–430 — the extra_items rendering block.

- [ ] **Step 2: Replace the block**

Replace the conditional `hasExtraItems` block (lines 363–430) with a sub-items-driven layout:

```tsx
{/* Sub-items table — each row is a distinct spec */}
{component.sub_items && component.sub_items.length > 0 ? (
    <table className="w-full text-sm border-collapse border border-black mb-4">
        <thead>
            <tr className="bg-neutral-100 text-xs">
                <th className="border border-black px-2 py-1 text-left">Item</th>
                <th className="border border-black px-2 py-1 text-left">Name</th>
                <th className="border border-black px-2 py-1 text-left">Material</th>
                <th className="border border-black px-2 py-1 text-left">Method</th>
                <th className="border border-black px-2 py-1 text-left">Finish</th>
                <th className="border border-black px-2 py-1 text-right">W (mm)</th>
                <th className="border border-black px-2 py-1 text-right">H (mm)</th>
                <th className="border border-black px-2 py-1 text-right">R (mm)</th>
                <th className="border border-black px-2 py-1 text-right">Qty</th>
            </tr>
        </thead>
        <tbody>
            {component.sub_items
                .slice()
                .sort((a: any, b: any) => a.sort_order - b.sort_order)
                .map((si: any) => (
                    <tr key={si.id}>
                        <td className="border border-black px-2 py-1 font-mono font-bold">{si.label}</td>
                        <td className="border border-black px-2 py-1">{si.name ?? '—'}</td>
                        <td className="border border-black px-2 py-1">{si.material ?? '—'}</td>
                        <td className="border border-black px-2 py-1">{si.application_method ?? '—'}</td>
                        <td className="border border-black px-2 py-1">{si.finish ?? '—'}</td>
                        <td className="border border-black px-2 py-1 text-right">{si.width_mm ?? '—'}</td>
                        <td className="border border-black px-2 py-1 text-right">{si.height_mm ?? '—'}</td>
                        <td className="border border-black px-2 py-1 text-right">{si.returns_mm ?? '—'}</td>
                        <td className="border border-black px-2 py-1 text-right">{si.quantity ?? 1}</td>
                    </tr>
                ))}
        </tbody>
    </table>
) : (
    <p className="italic text-neutral-500 text-sm mb-4">No sub-items defined.</p>
)}

{component.lighting && (
    <p className="text-sm mb-2"><strong>Lighting:</strong> {component.lighting}</p>
)}
```

The `component.sub_items` must be loaded by whatever server helper the print page uses; confirm that `getComponentDetail` (or whatever the print page calls) now returns `sub_items`. If the print page uses a different loader, update it the same way as Task 6.

- [ ] **Step 3: Smoke test**

Open `/admin/artwork/<jobId>/<componentId>/print`. Verify the sub-item table renders with all columns populated.

- [ ] **Step 4: Commit**

```bash
git add "app/(print)/admin/artwork/[id]/[componentId]/print/page.tsx"
git commit -m "feat(artwork): print page iterates sub-items with per-item material/method/finish"
```

---

## Task 11: Delegate legacy sign-off / submit functions to sub-item equivalents

**Files:**
- Modify: `lib/artwork/actions.ts`

- [ ] **Step 1: Redirect the legacy helpers to the new sub-item API**

The existing `signOffDesign`, `signOffProduction`, `submitDesign`, `submitProductionMeasurements` still work against the component's own spec columns, which new sub-item code no longer maintains. To keep any older imports working during the rollout, replace each of their bodies with a thin shim that finds the component's single sub-item (if any) and calls the sub-item equivalent.

Replace `signOffDesign`:

```typescript
export async function signOffDesign(
    componentId: string
): Promise<{ success: boolean } | { error: string }> {
    const supabase = await createServerClient();
    const { data: items } = await supabase
        .from('artwork_component_items')
        .select('id')
        .eq('component_id', componentId)
        .order('sort_order', { ascending: true });
    if (!items || items.length === 0) return { error: 'component has no sub-items' };
    if (items.length > 1) {
        return { error: 'component has multiple sub-items — sign off each individually' };
    }
    const { signOffSubItemDesign } = await import('./sub-item-actions');
    const res = await signOffSubItemDesign(items[0].id);
    if ('error' in res) return { error: res.error };
    return { success: true };
}
```

Replace `signOffProduction`:

```typescript
export async function signOffProduction(
    componentId: string
): Promise<{ success: boolean } | { error: string }> {
    const supabase = await createServerClient();
    const { data: items } = await supabase
        .from('artwork_component_items')
        .select('id, measured_width_mm, measured_height_mm, material_confirmed, rip_no_scaling_confirmed')
        .eq('component_id', componentId)
        .order('sort_order', { ascending: true });
    if (!items || items.length === 0) return { error: 'component has no sub-items' };
    if (items.length > 1) {
        return { error: 'component has multiple sub-items — sign off each individually' };
    }
    const si = items[0];
    if (si.measured_width_mm == null || si.measured_height_mm == null) {
        return { error: 'production measurements missing' };
    }
    const { submitSubItemProduction } = await import('./sub-item-actions');
    const res = await submitSubItemProduction(
        si.id,
        {
            measured_width_mm: si.measured_width_mm,
            measured_height_mm: si.measured_height_mm,
            material_confirmed: si.material_confirmed,
            rip_no_scaling_confirmed: si.rip_no_scaling_confirmed,
        },
        true
    );
    if ('error' in res) return { error: res.error };
    return { success: true };
}
```

`submitDesign` and `submitProductionMeasurements` are unused by the new UI. They can remain untouched for now; a follow-up commit deletes them once no remaining caller references them. Grep confirms the only callers are the unused `DesignSection.tsx` / `ProductionSection.tsx` files (unreferenced after Task 9).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add lib/artwork/actions.ts
git commit -m "refactor(artwork): signOffDesign/Production delegate to sub-item equivalents"
```

---

## Task 12: Final verification + cleanup

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: 101+ tests pass. The 8 Phase 1 artwork tests still pass. New sub-item schema tests pass. New `nextItemLabel` tests pass. New `computeReleaseGaps` tests pass.

- [ ] **Step 2: Full typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Delete unreferenced legacy UI**

The files below are no longer imported (confirm with grep):

Run: `grep -rn "from.*DesignSection\|from.*ProductionSection\|from.*DimensionAlert" app/ lib/ 2>&1 | head`

If the grep is empty, delete:

```bash
rm "app/(portal)/admin/artwork/[id]/[componentId]/components/DesignSection.tsx"
rm "app/(portal)/admin/artwork/[id]/[componentId]/components/ProductionSection.tsx"
rm "app/(portal)/admin/artwork/[id]/[componentId]/components/DimensionAlert.tsx"
```

If any file is still imported, leave it for now and note it as a follow-up.

- [ ] **Step 4: Manual end-to-end smoke test**

Dev-server checklist. Create or reuse a test artwork job with a production_item link.

1. Open the component detail page. Confirm the backfilled sub-item "A" renders.
2. Add a new sub-item "B" with a different material and target department. Verify it appears.
3. Fill design fields on both sub-items. Select different departments.
4. Click "save & sign off design" on each. Confirm the card collapses to signed-off state.
5. Enter measurements on each sub-item. Click "sign off production" on each.
6. Click "Release to Production" on the job page. Confirm the item advances to the first routed department in the Kanban board.
7. Open the print page `/print/admin/artwork/<jobId>/<componentId>/print`. Confirm the sub-items table lists each row with its own material.
8. Open the client approval link. Confirm it still works (cover image + components still render — sub-item detail is intentionally not surfaced to the client this phase).

- [ ] **Step 5: Push**

```bash
git push origin feature/phase2-quotes-purchase-orders
```

---

## Self-review

**Spec coverage:**
- §Architecture schema + backfill → Task 1
- §Component becomes pure container, sub-item schemas → Task 2
- §Server action surface changes — CRUD, sign-off, routing → Tasks 3, 4
- §Release-to-production rewrite → Task 5
- §UI flat expandable cards → Tasks 7, 8, 9
- §Print page → Task 10
- §Legacy delegating wrappers → Task 11
- §Testing → incorporated in Tasks 3–5 and Task 12
- §Rollout — migration first, code second, migration 040 deferred → covered by task order; follow-up migration 040 explicitly not in this plan

**Placeholder scan:** No "TBD" / "TODO" / "implement later" / vague statements. Each code-changing step has the full code inline.

**Type consistency:**
- `createSubItem` / `updateSubItem` / `deleteSubItem` / `setSubItemTargetStage` / `signOffSubItemDesign` / `submitSubItemProduction` / `reverseSubItemSignOff` — all named consistently with the spec and with each other.
- `CreateSubItemInput` / `UpdateSubItemInput` / `SubItemMeasurementInput` — schemas and types aligned.
- `ArtworkSubItem` used throughout UI tasks (7, 8) matches the type defined in Task 2.
- `computeReleaseGaps` return shape matches its test expectations.
- Migration column names match the columns referenced in types.ts and actions.ts.
