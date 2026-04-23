# CLAUDE.md — Onesign Odysseus

## What this project is

Onesign Odysseus is the internal production management platform for **Onesign & Digital**, a signage and digital products agency based in Team Valley, Gateshead. It replaces Clarity Go (a third-party production/workflow SaaS at ~£55/user/month) with a bespoke, Onesign-owned system.

This codebase was cloned from `onesign-growth`, which started as a marketing lead capture wizard and evolved into a company portal with a quoter engine and artwork compliance workflow. The project was subsequently forked and renamed — first to `onesign-portal`, then rebranded to `onesign-odysseus`. The old `onesign-growth` repo is archived as a reference.

## Brand

- **Company:** Onesign & Digital
- **Accent colour:** `#4e7e8c` (muted steel teal)
- **Light variant:** `#e8f0f3`
- **Dark variant:** `#3a5f6a`
- **Dark UI backgrounds:** `#1a1f23`
- **Font:** System sans (Geist Sans is already configured)
- **Logo:** White Onesign mark on dark backgrounds; the logomark is a circle with a geometric "1" cutout

## Tech stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript (strict)
- **Database:** Supabase (PostgreSQL with RLS + Realtime)
- **Auth:** Supabase SSR auth with `@supabase/ssr`
- **Styling:** Tailwind CSS 4 (via `@tailwindcss/postcss`)
- **Forms:** React Hook Form + Zod validation
- **Icons:** Lucide React
- **Testing:** Vitest
- **Hosting:** Vercel
- **DNS:** Wix (onesignanddigital.com) — subdomains point via CNAME to Vercel

## Work flow

The canonical journey of a customer request through Odysseus:

```
QUOTE  ── line items describe the job; each line either makes something
  │      (production work) or is a service (fitting, removal, survey).
  │      Each line carries an inherited org_id + contact_id + site_id.
  │
  │ admin clicks "Accepted" → "Generate artwork"
  ▼
ARTWORK JOB  ── auto-generated skeleton. One artwork component per
  │            production-work line item, with sub-items pre-filled from
  │            the line item's structured spec (material, method, finish,
  │            dimensions, qty). Service lines skip artwork entirely.
  │            Designer uploads artwork files, verifies spec, gets client
  │            sign-off via /sign-off/[token] (per-component approve or
  │            request-changes + comment; legacy /approve/artwork/[token]
  │            redirects to the new slug).
  │
  │ admin clicks "Release to production"
  ▼
PRODUCTION JOB  ── items appear on the department Kanban. Each item
  │              routes through its sub-item's target departments
  │              (CNC / Vinyl / Fabrication / Assembly / etc.).
  │
  │ all items reach "Goods Out"
  ▼
DELIVERY  ── install address inherited from upstream. Proof-of-delivery
  │        via /delivery/[token] (driver signature + client signature).
  │
INVOICE (branches from quote acceptance, not gated on production)
```

