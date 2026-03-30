# CLAUDE.md — Onesign Portal

## What this project is

Onesign Portal is the internal production management platform for **Onesign & Digital**, a signage and digital products agency based in Team Valley, Gateshead. It replaces Clarity Go (a third-party production/workflow SaaS at ~£55/user/month) with a bespoke, Onesign-owned system.

This codebase was cloned from `onesign-growth`, which started as a marketing lead capture wizard and evolved into a company portal with a quoter engine and artwork compliance workflow. The project has been deliberately forked and renamed to `onesign-portal` to reflect its actual purpose. The old `onesign-growth` repo is archived as a reference.

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

## Project structure (post-cleanup target)

```
onesign-portal/
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
│   ├── (print)/               # Print-specific layouts
│   ├── approve/               # External tokenised artwork approval
│   │   └── artwork/[token]/
│   ├── shop-floor/            # ★ NEW — Shop floor department queue (Phase 1)
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
│   ├── artwork/               # Artwork compliance actions + types
│   ├── deliverables/          # Deliverables logic
│   ├── design-packs/          # Design pack generation
│   ├── offers/                # Marketing offers logic
│   ├── quoter/                # ★ Signage quoter engine (CORE — do not break)
│   │   ├── engine/            # Calculation engine with tests
│   │   ├── actions.ts         # Server actions for quotes
│   │   ├── pricing-actions.ts # Pricing management
│   │   ├── rate-card.ts       # Rate card definitions
│   │   ├── types.ts           # TypeScript types
│   │   └── utils.ts
│   ├── auth.ts
│   ├── supabase.ts            # Client-side Supabase
│   ├── supabase-server.ts     # Server-side Supabase
│   └── supabase-admin.ts      # Admin/service-role Supabase
├── supabase/
│   └── migrations/            # 21 existing + new production pipeline migrations
├── public/
│   └── fonts/
├── CLAUDE.md                  # This file
├── ARCHITECTURE.md            # ★ NEW — Written during cleanup sprint
├── package.json               # name: "onesign-portal"
└── next.config.ts
```

## Database schema (21 migrations)

### Existing tables (DO NOT modify without good reason)

| Migration | Tables | Purpose |
|-----------|--------|---------|
| 001 | `marketing_leads` | Legacy lead capture (orphaned — no FK to orgs). Keep but don't extend. |
| 002 | `orgs`, `org_members`, `subscriptions`, `deliverables`, `client_assets`, `reports` | Core portal data model with RLS |
| 003-010 | Various fixes | RLS policies, signup flow, super admin role, org creation RPC |
| 011 | `architect_leads` | Architect-specific lead capture |
| 012-013 | `pricing_sets`, `panel_prices`, `manufacturing_rates`, `illumination_profiles`, `letter_price_table`, `quotes`, `quote_items`, `quote_audits` | Signage quoter engine — the most complex module |
| 014 | `design_packs`, `design_pack_sections` | Printable design pack system |
| 015-021 | `artwork_jobs`, `artwork_component_items`, `artwork_component_types`, `artwork_lighting_specs`, `artwork_approvals` | Artwork compliance + external approval workflow |

### New tables to build (Phase 1 of build plan)

| Table | Purpose |
|-------|---------|
| `production_stages` | Configurable stage definitions: Design, Print, Fabrication, Finishing, Artwork Approval, QC, Dispatch |
| `production_jobs` | A job created from an accepted quote. Tracks status, priority, assignee, due date |
| `job_items` | Individual production cards per quote line item — each can be at a different stage |
| `job_stage_log` | Audit trail of every stage transition: who, when, notes. Powers turnaround analytics |
| `department_instructions` | Specific notes attached to a job for a given stage/department |

## Key architectural decisions

### 1. Artwork approval is a production stage, not a standalone module
The Clarity audit explicitly requested "Internal Artwork Approval (Job board)" — artwork sign-off becomes a stage in the Kanban pipeline. When a job enters this stage, the existing tokenised approval flow at `/approve/artwork/[token]` triggers. When approved, the job auto-advances.

### 2. Shop floor is a standalone route, not inside the portal
`/shop-floor` is a separate route with its own minimal layout — no sidebar, no admin nav. Large touch targets for Start, Pause, Complete. Staff log in and see only their department's queue. This runs on shop floor tablets.

### 3. Multi-tenant monolith
This codebase will eventually consolidate the separate client portals (persimmon-fulfillment, balfour-fulfilment, sks-construction, slick-construction) as configured tenants. Each client becomes an org with a `sector_config` driving branding, enabled modules, and client-specific behaviour. Subdomain resolution via middleware. This is future work but influences schema design now.

### 4. External integrations stay external
HubSpot handles CRM/sales. Sage 50c handles accounting. This platform handles production, quoting, artwork, and delivery. Don't rebuild what external tools do better.

### 5. Booking OS is deprecated
The `/admin/booking` module (287K of code) was experimental and is not part of Onesign Portal. It should be removed during the cleanup sprint.

## What was removed from onesign-growth

- **Booking OS** (`app/app/(portal)/admin/booking/`) — experimental booking system, not relevant
- **Root boilerplate** (`app/page.tsx`) — was still the Next.js create-next-app template
- **`app/app/` double-nesting** — flattened to `app/(portal)/`

## Build plan phases

### Phase 1: Production job board (Weeks 1–3) — CLARITY CANCELLATION MILESTONE
- New migrations for production_stages, production_jobs, job_items, job_stage_log, department_instructions
- `/admin/jobs` — Kanban WIP view (6 stages: Design → Print → Fabrication → Finishing → QC → Dispatch)
- `/shop-floor` — Department queue with start/stop/complete actions
- Artwork approval as a production stage
- Quote → job conversion flow
- Supabase Realtime for live progress

### Phase 2: Quoting enhancements + purchase orders (Weeks 4–5)
- Quick quote simplified route
- Branded PDF quote templates (ReportLab)
- Bespoke pricing templates
- RRP / discount pricing
- Purchase orders module with auto-generated PO references

### Phase 3: Deliveries + invoicing (Weeks 6–8)
- Delivery scheduling with driver assignment
- Proof of delivery (mobile camera + signature — modelled on NHS survey app pattern)
- Invoice generation from accepted quotes
- Partial/staged invoicing

### Phase 4: Integrations + polish (Weeks 9–10)
- Sage 50c invoice push
- HubSpot contact sync
- Auto-generated stage notification emails
- Client portal enhancements

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
- Auto-generated references follow the `OSD-YYYY-NNNNNN` pattern for quotes, `PO-YYYY-NNNNNN` for purchase orders, `INV-YYYY-NNNNNN` for invoices
- Server actions in `lib/` directories, not inline in page files
- Supabase client via `lib/supabase-server.ts` (server components) or `lib/supabase.ts` (client components)
- Use `lib/supabase-admin.ts` (service role) only for operations that bypass RLS
- Form validation with Zod schemas
- Tests with Vitest for calculation-heavy logic (see `lib/quoter/engine/` for pattern)

## GitHub

- **Repo:** `PeacockIllustrated/onesign-portal`
- **Branch:** `master`
- **Original repo:** `PeacockIllustrated/onesign-growth` (archived reference)
