# Artwork Sub-Items — Multi-Medium Component Refactor

**Date:** 2026-04-14
**Status:** Draft → awaiting user review
**Author:** Claude (brainstorming session)
**Supersedes:** N/A
**Depends on:** Phase 1 artwork integration (migrations 036–038) already merged

## Context

The current artwork model assumes every "component" is a single physical thing with **one material, one application method, one target department**. Extra items under a component only carry different *dimensions* — the material and method are inherited.

This doesn't match reality for multi-medium assemblies. The canonical example is a **signage panel containing both flat-cut acrylic letters AND applied vinyl lettering**:

- The panel itself is one physical object that gets delivered as a unit.
- The acrylic letters are produced by the CNC / acrylic finishing team.
- The vinyl strapline is produced by the plotter / vinyl team.
- Both sub-items have different materials, different finishes, different application methods, and route to different departments in the production pipeline.

Today staff must either:
1. **Split the panel into two components** — loses the "these belong on one panel" relationship, makes client-facing approval packs read strangely, makes release-to-production sequence the wrong way (the panel must be fabricated after both parts are ready, but the system has no way to express that).
2. **Shoehorn both mediums under one component** — all "extra items" inherit the component's material, so the spec sheet lies about half the parts.

Both options force staff to lie to the system or work around it, which is the exact friction Odysseus was supposed to remove.

## Goals

1. A component can act as an **assembly container** with 1..n sub-items, each carrying its own material / method / finish / dimensions / target department / sign-off state.
2. Per-sub-item department routing so each shop-floor team sees only the sub-items they are responsible for.
3. Release-to-production advances an artwork job only when *every* sub-item across *every* component is signed off and routed.
4. Backwards-compatible with existing artwork jobs — no data lost, all live jobs continue to function after migration.
5. Shop-floor view is a natural consequence of the sub-item-as-card design, not a separate build.

## Non-goals

- Material / method / finish lookup tables (deferred — free text now, Phase 2 may promote to controlled vocabularies if data-quality pain warrants).
- Per-sub-item artwork files or thumbnails (one component-level file covers the whole assembly).
- Per-sub-item client approval (client approves the assembly as a whole via the existing token flow).
- Per-sub-item lighting (lighting is an assembly-level property).
- Changes to the Phase 1 reconciliation / orphan / lineage logic.

## Architecture

### 1. Component becomes a pure container

After this refactor, an `artwork_components` row represents the assembly — its name, artwork file, cover image, lighting, panel metadata, client approval linkage. It **no longer carries spec fields** (material, method, dimensions, stage routing, sign-off state). All of that lives on sub-items.

### 2. `artwork_component_items` becomes the spec-bearing row

