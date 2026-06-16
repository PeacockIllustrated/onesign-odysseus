# Architecture — Onesign Odysseus

## What this is

Production management platform for **Onesign & Digital**, a signage and digital products agency. Replaces Clarity Go (third-party SaaS) with a bespoke system covering job tracking, quoting, artwork compliance, and client delivery — plus an in-house **Studio** suite of parametric design + CAM tools (panel visualiser, built-up returns, nesting, LED layout, vectoriser) that feeds the same pipeline.

## Tech stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript (strict)
- **Database:** Supabase (PostgreSQL with RLS + Realtime)
- **Auth:** Supabase SSR (`@supabase/ssr`)
- **Styling:** Tailwind CSS 4 (`@tailwindcss/postcss`)
- **Forms:** React Hook Form + Zod
- **Icons:** Lucide React
- **Testing:** Vitest
- **Hosting:** Vercel

## Route structure

```
app/
├── (portal)/                    # Authenticated portal (sidebar + topbar; resolves org context)
│   ├── admin/                   # Super-admin surface. Pipeline: quotes, artwork, jobs,
│   │   │                        #   deliveries, invoices, purchase-orders. CRM: clients, orgs.
│   │   │                        #   Plus maintenance, site-surveys, production-packs,
│   │   │                        #   design-requests, external-orders, approvals, flags,
│   │   │                        #   reports, pricing, subscriptions, leads, deliverables.
│   │   ├── visualiser/          # ★ Studio: folded-aluminium panel visualiser + sub-tools
│   │   │   ├── returns/         #     built-up letter returns → nester handoff
│   │   │   ├── led-layout/      #     LED module layout + wiring PDF
│   │   │   ├── neon/            #     neon bending tool
│   │   │   ├── vectorise/       #     image → SVG converter
│   │   │   └── preview/         #     shared 3D preview
│   │   ├── nesting/             # ★ Studio: acrylic nesting (SVG → packed sheets)
│   │   ├── binder/              # ★ Studio: reusable client-logo SVG library
│   │   └── tools/               # ★ Studio hub (portfolio of the design/fab tools)
│   ├── shop-floor/              # Department queue for tablets (own minimal layout, no sidebar)
│   ├── dashboard/ billing/ …    # Client-facing leftovers from the multi-tenant past (dormant)
│   ├── components/              # Portal components (Sidebar, Topbar, ui/)
│   └── layout.tsx               # Enforces auth; getUserOrg() resolves/guards org context
├── (print)/                     # Print-optimised layouts (no chrome) for every printable record
│   └── admin/                   #   artwork, quotes, invoices, deliveries, purchase-orders,
│                                #   design-packs, production-packs, site-surveys
├── design/                      # ★ PUBLIC unauth "Design Your Sign" studio (B2C lead-gen)
├── backshop/                    # Workshop TV production board (top-level; plain requireAuth)
├── sign-off/[token]/            # External tokenised artwork sign-off (UNAUTH — token is the gate)
├── production-sign-off/[token]/ # Internal production sub-item sign-off (UNAUTH — token-gated)
├── delivery/[token]/            # External proof-of-delivery (UNAUTH — token-gated)
├── approve/artwork/[token]/     # Legacy artwork approval — redirects to /sign-off/[token]
├── api/                         # API routes (auth, leads, architect-leads, deliverable gen)
├── login/ signup/               # Auth pages
├── page.tsx                     # Root redirect: authenticated → /admin, else → /login
└── layout.tsx                   # Root layout (fonts, metadata)
```

**Route groups** `(portal)` and `(print)` do not affect URLs — they organise code and apply different layouts. The old `(marketing)` group (growth + architect wizards) has been removed; only the legacy `architect-leads` / `leads` API endpoints remain. The public `/design` studio, the `/backshop` TV board, and the three token flows (`/sign-off`, `/production-sign-off`, `/delivery`) sit at the top level, deliberately **outside** `(portal)` — see CLAUDE.md §2b / §2c / §3 for why.

## Database schema (66 migrations as of 2026-06)

CLAUDE.md carries the authoritative per-migration ledger (001–067; `031` intentionally absent). This section sketches the schema by domain — consult CLAUDE.md when you need the exact migration for a given table.

