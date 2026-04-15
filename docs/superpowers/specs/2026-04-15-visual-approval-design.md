# Visual approval jobs — pre-production mockups in the artwork pipeline

*Design spec — 2026-04-15*

## Summary

Extend the existing `artwork_jobs` infrastructure to support a second flavour of artwork job: **visual approval**. A visual job exists to show a client mockups of what they *could* have — either as a lead/prospecting tool before a quote is written, or as a pre-production sign-off step once a quote has been accepted. Each component in a visual job has **1..N variants** (different design options for the same physical thing). The existing approval-token flow is reused; the client approval page adapts to let the client pick their preferred variant per component.

Visual and production artwork jobs live in the same table, share the same list page, the same print views, the same client/contact/site model, and the same approval-token plumbing. Only the per-component shape changes: production components have sub-items; visual components have variants.

## Scope

**In scope**

- New `job_type` column on `artwork_jobs` (`'production' | 'visual_approval'`, default `'production'` — existing rows unchanged)
- New `artwork_variants` child table (per-component mockup options)
- Optional `quote_id` on `artwork_jobs` so a visual can be linked to a quote at any point in its life
- Optional `parent_visual_job_id` on `artwork_jobs` (self-FK) so a production job spawned from a visual carries the back-reference
- "New visual for approval" button + creation flow on `/admin/artwork`
- Visual-mode editor on the component detail page: manage variants (add, reorder, edit, delete, upload thumbnails), with optional spec fields per variant
- Client approval page: variant picker per component when `N > 1`, single-variant "approve this design" when `N = 1`
- "Create production artwork from this visual" button on the visual detail page, appearing once the visual is approved. Spawns a new `artwork_jobs` row with `job_type='production'`, copies components + seeds one sub-item per component from the chosen variant's spec
- Unified list on `/admin/artwork` with a type filter (All / Production / Visuals) and a pill on each row indicating type
- "Visuals for this quote" section on the quote detail page (if any visuals reference the quote via `quote_id`)

**Out of scope**

- Automatic production-spawn on approval — explicit staff action only (Option A from brainstorming)
- Variant versioning / re-uploading past approval — once approved, a visual is immutable
- "Request changes" nuance on the variant picker — client approves the whole visual or rejects the whole visual, same as today
- Retroactive attaching of an already-approved visual to an existing production artwork job — visual → production is forward-only, create-new
- Combining variants and sub-items on the same component — a component is either visual-shaped or production-shaped, never both

## Data model

```sql
-- Migration 043: visual approval jobs + variants

BEGIN;

-- artwork_jobs: new columns, all nullable / default-safe
ALTER TABLE public.artwork_jobs
  ADD COLUMN IF NOT EXISTS job_type TEXT NOT NULL DEFAULT 'production'
    CHECK (job_type IN ('production', 'visual_approval')),
  ADD COLUMN IF NOT EXISTS quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_visual_job_id UUID REFERENCES public.artwork_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_artwork_jobs_job_type
  ON public.artwork_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_artwork_jobs_quote_id
  ON public.artwork_jobs(quote_id) WHERE quote_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_artwork_jobs_parent_visual
  ON public.artwork_jobs(parent_visual_job_id) WHERE parent_visual_job_id IS NOT NULL;

-- artwork_variants: per-component mockup options (visual jobs only)
CREATE TABLE public.artwork_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id UUID NOT NULL REFERENCES public.artwork_components(id) ON DELETE CASCADE,
  label TEXT NOT NULL,              -- 'A', 'B', 'C'... assigned client-side by count
  sort_order INTEGER NOT NULL DEFAULT 0,
  name TEXT,                        -- e.g. "Gold foil option"
  description TEXT,
  thumbnail_url TEXT,               -- the mockup image; nullable at schema, required in UX
  -- Optional spec fields — carried across to production sub-item if chosen
  material TEXT,
  application_method TEXT,
  finish TEXT,
  width_mm NUMERIC(10, 2),
  height_mm NUMERIC(10, 2),
  returns_mm NUMERIC(10, 2),
  -- Client selection
  is_chosen BOOLEAN NOT NULL DEFAULT FALSE,
  chosen_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_artwork_variants_component
  ON public.artwork_variants(component_id);
CREATE INDEX idx_artwork_variants_chosen
  ON public.artwork_variants(component_id) WHERE is_chosen = TRUE;

CREATE TRIGGER trg_artwork_variants_updated_at
  BEFORE UPDATE ON public.artwork_variants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.artwork_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage variants"
  ON public.artwork_variants FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY "Authed users read variants"
  ON public.artwork_variants FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

COMMIT;
```

