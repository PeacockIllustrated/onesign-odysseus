# Generic Quote Items + Artwork QoL Design

**Date:** 2026-04-14
**Status:** Approved for implementation (user trust; no review gate)
**Depends on:** Phase 1 artwork integration (migrations 036–038), sub-items refactor (039), thumbnails (040)

## Context

Two complementary threads land in one spec:

1. **Artwork QoL** — the artwork detail page shows only the legacy free-text `client_name`. The org record, contact, site, logo, and delivery address are not displayed. The approval link flow requires the client to re-type their own name and email even though the org's primary contact is already known. No site_id exists on `artwork_jobs` so the install address never reaches the compliance sheet or the approval page.

2. **Generic quote items** — the quoter only supports `panel_letters_v1`. Real Onesign quotes routinely cover vinyl-only jobs, lightboxes, printed foamex/dibond boards, projection signs, and service-only work (fitting, removal). Staff either force these into `panel_letters_v1` with inappropriate inputs or skip the app entirely.

The flow target we agreed on:

```
Quote → (accept) → Artwork skeleton auto-generated → designer verifies,
client approves → release → Production → Delivery
```

Service line items (fitting, removal) skip artwork and go to delivery/invoicing.

## Goals

1. Quote items can describe any signage or service job, with `panel_letters_v1` retained for the shape it was built for.
2. On quote acceptance, each production-work line item generates a skeleton `artwork_component` with sub-items pre-filled from the quote's structured spec.
3. Service line items (fitting, removal, survey) never spawn artwork.
4. The artwork detail page shows the client, primary contact, and delivery address inherited from the quote chain, with inline override at the artwork level.
5. The approval link flow pre-populates the recipient from the linked contact; the public approval page shows the delivery address.

## Non-goals (deferred)

- Multi-recipient approvals (Phase 2 G from earlier menu)
- Email sending (needs Resend, user flagged deferred)
- Updated print views for generic items — they render with a simple fallback for now; polished multi-shape print sheets are a follow-up
- Editing generic items after creation — v1 ships create-only; edit is a follow-up (works fine: delete + re-add)
- Service items auto-creating delivery records — the `is_production_work` flag gates the artwork skeleton now; delivery auto-creation waits for your delivery overhaul
- Converting existing `panel_letters_v1` items to skeleton artwork retroactively — only new/future accepted quotes generate skeletons

## Architecture

### 1. Schema — migration 041

```sql
-- Artwork: add site_id to close the inheritance gap
ALTER TABLE public.artwork_jobs
  ADD COLUMN IF NOT EXISTS site_id UUID
  REFERENCES public.org_sites(id) ON DELETE SET NULL;

-- Quote items: support generic items alongside panel_letters_v1
ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS part_label TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS component_type TEXT,
  ADD COLUMN IF NOT EXISTS is_production_work BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS unit_cost_pence INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS markup_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lighting TEXT,
  ADD COLUMN IF NOT EXISTS spec_notes TEXT;

-- Item type enum expansion (panel_letters_v1 still works)
-- The existing item_type column stays TEXT; we just add 'generic' and 'service'
-- as valid values. No check constraint exists today so no migration needed.
```

**Artwork component_type vocabulary.** The existing `ComponentTypeEnum` in `lib/artwork/types.ts` covers material-ish types (panel, vinyl, acrylic, dibond, foamex, etc.). For skeleton generation we keep using these; "fascia" / "window" / "door" / "projection" are *conceptual* groupings in the quote but map onto material types at the artwork layer (a fascia is a `panel`, a window vinyl is `vinyl`, a projection sign is a `panel` with `dibond` or `acrylic` sub-items). **No enum change required.** The quote's `part_label` captures the conceptual name ("Main fascia panel", "Frosted Q window"), the `component_type` maps to an artwork material type.

### 2. Types (`lib/quoter/types.ts` additions)

```typescript
export const QuoteSubItemInputSchema = z.object({
    name: z.string().max(120).optional(),
    material: z.string().max(200).optional(),
    application_method: z.string().max(200).optional(),
    finish: z.string().max(120).optional(),
    quantity: z.number().int().min(1).default(1),
    width_mm: z.number().positive().nullable().optional(),
    height_mm: z.number().positive().nullable().optional(),
    returns_mm: z.number().nullable().optional(),
    notes: z.string().max(500).optional(),
});

export const GenericQuoteItemInputSchema = z.object({
    part_label: z.string().min(1, 'part label required').max(120),
    description: z.string().max(4000).optional(),
    component_type: ComponentTypeEnum.optional(), // from artwork types
    is_production_work: z.boolean().default(true),
    quantity: z.number().int().min(1).default(1),
    unit_cost_pence: z.number().int().min(0).default(0),
    unit_price_pence: z.number().int().min(0),
    markup_percent: z.number().min(0).max(100).default(0),
    discount_percent: z.number().min(0).max(100).default(0),
    lighting: z.string().max(60).optional(),
    spec_notes: z.string().max(2000).optional(),
    sub_items: z.array(QuoteSubItemInputSchema).max(20).default([]),
});
```

