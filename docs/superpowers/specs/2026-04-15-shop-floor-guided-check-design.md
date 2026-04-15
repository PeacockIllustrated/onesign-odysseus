# Shop Floor — guided LOOK → MEASURE → CONFIRM check

*Design spec — 2026-04-15*

## Summary

Give shop-floor workers a tablet-first, retard-proof way to review every sub-item that lands in their department: see the artwork, measure the physical piece, and sign the sub-item off — in three fixed, unskippable steps. When every sub-item routed to this department is signed off, the whole item is advanced to the next stage with one tap.

Today's Shop Floor page shows a per-stage queue with Start / Pause / Complete → Next Stage buttons and an inline instructions block. It tells the worker *that* there is work, not *what* the work is. This design adds the "what" — spec, artwork, dimensions — plus the QA step that currently lives in admin.

## Scope

**In scope**

- A full-screen guided stepper (LOOK → MEASURE → CONFIRM) invoked when the worker taps an item card on the shop-floor queue
- Per-sub-item walkthrough. Only sub-items whose `target_stage_id` matches the current stage are shown — a CNC worker never sees vinyl sub-items.
- Artwork preview from `artwork_component_items.thumbnail_url`, with tap-to-fullscreen zoom
- Measurement capture writing `measured_width_mm` / `measured_height_mm` to the sub-item, driving the existing `dimension_flag` (within / out of tolerance) via `checkDimensionTolerance` in `lib/artwork/utils.ts`
- Production sign-off per sub-item via existing `submitSubItemProduction(subItemId, input, signOff=true)` in `lib/artwork/sub-item-actions.ts`
- Post-signoff "Complete & send to [next stage]" action surfaces only once every department-scoped sub-item is signed off. Calls the existing `advanceItemToNextRoutedStage(itemId)`.
- "Report a problem" escape hatch — a short note that flags the sub-item for admin attention (new field, minimal addition)
- Landscape + portrait responsive layouts

**Out of scope**

- Changing the queue listing itself (the Shop Floor home stays as it is today)
- Touching the Job Board (`/admin/jobs`) — separate surface, separate audience
- Audio / barcode scanning / photo upload — future iterations
- Bulk signoff across multiple items at once
- Offline operation. Workers are expected to be on Wi-Fi.

## UX flow

```
shop-floor queue (existing)
   │ worker taps an item card
   ▼
full-screen stepper:
   sub-item 1 of N — target_stage_id == current stage
   ┌─────────────────────────────────────────┐
   │ 1. LOOK                                 │
   │    • big artwork (tap to fullscreen)    │
   │    • spec: material/method/finish/dim   │
   │    • admin notes for this stage (if any)│
   │    → Next (always enabled)              │
   ├─────────────────────────────────────────┤
   │ 2. MEASURE                              │
   │    • design dims as reminder            │
   │    • big numeric inputs: W, H, R*       │
   │    • live tolerance pill (within / out) │
   │    • Report a problem ↓                 │
   │    → Next (enabled once W & H entered)  │
   ├─────────────────────────────────────────┤
   │ 3. CONFIRM                              │
   │    • recap: spec · measured · tolerance │
   │    • ✓ Production checked — sign off    │
   │    • ⚠ Report a problem instead         │
   └─────────────────────────────────────────┘
   │ on signoff: submitSubItemProduction(…, signOff=true)
   ▼
if more department-scoped sub-items remain
   → advance breadcrumb to "sub-item 2 of N"
   → back to LOOK
else
   ▼
 "→ Complete & send to [next stage]"
 "  Stay on [current stage] (pause)"
   │ Complete calls advanceItemToNextRoutedStage(itemId)
   ▼
 back to the shop-floor queue, item gone from this stage

* Returns field shown only when design returns_mm is non-null.
```

### Step-specific notes

- **LOOK** — The artwork panel fills the viewport width in portrait (~70% vertical), splits left/right with the spec panel in landscape. Tap-to-zoom opens a lightweight image viewer with pinch + double-tap-to-reset. Admin's stage-specific instruction (from `department_instructions`) renders as a yellow-tinted panel below the spec. If no instructions exist, the panel is hidden entirely — no empty placeholder.