**Rationale:**

- `job_type` defaults to `'production'` so every existing row continues to behave exactly as before. No backfill, no downtime.
- `quote_id` is on the job, not on individual components, because a whole visual job is the unit that can be linked to a quote.
- `parent_visual_job_id` makes the visual → production audit trail queryable both ways (can find what a visual became; can find what a production job came from).
- `artwork_variants` sits alongside `artwork_component_items`; UI code branches on `job_type` to render one or the other. No polymorphic complexity.
- Spec fields on `artwork_variants` mirror the sub-item spec columns so the "copy chosen variant into production sub-item" operation is a field-for-field insert.

## UX flow

### 1. Creating a visual

On `/admin/artwork`, the "New artwork job" button gets a sibling: **"New visual for approval"**. Tapping it opens a modal that collects:

- Name (required — e.g. "Queen Bee fascia concepts")
- Client (optional, searchable dropdown over orgs)
- Contact (optional, populated once a client is picked)
- Site (optional, populated once a client is picked)
- Description (optional)

The modal can also be opened *from* a quote detail page — in that case the client/contact/site fields pre-fill from the quote and `quote_id` is set on creation. A new section on the quote page — **"Visuals for this quote"** — surfaces any already-linked visuals and provides the "Create visual" entry-point.

### 2. Visual detail page

The same `/admin/artwork/[id]` route. The page detects `job_type === 'visual_approval'` and renders a visual-mode variant of the existing layout:

- Header pill says **VISUAL** (amber) beside the existing status pill.
- Right-side sidebar gets a small **"Linked quote"** card: either an existing quote with a clear-link affordance, or a searchable dropdown to attach one. No effect on any other flow — the link is purely informational until the user manually converts the visual to production.
- Each component card, when expanded, shows a **Variants** section instead of sub-items. Variants are listed in A/B/C order, each as a card with:
  - Thumbnail (via existing `ThumbnailUpload` component)
  - Name + description inputs
  - Optional spec fields (material, method, finish, W/H/R) in a collapsible "Spec details" panel — collapsed by default because most visuals don't need them
  - Notes
  - Delete button
  - "Chosen" badge if `is_chosen = TRUE` (only meaningful after client approval)
- **"+ Add variant"** button appends a new variant (auto-labels A/B/C/...).
- "Generate approval link" button behaves as today; URL opens the existing approval page which now renders variant-aware content.

### 3. Client approval page

The existing `/approve/artwork/[token]` route. When `job_type === 'visual_approval'` the approval page renders:

- Short intro: "You're reviewing design concepts for …"
- Per component:
  - If **1 variant**: same as today's production approval card — big thumbnail, spec (if filled), one "This looks right" action.
  - If **N > 1 variants**: a grid of cards, each with thumbnail + name + description + optional spec. Client taps one to mark it chosen. Selection is visual (ring + checkmark). Client can re-tap a different variant to change their mind.
- Bottom **Approve** button is disabled until every component has a chosen variant.
- Approval transaction: set `artwork_variants.is_chosen = TRUE` and `chosen_at = now()` on the picked variant per component, then set `artwork_jobs.status = 'completed'` and `client_approved_at = now()` (matching the existing production approval semantics).
- "Request changes" / rejection flow is identical to today's — the client comment is stored, the job stays in progress, no variants are marked chosen.

### 4. Converting to production

Once a visual is `completed` (client-approved), the visual detail page surfaces a green button: **"Create production artwork from this visual"**. Clicking it:

1. Creates a new `artwork_jobs` row: `job_type='production'`, `parent_visual_job_id=<visual id>`, same `org_id`/`contact_id`/`site_id`/`quote_id`/`job_item_id` if any. Status `'draft'`.
2. For each component in the visual: creates a matching `artwork_components` row in the new production job (same name, component_type, lighting, notes, sort_order).
3. For each component's chosen variant: creates one `artwork_component_items` row (sub-item label `'A'`) on the new production component, copying `material`, `application_method`, `finish`, `width_mm`, `height_mm`, `returns_mm`, `notes` from the variant. If no spec fields were filled on the chosen variant, the sub-item is created blank — the designer fills it in during the production phase.
4. Redirects the user to the new production artwork job's detail page.