### Core portal (001–011)
- `marketing_leads` — legacy lead capture (orphaned; no FK to orgs)
- `orgs` — client organisations (a "client" in the UI, an "org" in the schema)
- `org_members` — Onesign staff ↔ client assignment with roles
- `profiles` — user profiles with `role` (`super_admin` for Onesign staff)
- `subscriptions`, `deliverables`, `client_assets`, `reports` — supporting tables
- `architect_leads` — architect-specific lead capture (011)

### Client CRM (034)
- `contacts` — per-org contacts with `contact_type` (primary / billing / site / general)
- `org_sites` — per-org addresses with flags for `is_primary` / `is_billing_address` / `is_delivery_address`
- Added `contact_id` + `site_id` columns to `quotes`, `production_jobs`, `deliveries`, `purchase_orders` so every downstream record can inherit the client context

### Signage quoter (012–013, 026)
- `pricing_sets` — versioned rate card sets
- `panel_prices`, `manufacturing_rates`, `illumination_profiles`, `letter_price_table` — pricing lookup tables
- `quotes` — quote headers (reference OSD-YYYY-NNNNNN)
- `quote_items` — individual line items; currently typed as `panel_letters_v1` (engine-calculated) with a generic type under design
- `quote_audits` — audit trail for quote changes

### Design packs (014)
- `design_packs`, `design_pack_sections` — printable brand design pack system

### Artwork compliance (015–018, 029, 032, 036–040)
- `artwork_jobs` — the spec-bearing record linked to orgs (migration 036 promotes `org_id` to primary identifier). Reference `AWC-YYYY-NNNNNN`
- `artwork_components` — physical assemblies (fascia, window, door, projection, etc.)
- `artwork_component_items` — sub-items within a component; **this is the spec-bearing row after migration 039**. Holds material, method, finish, dimensions, target department, sign-off state, and optional thumbnail
- `artwork_component_versions` — snapshot trail of design changes
- `artwork_production_checks` — append-only log of production-stage verifications
- `artwork_approvals` — token-based external client approval (64-char tokens, 7-day expiry)
- `artwork_job_lineage` view (037) — one-query path from artwork job → production job → quote

### Production pipeline (024–025, 028)
- `production_stages` — configurable stage definitions (Order Book, Artwork Approval, department stages, Goods Out)
- `production_jobs` — fabrication tracker linked to quotes and orgs
- `job_items` — individual cards with per-item `stage_routing` derived from artwork sub-item target stages
- `job_stage_log` — audit trail of stage transitions
- `department_instructions` — stage-specific notes per job
- `work_centres` — real Onesign production areas

### Purchase orders, invoices, deliveries (027, 033, 035)
- `purchase_orders`, `po_items` — supplier PO generation (PO-YYYY-NNNNNN)
- `invoices`, `invoice_items` — generated from accepted quotes (INV-YYYY-NNNNNN)
- `deliveries`, `delivery_items` — proof-of-delivery token flow (PoD signature capture)

### CRM geocoding, maintenance, drivers (047–050)
- `org_sites.lat`/`lng` (nullable, postcodes.io) for the site map; `maintenance_visits` (surveys / inspections / repairs / cleaning); `drivers` roster; `deliveries.driver_id`

### Per-line approvals, notifications, external orders, production sign-off (051–057)
- `artwork_component_decisions` (051, 053) — client approves each component **and each sub-item** individually, or requests changes with a per-line comment; overall status derived. (054) "approve + a comment" is flagged urgent, not a clean sign-off
- `notifications` (052, 056) — persisted dashboard "Needs Attention" feed, fed by Realtime triggers on `artwork_approvals`, `shop_floor_flags`, and external Persimmon orders
- `external_orders` (055) — unified inbox for orders from external Onesign apps (Persimmon / Mapleleaf / lynx shop); acknowledge-then-convert, never auto-converted
- `artwork_production_approvals` (057) — 64-hex token behind the unauth `/production-sign-off/[token]` surface (Chris / John tick each sub-item before release)

### Site surveys & production packs (061–063)
- `site_surveys`, `survey_items`, `survey_photos` (061–062, ref `SVY-YYYY-NNNNNN`) — digitised on-site measure-up; sits upstream of a quote (nullable org/site/contact). Photo-first UX with per-photo real-world sizes + annotation overlay
- `production_packs` (063) — block-based JSONB internal works-pack builder (à la `design_packs`); standalone in v1 with soft links to wire up later