### 3. Server actions

**New** in `lib/quoter/actions.ts`:
- `addGenericQuoteItemAction(quoteId, input)` — validates, inserts with `item_type: 'generic'`, stores sub-items in `input_json.sub_items`, sets `line_total_pence = (unit_price × quantity) × (1 - discount/100)`
- `deleteQuoteItemAction` — already exists, works for any item type

**New** in `lib/artwork/actions.ts`:
- `generateArtworkFromQuote(quoteId)` — called when quote is accepted. Finds the linked `production_job` via `production_jobs.quote_id`, creates a single `artwork_job` linked to the production_job's first `job_item` (or a newly-created synthetic item if no production_job exists yet), then for every production-work quote_item creates an `artwork_component` with sub-items copied from the quote's structured spec. Skips `is_production_work = false` items.

**Modified** in `lib/artwork/actions.ts`:
- `createArtworkJobForItem(jobItemId)` — already inherits `org_id` from parent production_job. Extended to also inherit `contact_id` and `site_id`.
- `createArtworkJob({kind: 'linked'})` — same treatment. Orphan path accepts optional `site_id`, `contact_id`.

### 4. UI

**Artwork detail page** (`app/(portal)/admin/artwork/[id]/page.tsx`):
- New right-column card: "Client & Delivery"
  - Client logo + name (linked to `/admin/clients/[org_id]`)
  - Contact name + email + phone (with edit icon → dropdown of org's contacts, bound to a new action `setArtworkClientContext`)
  - Delivery site + address (same pattern)
- Fields are live (mirrors the current org/contact/site records); the values get snapshotted onto the `artwork_approvals` row at link generation time for liability immutability

**Approval link generation modal** (`ApprovalLinkSection.tsx`):
- Adds a read-only "link will reference" block showing the job's contact + site (from the artwork_job, inherited from the chain)
- When submitted, those values are captured on the approval row (new columns on `artwork_approvals`: `snapshot_contact_name`, `snapshot_contact_email`, `snapshot_site_name`, `snapshot_site_address`)

**Public approval page** (`ApprovalClientView.tsx`):
- New "install / delivery address" block above the components list
- Uses the snapshot fields on the approval row (liability-correct — immune to later org record changes)

**Quote detail page** (`app/(portal)/admin/quotes/[id]/page.tsx`):
- "Add item" picker gains two radios: `Panel + Letters (calculated)` vs `Generic item (manual)`
- Generic form captures: part label, component type, description, sub-items (inline editor), quantity, unit price, discount, markup, is_production_work toggle
- Accepted quotes gain a **"Generate Artwork"** button next to "Create Production Job"

### 5. Data flow (the happy path)

```
Admin creates quote, adds items:
  Line A: generic "Main fascia panel"
    component_type: panel, is_production_work: true
    sub_items: [{ material: '5mm acrylic rose gold', method: 'stuck to face', ... },
                { material: 'white vinyl', method: 'weeded and applied', ... }]
    unit_price: £991, qty: 1
  Line B: generic "Fitting"
    is_production_work: false, unit_price: £380, qty: 1

Admin accepts quote → clicks "Generate Artwork":
  → production_job created (if not already, via existing createJobFromQuote)
  → artwork_job created, linked to first job_item, org/contact/site inherited
  → For line A (production_work): artwork_component created
      name: 'Main fascia panel', component_type: panel
      sub-items A1, A2 from the quote spec
  → Line B (service): skipped

Designer opens artwork, sees skeleton, uploads files, signs off sub-items.
Link generation → contact email pre-filled, site snapshotted onto approval row.
Client approves → sees delivery address, signs.
Release to production → existing flow.
```

### 6. Error handling

- **Migration 041** uses `IF NOT EXISTS` everywhere; safe to re-run
- `generateArtworkFromQuote` refuses if:
  - quote not found
  - quote status ≠ 'accepted'
  - artwork job already exists for this quote (prevents duplicates on repeated clicks)
- `addGenericQuoteItemAction` requires quote to be `draft` (same rule as `panel_letters_v1` items)
- Service items with `is_production_work = false` simply don't appear in the skeleton — no error

### 7. Testing

- Vitest: `GenericQuoteItemInputSchema` round-trip cases (valid full spec, minimal-only, empty sub_items, invalid widths)
- Manual smoke test documented in plan

### 8. Out of scope (ship as follow-up)

- `panel_letters_v1` skeleton generation — for now, v1 items don't auto-generate artwork. Staff creates the artwork manually as today. Follow-up: derive sub-items from the v1 calculator output
- Print view polish for generic items
- Editing existing generic items in place
- Rich spec fields (lighting/returns/RAL) promoted from `spec_notes` to first-class columns
- Service items auto-creating delivery records
