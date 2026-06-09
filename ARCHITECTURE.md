# Architecture — Onesign Odysseus

## What this is

Production management platform for **Onesign & Digital**, a signage and digital products agency. Replaces Clarity Go (third-party SaaS) with a bespoke system covering job tracking, quoting, artwork compliance, and client delivery.

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
├── (portal)/              # Authenticated portal (sidebar + topbar layout)
│   ├── admin/             # Super-admin routes (job board, quotes, artwork, orgs, pricing, etc.)
│   ├── dashboard/         # Client org home
│   ├── assets/            # Client asset management
│   ├── billing/           # Client billing view
│   ├── deliverables/      # Client deliverables view
│   ├── reports/           # Client reports view
│   ├── settings/          # Org settings
│   ├── components/        # Portal-specific components (Sidebar, Topbar, SidebarContext, ui/)
│   └── layout.tsx         # Portal layout — enforces auth, resolves org context
├── (marketing)/           # Public marketing pages (no auth required)
│   ├── growth/            # Marketing landing, packages, enquiry wizard
│   └── architects/        # Architect lead capture wizard
├── (print)/               # Print-optimised layouts (no sidebar, minimal chrome)
│   └── admin/             # Printable views for artwork, quotes, design packs
├── approve/               # External tokenised artwork approval (no auth — token-based)
│   └── artwork/[token]/
├── shop-floor/            # Shop floor department queue (Phase 1 — minimal layout, touch-friendly)
├── api/                   # API routes
├── login/                 # Auth pages
├── signup/
├── page.tsx               # Root redirect: authenticated → /app/admin, else → /login
└── layout.tsx             # Root layout (fonts, metadata)
```

**Route groups** `(portal)`, `(marketing)`, `(print)` do not affect URLs — they organise code and apply different layouts.

## Database schema (40 migrations)

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
├── artwork/       # Artwork compliance actions + types (the spec side)
│   ├── actions.ts           # Job / component / release-to-production
│   ├── sub-item-actions.ts  # Sub-item CRUD + sign-off (the spec-bearing row)
│   ├── approval-actions.ts  # Token-based external client approval
│   ├── types.ts
│   └── utils.ts             # Pure helpers (tolerance, labels, release gaps)
├── production/    # Production pipeline actions (the fabrication tracker)
├── quoter/        # Signage quoter engine (CORE — tested)
│   └── engine/panel-letters-v1.ts   # Pricing engine for panel+letters shape
├── invoices/      # Invoice CRUD + line-item recalc
├── deliveries/    # Delivery CRUD + PoD token submission
├── purchase-orders/  # Supplier POs
├── clients/       # Client CRM (orgs + contacts + org_sites)
├── deliverables/  # Legacy client deliverables (kept for reference)
├── design-packs/  # Design pack generation
├── offers/        # Marketing offers (legacy)
├── auth.ts        # getUser, requireAuth, requireAdmin, requireSuperAdminOrError, isSuperAdmin
├── env.ts         # Startup env validation (Zod)
├── supabase.ts    # Browser Supabase client
├── supabase-server.ts  # Server Supabase client (RLS)
└── supabase-admin.ts   # Admin Supabase client — DANGER, gate every call site

components/
└── admin/         # Shared admin components (ContactPicker, SitePicker, OrgPicker)

supabase/
└── migrations/    # 40 sequential migrations as of 2026-04
```