The visual job stays intact (as an immutable historical record). The production job is a fresh, independent row that runs through the existing production flow unmodified.

### 5. List page

`/admin/artwork` gets:

- A "Type" filter dropdown: **All / Production / Visuals**. Defaults to All.
- Each row gains a pill: green **PRODUCTION** or amber **VISUAL**.
- Rows for visuals show their linked quote number (if any) in the description area, and — once `parent_visual_job_id` is set somewhere — a small "→ production" link pointing at the downstream production job.

## Architecture

### File layout

**New**

- `supabase/migrations/043_visual_approval.sql` — the migration above
- `lib/artwork/visual-approval-actions.ts` — server actions specific to visual-flavour jobs and variants (see below)
- `lib/artwork/variant-types.ts` — Zod schemas + TS types for variants (separate file because `visual-approval-actions.ts` uses `'use server'` and cannot export non-async objects)
- `app/(portal)/admin/artwork/components/NewVisualJobButton.tsx` — the "New visual for approval" creation modal
- `app/(portal)/admin/artwork/[id]/[componentId]/components/VariantsPanel.tsx` — container; lists + orders variants, handles "add variant"
- `app/(portal)/admin/artwork/[id]/[componentId]/components/VariantCard.tsx` — one variant's editable card (thumbnail, name, description, optional spec, delete)
- `app/(portal)/admin/artwork/[id]/components/LinkedQuoteCard.tsx` — the "linked quote" sidebar card on the visual detail page
- `app/(portal)/admin/artwork/[id]/components/CreateProductionFromVisualButton.tsx` — the green handoff button
- `app/approve/artwork/[token]/components/VariantPicker.tsx` — per-component variant picker for the approval page
- `app/(portal)/admin/quotes/[id]/components/VisualsForQuoteCard.tsx` — the "Visuals for this quote" section

**Modified**

- `lib/artwork/types.ts` — add `job_type`, `quote_id`, `parent_visual_job_id` to `ArtworkJobSchema`; add `VariantSchema` / types
- `lib/artwork/actions.ts` — `getArtworkJob` pulls variants alongside sub-items (one shared round-trip), adds `job_type` to the return shape; `createArtworkJob` accepts an optional `{ jobType, quoteId, parentVisualJobId }` bag
- `app/(portal)/admin/artwork/page.tsx` (list) — type filter + VISUAL/PRODUCTION pill + "New visual" button
- `app/(portal)/admin/artwork/[id]/page.tsx` — conditional render: visual mode swaps the sub-items editor for the variants editor, adds the LinkedQuoteCard + CreateProductionFromVisualButton to the sidebar
- `app/(portal)/admin/artwork/[id]/[componentId]/page.tsx` — conditional render branch as above
- `app/approve/artwork/[token]/ApprovalClientView.tsx` — conditional: for visual approvals, renders `VariantPicker` per component; "Approve" gated on full selection
- `lib/artwork/approval-actions.ts` — `submitApprovalAction` handles the variant selection transaction when `job_type='visual_approval'`
- `app/(portal)/admin/quotes/[id]/page.tsx` — add `VisualsForQuoteCard` section

### Server actions

**New — in `lib/artwork/visual-approval-actions.ts`**

- `createVisualApprovalJob(input) → { id } | { error }`
  Zod-validated. Creates an `artwork_jobs` row with `job_type='visual_approval'`. Accepts optional org/contact/site/quote context.

- `attachQuoteToVisualJob(jobId, quoteId) → { ok: true } | { error }`
  Validates both rows exist, updates `quote_id`. Idempotent.

- `detachQuoteFromVisualJob(jobId) → { ok: true } | { error }`
  Clears `quote_id`.

- `addVariantToComponent(input) → { id } | { error }`
  Creates a new `artwork_variants` row. Label auto-assigned based on current count.

- `updateVariant(variantId, patch) → { ok: true } | { error }`
  Zod-validated partial update. Rejects if `is_chosen` is TRUE (immutable once picked — forces "delete + re-add" discipline post-approval).

- `deleteVariant(variantId) → { ok: true } | { error }`
  Rejects if the variant's parent artwork_job is already approved.