- **MEASURE** — Design dimensions are a read-only recap at the top of the step. Inputs are large (≥ 45 px tall, monospaced display font) with a visible unit suffix. The tolerance pill uses the existing `checkDimensionTolerance` helper — ±1 mm is the default tolerance window; `within_tolerance` is green, `out_of_tolerance` is red. A worker CAN proceed with an out-of-tolerance measurement — the pill is informational, and the "Report a problem" shortcut surfaces directly under the inputs when the pill is red.

- **CONFIRM** — Recap is a four-row read-only summary (spec / measured / tolerance / you + timestamp). The green signoff button is the only emphasised action; "Report a problem instead" is a small underlined link below.

### After the last sub-item

Once every sub-item where `target_stage_id == current stage` has `production_signed_off_at != null`, the stepper flips to a completion screen (shown in the mockup):

- Both sub-item labels rendered as green ✓ chips so the worker can see they're done
- One big green **"Complete & send to [next stage name]"** button — next stage is computed from the item's `stage_routing` array (the department after the current one)
- One neutral **"Stay on [current stage] (pause)"** button — calls `pauseItem(itemId)` and returns to the queue without advancing

"Complete & send" calls `advanceItemToNextRoutedStage(itemId)` (already handles the auto-delivery trigger when reaching goods-out, per the gap fixes just landed). On success the stepper closes and the worker lands back on the stage queue.

### Report a problem

A minimal escape hatch — not a full ticketing system. Tapping "Report a problem" opens a bottom sheet with:

- A textarea (free text, max 500 chars)
- One primary button: **"Flag & pause this item"**

Flagging writes a new row to a small table and pauses the item. Design: no automatic email or admin notification yet — admin sees flagged items on the Artwork page (and on the Job Board detail panel) as a red badge; real escalation is a future iteration.

## Architecture

### Data model additions

One new table — everything else reuses what's already there.

```sql
-- migration 042: shop-floor problem reports
CREATE TABLE public.shop_floor_flags (
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

CREATE INDEX idx_shop_floor_flags_sub_item ON public.shop_floor_flags(sub_item_id);
CREATE INDEX idx_shop_floor_flags_open ON public.shop_floor_flags(status) WHERE status = 'open';

ALTER TABLE public.shop_floor_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins manage flags"
    ON public.shop_floor_flags FOR ALL TO authenticated
    USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Auth'd users can create flags"
    ON public.shop_floor_flags FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth'd users can read flags"
    ON public.shop_floor_flags FOR SELECT TO authenticated
    USING (auth.uid() IS NOT NULL);
```

Everything else — measurements, production sign-off, item advance, auto-delivery — piggybacks on what already exists.

### Server actions

**New (`lib/production/shop-floor-actions.ts` — new file)**

- `getSubItemsForItemAtStage(itemId, stageId) → SubItemWithSpec[]`
  Server-side query used by the stepper to populate its sub-item walkthrough. Filters on `target_stage_id = stageId`. Returns everything the UI needs in one round trip (sub-item fields + parent component name + thumbnail URL signed or public).

- `reportShopFloorProblem({ subItemId, jobItemId, stageId, notes }) → { id } | { error }`
  Inserts a `shop_floor_flags` row and calls `pauseItem(jobItemId)` in the same transaction-ish sequence. Zod-validated.

**Reused (no change)**

- `submitSubItemProduction(subItemId, input, signOff=true)` — measurements + signoff in one call
- `advanceItemToNextRoutedStage(itemId)` — moves the item forward, flips job to completed + auto-creates delivery if last
- `pauseItem(itemId)` — for "Stay on stage (pause)"

### Front-end layout

```
app/(portal)/shop-floor/
├── page.tsx                             (existing — queue shell)
├── ShopFloorClient.tsx                  (existing — list; add onTap handler that pushes
│                                         the selected item into the stepper route)
└── check/
    └── [itemId]/
        ├── page.tsx                     server comp — loads item + its
        │                                 department-scoped sub-items in one go
        └── GuidedCheckClient.tsx        client comp — owns the stepper state machine
                                          (subIdx, step, measured values), renders
                                          StepLook / StepMeasure / StepConfirm
```