**Inheritance chain.** Every record from quote onward carries `org_id`, `contact_id`, and `site_id`. The value is set at the quote, inherited automatically at each handoff, and overridable at any step (sometimes a specific job ships to a different site than the client's default). Downstream modules read *their own* record — most-recent edit wins.

**Pricing.** The `panel_letters_v1` engine still calculates automatically for the signage shape it was built for. Generic quote items carry manually-entered prices. New engines can be added per job type without blocking the flow.

## Project structure (post-cleanup target)

```
onesign-odysseus/
├── app/
│   ├── (portal)/              # ← Main authenticated app (was app/app/(portal))
│   │   ├── admin/             # Super-admin routes
│   │   │   ├── artwork/       # Artwork compliance management
│   │   │   ├── deliverables/  # Client deliverables admin
│   │   │   ├── design-packs/  # Printable design pack export
│   │   │   ├── jobs/          # ★ NEW — Production job board (Phase 1)
│   │   │   ├── leads/         # Marketing leads (legacy, kept for reference)
│   │   │   ├── orgs/          # Org/client management
│   │   │   ├── pricing/       # Rate card administration
│   │   │   ├── purchase-orders/ # ★ NEW — PO generation (Phase 2)
│   │   │   ├── quotes/        # Quote management
│   │   │   ├── reports/       # Cross-org reporting
│   │   │   └── subscriptions/ # Subscription management
│   │   ├── assets/            # Client asset management
│   │   ├── billing/           # Client billing view
│   │   ├── dashboard/         # Client org home
│   │   ├── deliverables/      # Client deliverables view
│   │   ├── reports/           # Client reports view
│   │   ├── settings/          # Org settings
│   │   └── layout.tsx         # Portal layout (sidebar + topbar)
│   ├── (marketing)/           # ← Marketing pages (was /growth + /architects)
│   │   ├── growth/            # Marketing landing + packages + enquiry wizard
│   │   └── architects/        # Architect lead capture wizard
│   │   ├── shop-floor/        # Shop-floor department queue (tablets)
│   │   └── layout.tsx         # Portal layout (sidebar + topbar)
│   ├── (print)/               # Print-specific layouts
│   ├── approve/               # External tokenised artwork approval
│   │   └── artwork/[token]/
│   ├── delivery/              # External tokenised proof-of-delivery
│   │   └── [token]/
│   ├── api/                   # API routes
│   ├── login/
│   ├── signup/
│   ├── components/            # Shared app-level components
│   ├── layout.tsx             # Root layout
│   ├── page.tsx               # Landing → redirect to /login or /app/admin
│   └── globals.css
├── components/
│   └── admin/                 # Shared admin components
├── lib/
│   ├── artwork/               # Artwork compliance + visual-approval actions + types
│   ├── clients/               # Org/client CRM actions
│   ├── deliverables/          # Deliverables logic
│   ├── deliveries/            # Proof-of-delivery flow
│   ├── design-packs/          # Design pack generation
│   ├── drivers/               # Driver roster (for deliveries)
│   ├── geo/                   # Postcode → lat/lng helpers (postcodes.io)
│   ├── invoices/              # Invoice generation from accepted quotes
│   ├── maintenance/           # Maintenance visits (surveys, inspections, repairs, cleaning)
│   ├── mapbox/                # Map rendering helpers
│   ├── offers/                # Marketing offers logic
│   ├── planning/              # Scheduling / planning helpers
│   ├── production/            # Production job + shop-floor actions
│   ├── purchase-orders/       # Supplier PO actions
│   ├── quoter/                # ★ Signage quoter engine (CORE — do not break)
│   │   ├── engine/            # Calculation engine with tests (panel_letters_v1 + generic items)
│   │   ├── actions.ts         # Server actions for quotes
│   │   ├── pricing-actions.ts # Pricing management
│   │   ├── rate-card.ts       # Rate card definitions
│   │   ├── types.ts           # TypeScript types
│   │   └── utils.ts
│   ├── auth.ts                # requireAuth / requireSuperAdminOrError / isSuperAdmin
│   ├── env.ts                 # Startup env validation (fail fast)
│   ├── icons.tsx              # Shared icon exports
│   ├── result.ts              # Shared Result<T> discriminated union for server actions
│   ├── supabase.ts            # Client-side Supabase
│   ├── supabase-server.ts     # Server-side Supabase
│   ├── supabase-admin.ts      # Admin/service-role Supabase
│   └── __mocks__/             # Vitest mocks (Supabase, etc.)
├── supabase/
│   └── migrations/            # 50 migrations — see "Database schema" section
├── public/
│   └── fonts/
├── CLAUDE.md                  # This file
├── ARCHITECTURE.md            # ★ NEW — Written during cleanup sprint
├── package.json               # name: "onesign-odysseus"
└── next.config.ts
```

## Database schema (50 migrations as of 2026-04)

Migration 031 is intentionally absent (numbering gap from an early draft that was folded into 030/032).

### Core portal (001–011)
| Migration | Tables | Purpose |
|-----------|--------|---------|
| 001 | `marketing_leads` | Legacy lead capture (orphaned — no FK to orgs). Keep but don't extend. |
| 002 | `orgs`, `org_members`, `subscriptions`, `deliverables`, `client_assets`, `reports` | Core portal data model with RLS |
| 003–010 | Various | RLS policies, signup flow, super-admin role, org-creation RPC |
| 011 | `architect_leads` | Architect-specific lead capture |

### Signage quoter (012–013, 014, 021–023, 026)
| 012–013 | `pricing_sets`, `panel_prices`, `manufacturing_rates`, `illumination_profiles`, `letter_price_table`, `quotes`, `quote_items`, `quote_audits` | Signage quoter engine with comprehensive Vitest coverage |
| 014 | `design_packs` | Printable design pack export |
| 021 | quote valid-until | Adds `valid_until` to quotes |
| 022 | lead conversion | Marketing-lead → org conversion path |
| 023 | subscription quote link | Ties subscriptions back to source quote |
| 026 | quote enhancements | contact_id/site_id, project_name, customer_reference |
| 041 | generic quote items | Quote items no longer restricted to `panel_letters_v1`; artwork inherits site + snapshot on approval |

### Artwork compliance (015–020, 029, 030, 032, 036–040, 043–046)
| 015–018 | `artwork_jobs`, `artwork_components`, `artwork_component_items`, `artwork_component_versions`, `artwork_production_checks`, `artwork_approvals` | Compliance workflow + external token-based client approval |
| 019 | cover image | `artwork_jobs.cover_image_url` for dashboards |
| 020 | panel size + paint colour | Extra spec fields for signage components |
| 029, 032 | fixes + types | Component-type enum extensions, approval sort-order fix |
| 030 | artwork ↔ production link | FK between `artwork_components` and production job items |
| 036–038 | org linkage + lineage view + CHECK constraint | Artwork jobs enforce `org_id OR is_orphan`; `artwork_job_lineage` view surfaces quote→production→artwork in one query |
| 039 | sub-item promotion | `artwork_component_items` gains material/method/finish/dimensions/target_stage_id/sign-off columns — spec-bearing row |
| 040 | per-sub-item thumbnails | Optional `thumbnail_url` per sub-item |
| 043 | visual approval | Second job flavour (`job_type = 'visual_approval'`) with mockup variants per component |
| 044 | one-production-per-visual | DB-level unique constraint closes race in `createProductionFromVisual` |
| 045 | approval comments | Free-text client feedback alongside signature |
| 046 | changes_requested status | Lets client request revisions without approving |
| 051 | per-component decisions | `artwork_component_decisions` table — client approves each component individually or requests changes with a per-line comment; overall approval status derived |

### Production pipeline (024–025, 028, 042)
| 024 | `production_stages`, `production_jobs`, `job_items`, `job_stage_log`, `department_instructions`, `work_centres` | Kanban + shop-floor infrastructure |
| 025 | fixes | Production pipeline corrections |
| 028 | real departments + work centres | Seeded with actual Onesign departments |
| 042 | shop-floor problem reports | Escape-hatch table; any authed user can raise, super-admin resolves |

### Purchase orders, invoices, deliveries, CRM (027, 033–035, 047–050)
| 027 | `purchase_orders`, `po_items` | Supplier PO generation |
| 033 | `invoices`, `invoice_items` | Invoice generation from accepted quotes |
| 034 | `contacts`, `org_sites` | Client CRM records; adds contact_id+site_id FKs across pipeline |
| 035 | `deliveries`, `delivery_items` | Proof-of-delivery flow with token URLs |
| 047 | org_sites geocoding | Nullable `lat`/`lng` populated via postcodes.io for site map |
| 048 | `maintenance_visits` | Surveys, inspections, repairs, cleaning |
| 049 | `drivers` | Driver roster |
| 050 | deliveries.driver_id | Links deliveries to drivers (ON DELETE SET NULL) |

## Key architectural decisions

### 1. Artwork is the spec-bearing record — it comes *before* production
Earlier drafts of this project modelled artwork approval as a stage inside the production pipeline. The current model reverses that: **nothing enters production until artwork is signed off.** On quote acceptance, each production-work line item auto-generates a skeleton artwork component (type + name + sub-items with material/method/finish/dimensions already populated from the quote). The designer's job is to verify, upload artwork files, and sign off — not to retype the spec.

Only after the client approves the artwork and staff click "Release to production" do the job_items appear on the department Kanban. The artwork module is therefore the authoritative specification; the production module is the fabrication tracker derived from it. Service-only line items (fitting, removal, site surveys) skip artwork and go straight to delivery/invoicing.

Under the hood, production_jobs are still created at quote acceptance time (the schema hasn't been inverted). The difference is entirely in the user-facing flow and the narrative: artwork is the first thing staff touch after a quote accepts, and the Kanban surface for the production team only becomes relevant once artwork releases.

### 2. Shop floor has its own minimal layout (inside the portal route group)
`/shop-floor` lives under `app/(portal)/shop-floor/` — it's authenticated like the rest of the portal but the route segment owns its own layout with no sidebar or admin nav. Large touch targets for Start, Pause, Complete. Staff log in and see only their department's queue. Runs on shop-floor tablets. (Earlier drafts put this at the app root as a separate route group; the current placement keeps auth/session behaviour consistent with the rest of the staff-only UI.)

### 3. Single-tenant internal platform — clients are records, not users

Onesign Odysseus is used **only by Onesign & Digital staff** to run the internal production pipeline. It is not a customer-facing portal. The businesses Onesign does work for never log in here — they interact with Onesign via email, the tokenised artwork sign-off links at `/sign-off/[token]` (legacy `/approve/artwork/[token]` redirects), and proof-of-delivery links at `/delivery/[token]`.

Terminology:
- **Client** — the external business Onesign does signage work for (Persimmon, Balfour, SKS Construction, Slick Construction, etc.). A client is a data record, not a portal user.
- **Org** — the database-level term for a client. The `orgs` table, `org_id` foreign keys, and `org_members` linkage all exist because this codebase was forked from a multi-tenant SaaS. In Odysseus, "org" and "client" refer to the same entity. **User-facing UI says "client"; code and schema say "org".** Do not introduce new "Organisation" wording in the UI — if you see it, rename it to "client".
- **org_members** — kept for historical reasons; in Odysseus it only holds Onesign staff assigned to a client. Clients themselves have no portal accounts.

The previously-planned external client portals (persimmon-fulfillment, balfour-fulfilment, sks-construction, slick-construction) are no longer on the roadmap. Any lingering multi-tenancy hooks (subdomain middleware, `sector_config`, etc.) are dormant infrastructure — leave them alone unless a task explicitly calls for removal.

### 4. External integrations stay external
HubSpot handles CRM/sales. Sage 50c handles accounting. This platform handles production, quoting, artwork, and delivery. Don't rebuild what external tools do better.

### 5. Booking OS is deprecated
The `/admin/booking` module (287K of code) was experimental and is not part of Onesign Odysseus. It should be removed during the cleanup sprint.

## What was removed from onesign-growth

- **Booking OS** (`app/app/(portal)/admin/booking/`) — experimental booking system, not relevant
- **Root boilerplate** (`app/page.tsx`) — was still the Next.js create-next-app template
- **`app/app/` double-nesting** — flattened to `app/(portal)/`

## Build plan — current state

### Shipped
- **Production job board** (`/admin/jobs`) with Kanban across real Onesign departments, shop-floor queue at `/shop-floor`
- **Quote → production handoff** (`createJobFromQuote`) with item-level stage routing
- **Artwork compliance module** with sub-items, per-sub-item sign-off, release-to-production flow rebuilding `stage_routing` from signed-off sub-items
- **Visual approval flow** (migrations 043–046) — second artwork-job flavour carrying mockup variants; DB-level "one production job per visual" constraint; client comments + changes-requested status
- **Purchase orders, invoices, deliveries** — full CRUD + print views
- **Client CRM** — `orgs` + `contacts` + `org_sites` with primary / billing / site / delivery address flags; site geocoding via postcodes.io (migration 047)
- **Maintenance visits** (migration 048) — surveys, inspections, repairs, cleaning
- **Drivers + delivery assignment** (migrations 049–050)
- **Generic quote items + artwork skeletons** (migration 041) — quote items no longer limited to `panel_letters_v1`; each production-work line item auto-generates an artwork component skeleton on acceptance. Service items (fitting, removal) skip artwork and go to delivery/invoicing.
- **Backend hardening** — Zod validation across 6+ server-action modules, error boundaries, startup env validation, super-admin gate on high-risk mutations, typed `Result<T>` discriminated union in `lib/result.ts` for server-action returns
- **Artwork QoL** — sub-item thumbnails with hover-zoom, component reorder, status override, delete with typed-reference confirmation, per-sub-item spec on client approval page

### In flight
- **`Result<T>` migration** — new server-action code uses the typed discriminated union from `lib/result.ts`; legacy `any`-typed returns are being retired module by module.
- **Supabase test mocks** — shared factory in `lib/__mocks__/supabase.ts` enables Vitest coverage of server actions without hitting live DB; rollout ongoing.

### Deferred
- **Email sending** (Resend wiring) — hook points exist in deliverables, leads, reports, and the approval flow; needs API key
- **Sentry / observability** — error boundaries ready; DSN not provisioned
- **Integration tests against live Supabase** — needs a dedicated test project
- **AI artwork extraction** — scoped in `docs/artboard-template-example.html` / `docs/artboard-component-card-template.html`; standardised card template ready for Davey to trial
- **Sage 50c invoice push, HubSpot contact sync** — downstream integrations; separate infra work

## Clarity Go audit results (30 March 2026)

Features ticked as "need now": 20
Features circled as "future use": 22
Features left empty (skip): 20

### Critical sections:
- **Production / job board**: 7 of 8 ticked — this IS the product
- **Quoting & estimating**: 6 ticked — core daily workflow
- **Purchase orders**: 2 ticked — actively used
- **Sales management**: 0 of 7 — entirely handled by HubSpot
- **Reporting**: 0 of 2 — not using Clarity for this

## Conventions

- All new tables use RLS with org-scoped policies matching the existing pattern
- Auto-generated references follow the `OSD-YYYY-NNNNNN` pattern for quotes, `AWC-YYYY-NNNNNN` for artwork jobs, `PO-YYYY-NNNNNN` for purchase orders, `INV-YYYY-NNNNNN` for invoices
- Server actions in `lib/` directories, not inline in page files
- Supabase client via `lib/supabase-server.ts` (server components) or `lib/supabase.ts` (client components)
- Use `lib/supabase-admin.ts` (service role) only for operations that bypass RLS, and always gate on `requireSuperAdminOrError()` from `lib/auth.ts`
- Form validation with Zod schemas; server actions `safeParse` their input at the top of the function, returning `err(issue.message)` on failure
- Server actions return `Result<T>` from `lib/result.ts` — a discriminated union `{ ok: true; data: T } | { ok: false; error: string }` built with the `ok()` / `err()` helpers. Prefer this over the legacy `{ error }` / `any` shape for all new actions
- Tests with Vitest for calculation-heavy logic (see `lib/quoter/engine/` for pattern). For server actions, prefer the `lib/__mocks__/supabase.ts` factory over hitting a live DB; reserve live-Supabase smoke tests for end-to-end handoff coverage (see `TESTING.md`)
- Artwork is the spec-bearing record, production is the fabrication tracker — when adding a new job-related feature, ask "does this belong on the artwork side (what we're making) or the production side (who's working on it)?"
- `org_id` + `contact_id` + `site_id` are inherited at every downstream handoff (quote → artwork → production_job → delivery). Each record owns its own values and can be overridden. Downstream readers use the record-in-hand's values, never reach through to the parent

## GitHub

- **Repo:** `PeacockIllustrated/onesign-odysseus`
- **Branch:** `master`
- **Original repo:** `PeacockIllustrated/onesign-growth` (archived reference)