- `uploadVariantThumbnail(variantId, formData) → { url } | { error }`
  Reuses the existing storage helpers that power sub-item thumbnails.

- `removeVariantThumbnail(variantId) → { ok: true } | { error }`

- `createProductionFromVisual(visualJobId) → { productionJobId } | { error }`
  The handoff action. Validates the visual is `completed` and every component has a chosen variant; copies components + one sub-item-per-component into a new production artwork_job.

**Modified — in `lib/artwork/approval-actions.ts`**

- `submitApprovalAction(token, input)` extended: if the job is `visual_approval`, the input includes `{ chosenVariantIds: Record<componentId, variantId> }`. The action validates every component has exactly one chosen variant, sets `is_chosen`, updates `status='completed'`, and records approval metadata. Existing production-approval path is unchanged.

### Zod schemas (in `lib/artwork/variant-types.ts`)

```ts
export const CreateVisualJobInputSchema = z.object({
  jobName: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  orgId: z.string().uuid().nullable().optional(),
  contactId: z.string().uuid().nullable().optional(),
  siteId: z.string().uuid().nullable().optional(),
  quoteId: z.string().uuid().nullable().optional(),
});

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

export const UpdateVariantInputSchema = CreateVariantInputSchema
  .partial()
  .omit({ componentId: true });

export const ApprovalVariantSelectionSchema = z.object({
  selections: z.array(z.object({
    componentId: z.string().uuid(),
    variantId: z.string().uuid(),
  })).min(1),
});
```

### Type branching in `getArtworkJob`

`getArtworkJob` is the single server-side loader used by every admin artwork page. It already fetches components + sub-items in one round-trip. Extend to also fetch variants:

```ts
const { data: components } = await supabase
  .from('artwork_components')
  .select(`*,
    sub_items:artwork_component_items(*),
    variants:artwork_variants(*)
  `)
  .eq('job_id', id)
  .order('sort_order');
```

Both arrays come back populated; UI branches on `job.job_type` to decide which to render. No perf concern — each component usually has ≤ 5 of either.

## Edge cases

- **Standalone visual with no org, no contact, no site, no quote.** Allowed — this is the prospecting case. Approval page still works (the link is shared with whoever the staff wants). No snapshot contact/site on approval; the approval captures `client_approved_name` free-text.
- **Visual with `N=0` variants on a component.** Approval is impossible (the "Approve" button stays disabled). Visible lint on the admin page: component card renders an empty-state "No variants yet — add one before generating the approval link".
- **Editing a variant after client approval.** Blocked server-side (the `updateVariant` + `deleteVariant` checks above). The spec is frozen.
- **Creating a production job twice from the same visual.** Blocked — `createProductionFromVisual` refuses if a production job with `parent_visual_job_id=<this>` already exists. The existing production job's link is surfaced on the visual detail page instead of the button.
- **Quote linked later gets deleted.** FK has `ON DELETE SET NULL`; the visual survives, its `quote_id` goes null. The "Linked quote" card gracefully renders as "Link to quote".
- **A visual is deleted while it has a downstream production job.** FK is `ON DELETE SET NULL` on `parent_visual_job_id`; the production job survives with a null back-reference. Visual delete is otherwise a full cascade through components + variants.

## Testing

- **Pure tests (Vitest).** One new pure helper worth testing: `mapVariantToSubItemInput(variant)` — the field-for-field translator used by `createProductionFromVisual`. Lives in `lib/artwork/variant-utils.ts` with tests asserting each field maps cleanly and optional fields default sanely.
- **Manual smoke path.** Seed Test-O's, create a visual from the quote detail page with two variants on one component, generate approval link, pick a variant in the /approve page, convert to production, verify the new production job exists with `parent_visual_job_id` set and one sub-item per component pre-populated with the chosen variant's spec.

## Risks

- **Thumbnail upload volume.** Visual jobs encourage more uploads than production ones (N variants × N components instead of 1 per sub-item). Current storage bucket + signing flow handles this fine at current scale, but worth noting if Onesign ever processes dozens of visuals per day.
- **"Same pipeline" scope drift.** Design says variants and sub-items don't overlap — keep that invariant tight during implementation. If a component ever ends up with both, it's a bug, not a feature.
- **Approval UX on small tablets.** Side-by-side variant picker with N=3+ variants might crowd below 768 px. Fallback to a stacked list at that breakpoint.
