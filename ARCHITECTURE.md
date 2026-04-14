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

## Database schema (23 migrations)

### Core portal (migrations 001–010)
- `marketing_leads` — legacy lead capture (no FK to orgs)
- `orgs` — client organisations
- `org_members` — user ↔ org membership with roles (member, admin, owner)
- `profiles` — user profiles with `role` field (`super_admin` for Onesign staff)
- `subscriptions` — org subscription management
- `deliverables` — client deliverables
- `client_assets` — uploaded client assets
- `reports` — client reports

### Architect leads (migration 011)
- `architect_leads` — architect-specific lead capture form submissions

### Signage quoter (migrations 012–013, 021–023)
- `pricing_sets` — versioned rate card sets
- `panel_prices`, `manufacturing_rates`, `illumination_profiles`, `letter_price_table` — pricing lookup tables
- `quotes` — quote headers with org, status, reference (OSD-YYYY-NNNNNN)
- `quote_items` — individual line items per quote
- `quote_audits` — audit trail for quote changes

### Design packs (migration 014)
- `design_packs`, `design_pack_sections` — printable brand design pack system

### Artwork compliance (migrations 015–020)
- `artwork_jobs` — artwork compliance jobs linked to orgs
- `artwork_component_items` — individual sign components within a job
- `artwork_component_types` — configurable component type definitions
- `artwork_lighting_specs` — lighting specification data
- `artwork_approvals` — approval workflow records with tokens

### Planned: Production pipeline
- `production_stages` — configurable stage definitions (Design, Print, Fabrication, Finishing, QC, Dispatch)
- `production_jobs` — jobs created from accepted quotes
- `job_items` — individual production cards per quote line item
- `job_stage_log` — audit trail of stage transitions
- `department_instructions` — notes attached to a job for a given stage/department

All tables use RLS with org-scoped policies.

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

## Artwork approval (`lib/artwork/` + `/approve/artwork/[token]`)

External artwork approval workflow:

1. Onesign creates an artwork job with component items via `/app/admin/artwork`
2. System generates a unique approval token
3. Client receives a link to `/approve/artwork/[token]` (no auth required — token-based access)
4. Client reviews component items and approves/rejects with comments
5. Approval status is tracked in `artwork_approvals`

In the production pipeline (Phase 1), artwork approval becomes a production stage — when a job enters the approval stage, the existing token flow triggers automatically.

## Key directories

```
lib/
├── artwork/       # Artwork compliance actions + types
├── deliverables/  # Deliverables logic
├── design-packs/  # Design pack generation
├── offers/        # Marketing offers data
├── quoter/        # Signage quoter engine (CORE — tested)
├── auth.ts        # Auth utilities (getUser, requireAuth, getUserOrg, isSuperAdmin)
├── supabase.ts    # Browser Supabase client
├── supabase-server.ts  # Server Supabase client (RLS)
└── supabase-admin.ts   # Admin Supabase client (bypasses RLS)

components/
└── admin/         # Shared admin components

supabase/
└── migrations/    # 23 sequential migrations
```