- The route lives under `shop-floor/check/[itemId]` so a deep link (e.g. a scanned QR code in future) can jump straight to a check.
- `GuidedCheckClient` keeps all stepper state client-side. Only the three server actions above mutate the DB. On success, each action triggers `router.refresh()` so the queue on return is current.
- Sub-components: `StepLook`, `StepMeasure`, `StepConfirm`, `CompletionScreen`, `FlagProblemSheet` — each under 150 lines. Shared `GuidedCheckHeader` (topbar + stepper pills + sub-item breadcrumb).

### Edge cases

- **Item with zero department-scoped sub-items.** Shouldn't happen in practice (release rebuilds routing from sub-items), but defensively: stepper shows a "nothing to check at this stage" message and offers the "Complete & send" button immediately. Logs a console warning — not an error, because it's a bad-data sign not a code bug.
- **Measurements already entered by someone else.** Pre-fill the MEASURE inputs with existing values; worker can edit. Tolerance pill reflects the current values.
- **Worker backs out mid-stepper.** Browser back / in-app back returns to the queue with nothing saved — measurements aren't persisted until the MEASURE "Next" tap commits them (server action call). No half-signed sub-items.
- **Concurrent signoff.** Two workers on the same item: `submitSubItemProduction` already rejects if design isn't signed off; if production is already signed off, the second caller sees an error and the stepper tells them "already signed off by someone else — returning to queue". `router.refresh()` on the queue drops the item.
- **Out-of-tolerance measurement.** Worker CAN still sign off. Rationale: sometimes the tolerance was miscommunicated, and forcing them to report-a-problem for every hair's-breadth deviation is noise. Admin can see the `dimension_flag` status on the artwork review page.
- **`next stage` doesn't exist (item at last stage).** "Complete & send" is relabelled "→ Complete item"; `advanceItemToNextRoutedStage` handles the completion + delivery auto-creation.

## Testing

- **Pure functions — Vitest.** One new pure function worth covering: `computeNextSubItem(subItems, currentStageId)` in `lib/production/shop-floor-utils.ts` — given the department-scoped sub-item list, returns the index of the next not-yet-signed-off sub-item or `null` if all are done. Existing `checkDimensionTolerance` already has coverage.
- **Manual smoke path.** Seed the Test-O's demo job, navigate `/shop-floor` → select CNC → tap the fascia item → walk LOOK → MEASURE → CONFIRM → verify the sub-item's `production_signed_off_at` populates + `dimension_flag` is correct. Repeat for sub-item 2 (letters → Vinyl stage). After both, "Complete & send to [next]" advances the item.
- **Integration test.** Not worth writing until we have a live Supabase test project (already flagged as deferred in CLAUDE.md).

## Risks

- **Touch-target quality on a real tablet.** Everything in the mockup uses ≥ 44 px tap targets, but feel of tap-to-zoom and number-input on a physical tablet will need one round of real-device validation before the rollout. Bake in an easy "adjust button size" CSS variable and revisit after a day of shop-floor use.
- **The dimensional-tolerance default (±1 mm).** Generous for signage, might need per-stage tuning later. For v1 it's constant in `checkDimensionTolerance`; a follow-up can make it configurable per-stage or per-component-type.
- **"Report a problem" quality.** Currently just pauses the item + stores a note. Real workflow needs routing (who gets notified?) which is a bigger piece of work. v1 ships the escape hatch so workers never feel trapped, but we're honest about it being a minimum.

## Non-decisions (rejected alternatives from brainstorming)

- **Full-screen takeover vs. bottom sheet vs. inline expand** — went full-screen because the artwork zoom is the headline feature and needs real estate. Bottom sheet felt small; inline expand felt like a toy.
- **Guided stepper vs. artwork-first single screen** — artwork-first was faster but let the worker skip signoff entirely. Guided stepper trades a few more taps for zero skips. User explicitly picked this.
- **Batched stepper (LOOK both, MEASURE both, CONFIRM both)** — rejected. Per-sub-item walkthrough keeps cognitive load on exactly one physical piece at a time.