The existing `artwork_component_items` table (migration 016 — today only for extra dimension sets) is promoted to be *the* place where spec data lives. Every component has 1..n rows in it. A component that represents a single-medium thing (today's common case) has exactly one sub-item.

### 3. Migration 039 — schema changes + backfill

**New columns on `artwork_component_items`:**

```sql
ALTER TABLE public.artwork_component_items
  ADD COLUMN name TEXT,
  ADD COLUMN material TEXT,
  ADD COLUMN application_method TEXT,
  ADD COLUMN finish TEXT,
  ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN notes TEXT,
  ADD COLUMN target_stage_id UUID REFERENCES public.production_stages(id) ON DELETE SET NULL,
  ADD COLUMN designed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN design_signed_off_at TIMESTAMPTZ,
  ADD COLUMN design_signed_off_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN production_checked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN production_signed_off_at TIMESTAMPTZ,
  ADD COLUMN production_signed_off_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN material_confirmed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN rip_no_scaling_confirmed BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_artwork_component_items_target_stage
  ON public.artwork_component_items(target_stage_id);
CREATE INDEX idx_artwork_component_items_design_signoff
  ON public.artwork_component_items(design_signed_off_at);
CREATE INDEX idx_artwork_component_items_production_signoff
  ON public.artwork_component_items(production_signed_off_at);

CHECK (quantity >= 1)
```

**Backfill (inside the same migration, in a DO block):**

For every existing `artwork_components` row, insert a single sub-item row capturing its current spec:

```sql
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
WHERE c.width_mm IS NOT NULL  -- only components that had real spec data
  AND NOT EXISTS (
    SELECT 1 FROM public.artwork_component_items i
    WHERE i.component_id = c.id AND i.sort_order = 0
  );

-- Bump the existing extra items from sort_order 1+ to preserve ordering
-- after the newly-inserted A at sort_order 0.
-- (Current schema seeds extras at sort_order 1,2,3... so they stay in place.)
```

The component's spec columns (`material`, `width_mm`, `height_mm`, `returns_mm`, `target_stage_id`, `designed_by`, `design_signed_off_at`, etc.) remain on the table **intact** — not nulled, not dropped. They become frozen legacy data: the new app code never reads them, but keeping the values preserves a natural rollback path (point the app back at the old columns). A follow-up migration 040, after the app has been stable in production for a few weeks, drops the unused columns.

### 4. Component boundaries going forward

**Component (`artwork_components`) owns:**
- `id`, `job_id`, `name`, `component_type`, `sort_order`, `status`
- `file_path`, `artwork_thumbnail_url`, `cover_image_path` context (via job)
- `lighting`
- `scale_confirmed`, `bleed_included` (assembly-level design integrity flags)
- Legacy spec columns remain but are no longer read by app code after rollout.

**Sub-item (`artwork_component_items`) owns:**
- Identity: `id`, `component_id`, `label`, `sort_order`, `name`, `notes`
- Spec: `material`, `application_method`, `finish`, `quantity`, `width_mm`, `height_mm`, `returns_mm`
- Production: `measured_width_mm`, `measured_height_mm`, `dimension_flag`, deviations, `material_confirmed`, `rip_no_scaling_confirmed`
- Routing: `target_stage_id`
- Sign-off: `designed_by`, `design_signed_off_at/by`, `production_checked_by`, `production_signed_off_at/by`

### 5. Release-to-production rewrite

The Phase 1 `completeArtworkAndAdvanceItem` function read each component's `target_stage_id` to build the production item's `stage_routing`. After this refactor it reads sub-items instead:

```ts
// Build the union of target stages across every sub-item of every component
// for the artwork job. Order by the ProductionStages table's display order.
const targetStageIds = unique(
  subItems
    .filter(si => si.target_stage_id)
    .map(si => si.target_stage_id)
);
```

Gates for release:
- Every sub-item must have both `design_signed_off_at` and `production_signed_off_at` populated.
- Every sub-item must have `target_stage_id` set.
- If any fail, release is blocked with a precise error: "Sub-item B of component 'Main Panel' has no target department."

The existing `completeArtworkAndAdvanceItem` function is refactored (not replaced) — its signature stays the same, its internals now iterate sub-items.

### 6. Server action surface changes

**New / changed in `lib/artwork/actions.ts`:**

```ts
// Replaces the old "extra_items only" hook. Manages ALL sub-items including the primary.
export async function upsertSubItem(componentId: string, input: SubItemInput): Promise<...>
export async function deleteSubItem(subItemId: string): Promise<...>

// Per-sub-item sign-offs
export async function signOffSubItemDesign(subItemId: string): Promise<...>
export async function signOffSubItemProduction(subItemId: string): Promise<...>

// Per-sub-item routing
export async function setSubItemTargetStage(subItemId: string, stageId: string | null): Promise<...>

// Refactored — operates on sub-items now
export async function completeArtworkAndAdvanceItem(artworkJobId: string): Promise<...>
```

**Removed (deprecated but kept in-place for the rollout window):**
- `signOffComponentDesign`, `signOffComponentProduction` — become thin wrappers that delegate to the single sub-item when a component has exactly one (backwards compatibility for any UI that hasn't been updated mid-rollout). Removed in a follow-up once the UI migration is complete.

### 7. UI — flat expandable sub-item cards

Component detail page (`app/(portal)/admin/artwork/[id]/[componentId]/page.tsx`) gets a new central section: a list of `<SubItemCard>` components.

Each card has:
- **Collapsed header row** (always visible): label chip (A/B/C), sub-item name, material summary, status chip, target department chip, expand caret.
- **Expanded body**:
  - Design section: name, material, application method, finish, dimensions (w/h/returns), quantity, notes, target department dropdown.
  - Production section: measured dimensions, material confirmed, rip/no-scaling confirmed, deviation display.
  - Sign-off buttons: "Sign off design" / "Sign off production" with confirmation.
  - Delete button (with confirm).
- **Add sub-item** button below the list.

Component page header (above the card list) still shows: component name, artwork file upload, lighting, status summary, client approval section, print/release buttons.

### 8. Shop-floor reuse

The `/shop-floor` route already exists for department-scoped queues. Today it queries at the component level. After this refactor, it queries `artwork_component_items WHERE target_stage_id = :department AND production_signed_off_at IS NULL`, rendering the same `<SubItemCard>` component in read-mostly mode with prominent "Mark production complete" buttons.

This is **not built in this spec** — it's called out so the card design stays shop-floor-compatible. The shop-floor refactor is a follow-up ticket.

### 9. Types

**`lib/artwork/types.ts` changes:**

```ts
export const SubItemInputSchema = z.object({
  id: z.string().uuid().optional(), // present on update
  label: z.string().min(1).max(4),
  sort_order: z.number().int().min(0),
  name: z.string().nullable().optional(),
  material: z.string().nullable().optional(),
  application_method: z.string().nullable().optional(),
  finish: z.string().nullable().optional(),
  quantity: z.number().int().min(1).default(1),
  notes: z.string().nullable().optional(),
  width_mm: z.number().positive().nullable(),
  height_mm: z.number().positive().nullable(),
  returns_mm: z.number().nullable(),
  target_stage_id: z.string().uuid().nullable(),
});

export const ArtworkSubItemSchema = z.object({
  // all the above, plus sign-off / measurement fields
});

// The existing ArtworkComponentItemSchema is deprecated —
// renamed to ArtworkSubItemSchema with the new column set appended.
```

The legacy `ExtraItemInputSchema` and `ExtraItemMeasurementInputSchema` are deleted.

## Data flow

**Creating a multi-medium panel (Queen Bee example):**
```
Admin creates component "Queen Bee main panel" (sets lighting, uploads artwork file)
  → Admin adds sub-item A: "QUEEN BEE letters"
      material "5mm rose-gold mirrored acrylic"
      application "stuck to face"
      finish "rose gold mirror"
      dimensions, quantity 1
      target department "CNC / acrylic"
  → Admin adds sub-item B: "AESTHETICS & ACADEMY strapline"
      material "white gloss vinyl"
      application "weeded and applied"
      finish "matte white"
      dimensions, quantity 1
      target department "Vinyl plotter"
  → Upload client approval link as before (component-level)
```

**Shop floor (hypothetical, not built in this spec):**
```
CNC operator opens /shop-floor
  → Sees sub-item A cards across all active jobs
  → Does the work, clicks "measurements complete" → enters w/h, material confirmed, rip confirmed
  → Clicks "sign off production"
Vinyl operator opens /shop-floor
  → Sees sub-item B cards across all active jobs
  → Same flow
```

**Release to production:**
```
completeArtworkAndAdvanceItem(artworkJobId)
  → SELECT sub-items for all components of this artwork job
  → Verify all are design-signed, production-signed, routed
  → UNION(sub-item target_stage_ids) = [CNC, Vinyl, Fabrication, Assembly]
  → Build job_items.stage_routing = [Order Book, Artwork, CNC, Vinyl, Fabrication, Assembly, Goods Out]
  → advanceItemToNextRoutedStage()
```

## Error handling

- **Release blocked with sub-item-level reason.** "Sub-item A of component 'Main Panel' has no target department set." Previously errors said "component X is missing..."
- **Deleting last sub-item** is rejected with "A component must have at least one sub-item. Delete the component instead."
- **Deleting a signed-off sub-item** is rejected with "Sub-item has been signed off. Reverse sign-off first." (This matches today's component-level behaviour.)
- **Migration race.** Components that existed before migration 039 but had `width_mm IS NULL` (i.e. staff started the component but hadn't entered dimensions yet) get no backfill row. The UI treats this as "zero sub-items, add one to begin".

## Testing

**Vitest unit tests (added to `lib/artwork/actions.test.ts`):**
- `SubItemInputSchema` — valid inputs, missing label, invalid quantity, negative dimensions.
- `upsertSubItem` signature validation via schema round-trip.
- Release-blocking conditions: unsigned design, unsigned production, missing target stage. Each as a discrete schema-level or pure-function test.

**Manual smoke test (documented in plan):**
1. Migrate a dev DB with an existing multi-item component. Verify exactly one sub-item "A" was created per component, with all spec copied.
2. Add a second sub-item "B" with different material + different target stage.
3. Sign off A's design + production; attempt release — expect "Sub-item B is not signed off".
4. Sign off B; release → item advances through CNC → Vinyl → Fab → Assembly in stage_routing order.
5. Verify client approval view still renders; approve link still works.
6. Verify print page renders sub-items with their distinct materials/methods.

## Rollout

1. **Migration 039 deploys first.** Schema additions + backfill. Idempotent (uses `IF NOT EXISTS` / `NOT EXISTS` guards). Safe to run against production even before app code is updated — the new columns are nullable or have safe defaults and are ignored by the current app.
2. **App code deploys second.** New UI reads sub-items. Legacy `signOffComponentDesign` / `signOffComponentProduction` remain as delegating wrappers for any in-flight requests.
3. **Follow-up migration 040 (later, not this spec):** drops the now-unused spec columns from `artwork_components` after verifying the app no longer reads them. Explicit follow-up ticket.

## Risks

- **Backfill miss.** Components with `width_mm IS NULL` get no sub-item row. Mitigation: the UI treats this as "no sub-items yet, add one" — user sees the new add-sub-item button and proceeds. No data is lost because there was no data to preserve. A notice banner on affected component pages would help ("this component was migrated; its dimensions were not set before, add a sub-item to begin").
- **Release-to-production regression.** The rewritten `completeArtworkAndAdvanceItem` is the most complex change. Integration test + staging smoke test both required before prod deploy. This is the same function shipped in Phase 1 two days ago, so the regression surface is well-understood.
- **Print page layout.** Sub-items with different materials / methods / dimensions need more vertical space on the compliance sheet than today's extra-items table. Risk: long components print multiple pages. Acceptable — the print page is already `@media print` aware.
- **Shop-floor coupling not built here.** If someone expected "shop floor for free" out of this spec, they'll be disappointed. Called out explicitly as out-of-scope.
- **Phase 1 unit tests untouched.** The 8 Zod tests for `CreateArtworkJobInput` are for a different concern; they continue to pass. New sub-item tests are additive.

## Out of scope (deferred)

- Shop-floor query migration to sub-item level (separate ticket, reuses the `<SubItemCard>` built here).
- Controlled vocabularies for material / method / finish (Phase 2).
- Dropping the now-unused component spec columns (migration 040).
- Per-sub-item artwork files (components still own one shared file).
- Per-sub-item client approval granularity (client approves the assembly as a whole).
- Rebuilding the approval token pack view to highlight sub-items (today it shows components; adequate for external use, may be polished later).