### Studio suite persistence (058–060, 064–067)
- `visualiser_designs` (058) — saved folded-aluminium panel designs (params + flattened SVG)
- `backshop_items` (059, + `backshop` bucket) — workshop TV board snapshots with contextual production gates
- `design_requests` (060, ref `DSR-YYYY-NNNNNN`) — inbound leads from the public `/design` studio; service-role write, super-admin RLS
- `nesting_designs` (064) + `letter_return_jobs` (065) — saved acrylic nests + built-up letter return jobs, linked as one nest
- `binder_assets` (066) — reusable client-logo SVG library; `led_layout_designs` (067) — LED layout & wiring tool state

All tables use RLS. Super-admin access is checked via `is_super_admin()` on `profiles.role`; org-scoped reads use `is_org_member(org_id)`. Admin-client (service-role) callers must gate on `requireSuperAdminOrError()` from `lib/auth.ts` before bypassing RLS.

## Auth model

1. **Supabase SSR auth** — session cookies managed via `@supabase/ssr`
2. **Three Supabase clients:**
   - `lib/supabase.ts` — browser client (client components)
   - `lib/supabase-server.ts` — server client (server components, actions) — respects RLS
   - `lib/supabase-admin.ts` — service-role client — bypasses RLS (admin operations only)
3. **Org membership** — users belong to orgs via `org_members`. `getUserOrg()` resolves the current user's org context.
4. **Roles:**
   - `profiles.role = 'super_admin'` — Onesign staff, full platform access (`/app/admin/*`)
   - `org_members.role` — `owner`, `admin`, `member` — org-level permissions
5. **Portal layout** (`app/(portal)/layout.tsx`) enforces auth and resolves org context. Redirects unauthenticated users to `/login`.

## Quoter engine (`lib/quoter/`)

The signage quoter calculates prices for panel signs and illuminated letters.

- **`engine/panel-letters-v1.ts`** — core calculation engine for panel and letter pricing
- **`engine/fixtures.json`** — test fixtures with known input/output pairs
- **`engine/panel-letters-v1.test.ts`** — Vitest tests against fixtures
- **`rate-card.ts`** — rate card type definitions
- **`types.ts`** — TypeScript types for quotes, items, pricing
- **`actions.ts`** — server actions for creating/updating quotes
- **`pricing-actions.ts`** — server actions for managing pricing sets
- **`utils.ts`** — shared quoter utilities

The engine is the most complex module. It has comprehensive tests and should not be modified without running the test suite.

## Studio suite (`lib/visualiser/`, `lib/nesting/`, `lib/binder/`, `lib/backshop/`)

The Studio is the in-house family of parametric design + CAM tools, and the most active area of the codebase. Each tool reads a real-size SVG (or builds geometry from parameters), previews it, and exports production-ready output. The strategic direction (CLAUDE.md "Planned") is to grow these into a general bespoke-fabrication configurator that feeds the same artwork → nesting → production pipeline.

**Tools** (under `/admin/visualiser` + siblings, plus the Studio hub at `/admin/tools`):
- **Panel visualiser** — folded-aluminium sign builder: place SVG artwork, assign a material per path (cut / vinyl / acrylic / standoff / push-through), preview in R3F 3D, export multi-page production + reference PDFs.
- **Built-up letter returns** — break side-wall return strips at corners + stock length, hand faces + returns to the nester as one linked nest.
- **Acrylic nesting** — pack pieces onto sheets via a raster bottom-left-fill engine in a Web Worker; export per-sheet SVG/DXF + a summary PDF.
- **LED layout & wiring** — lay modules into faces, chain runs, size drivers, emit a wiring PDF + power schedule.
- **Neon** — neon bending tool. **Image → SVG vectoriser** — colour quantization + stacked multi-layer trace, background remover, "Save to binder". **Binder** — reusable client-logo SVG library surfaced at every SVG-upload point.

**Engineering invariants:**
- The engines (`lib/visualiser/*`, `lib/nesting/*`) are **DOM-free and Vitest-covered** — geometry, SVG flatten/subdivide, returns, nesting, vectorise all have fixtures. Rendering (R3F, jsPDF) lives in client components / PDF modules, never in the engines.
- Shared cinematic UI language in `components/studio/`; per-tool state via co-located Zustand stores.
- Tools persist to their own tables (058 / 064 / 065 / 066 / 067) with the same RLS stance: super-admin write via service role, any authed Onesign user reads/creates.

**Public face:** `/design` is the unauthenticated B2C version of the visualiser — a guided wizard mounting the same engine, store, and Scene3D. Submissions land in `design_requests` (service-role write, no session) → triaged at `/admin/design-requests` → promoted into a real `visualiser_designs` row. See CLAUDE.md §2c.

## Work flow (quote → artwork → production → delivery)

Artwork is the spec-bearing record; production is the fabrication tracker derived from it. See `CLAUDE.md` "Work flow" for the canonical diagram.

Briefly:
1. **Quote** line items capture what Onesign is making. Each line is either production-work or service (fitting, removal, survey). Each carries inherited `org_id` / `contact_id` / `site_id`.
2. **On acceptance**, staff click "Generate artwork" → each production-work line spawns an artwork component skeleton with sub-items pre-filled from the line's structured spec. Service lines are skipped.
3. **Designer** uploads artwork files, verifies spec, gets client sign-off via `/sign-off/[token]` (no auth — token-based; per-component approve / request-changes + comment; legacy `/approve/artwork/[token]` redirects).
4. **Release to production** → the linked production_job's items appear on the department Kanban. Per-sub-item `target_stage_id` drives routing (CNC / Vinyl / Fabrication / Assembly / etc.).
5. **Delivery** on completion inherits install address from upstream. `/delivery/[token]` captures PoD signature.
6. **Invoice** branches from quote acceptance; not gated on production completion.

`artwork_job_lineage` view (migration 037) exposes the quote→production→artwork chain in one query.

## Key directories

```
lib/
├── quoter/          # ★ Signage quoter engine (CORE — Vitest-covered). engine/ = panel_letters_v1 + generic
├── artwork/         # Artwork compliance — the spec side (jobs, components, sub-items, token approval, decisions)
├── production/      # Production pipeline + shop-floor actions (the fabrication tracker)
├── production-packs/ # Block-based internal works-pack builder
├── invoices/        # Invoice CRUD + line-item recalc (from accepted quotes)
├── purchase-orders/ # Supplier POs
├── deliveries/      # Delivery CRUD + PoD token submission
├── drivers/         # Driver roster (delivery assignment)
├── clients/         # Client CRM (orgs + contacts + org_sites)
├── site-surveys/    # Digitised on-site measure-up + survey pack
├── maintenance/     # Maintenance visits (surveys, inspections, repairs, cleaning)
├── external-orders/ # Unified inbox for orders from external Onesign apps
├── design-requests/ # Public /design studio submissions (service-role write)
├── notifications/   # Dashboard "Needs Attention" feed (Realtime-backed)
├── deliverables/    # Legacy client deliverables (kept for reference)
├── design-packs/    # Brand design-pack generation
├── offers/          # Marketing offers (legacy)
│  # ── Studio suite: DOM-free engines + actions, Vitest-covered ──
├── visualiser/      # Folded-aluminium panel: geometry, SVG import, PDF, returns, neon, LED, vectorise/quantize/trace
├── nesting/         # Acrylic nesting: SVG → pieces → raster BLF engine (Web Worker) → SVG/DXF/PDF
├── binder/          # Reusable client-logo SVG library
├── backshop/        # Workshop TV board snapshot model + stage catalog
│  # ── Cross-cutting ──
├── geo/             # Postcode → lat/lng (postcodes.io)
├── mapbox/          # Map rendering helpers
├── planning/        # Scheduling / route planning helpers
├── auth.ts          # getUser, requireAuth, requireSuperAdminOrError, isSuperAdmin
├── env.ts           # Startup env validation (Zod) — fail fast on bad config
├── result.ts        # Result<T> discriminated union for server-action returns
├── supabase.ts      # Browser Supabase client
├── supabase-server.ts  # Server Supabase client (respects RLS)
├── supabase-admin.ts   # Service-role client — bypasses RLS; gate every call site
└── __mocks__/       # Vitest Supabase mock factory

components/
├── admin/           # Shared admin pickers (ContactPicker, SitePicker, OrgPicker) + quoter/
└── studio/          # Shared cinematic Studio design system (StudioStage, DayNightSwitch)

supabase/
└── migrations/      # 66 sequential migrations as of 2026-06 (001–067; 031 absent)
```
