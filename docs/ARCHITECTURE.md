# OneSign Portal — Architecture

## What This Is

A multi-org client portal for **Onesign**, a signage company. The application serves three functions:

1. **Marketing Capture** — anonymous lead generation wizard for prospective clients
2. **Client Portal** — org-scoped workspace where clients view deliverables, reports, and assets
3. **Signage Production** — internal tools for quoting signage jobs and managing artwork compliance through to production sign-off

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.1.1 (App Router) |
| Language | TypeScript 5.9 |
| UI | React 19, Tailwind CSS 4, Gilroy font |
| Database | Supabase (PostgreSQL) with SSR client |
| Auth | Supabase Auth, RLS everywhere |
| Forms | React Hook Form + Zod 4 |
| Tests | Vitest |
| Hosting | Vercel |

## Functional Layers

```
Anonymous visitors          Authenticated org members       Super-admins (Onesign staff)
       │                            │                               │
  /growth/*                    /app/dashboard                  /app/admin/*
  /architects                  /app/deliverables               /app/admin/quotes
       │                       /app/reports                    /app/admin/artwork
       │                       /app/assets                     /app/admin/pricing
       │                       /app/billing                    /app/admin/leads
       │                       /app/settings                   /app/admin/orgs
       │                                                       /app/admin/design-packs
       │                                                       /app/admin/booking
       │                                                            │
  marketing_leads ──(gap)──▶ orgs + subscriptions              quotes, artwork_jobs
```

The gap between marketing capture and org creation is a known hole — leads are collected but there is no automated conversion flow yet (see migration 022 for the bridge).

## Database Schema

### Marketing (migration 001)

- `marketing_leads` — anonymous enquiry form submissions. Stores contact info, company, selected package/accelerators. Anon-insertable via RLS.

### Portal Core (migration 002)

- `orgs` — client organisations
- `org_members` — links users to orgs with role (`owner` | `admin` | `member`)
- `subscriptions` — retainer packages per org (`launch` | `scale` | `dominate`)
- `subscription_accelerators` — add-on services per org
- `deliverables` — monthly work items scoped to org
- `deliverable_updates` — comment thread on deliverables
- `client_assets` — uploaded files per org
- `reports` — monthly PDF reports per org

### Quoter Engine (migration 012)

All tables scoped by `pricing_set_id` (only one set can be `active` at a time):

- `pricing_sets` — versioned rate cards (draft → active → archived)
- `panel_prices`, `panel_finishes` — material + sheet size costs
- `manufacturing_rates` — labour rates per task
- `illumination_profiles`, `transformers`, `opal_prices` — LED/lighting costs
- `consumables` — key-value cost store
- `letter_price_table`, `letter_finish_rules` — built-up lettering costs
- `quotes` — auto-numbered `OSD-YYYY-000001`, status: draft → sent → accepted/rejected/expired
- `quote_items` — line items with JSONB input/output snapshots

### Artwork Compliance (migrations 015–021)

- `artwork_jobs` — auto-numbered `AWC-YYYY-000001`, tracks overall job status
- `artwork_components` — panel/vinyl/acrylic/push-through items within a job
- `artwork_component_items` — extra items (B, C, D…) per component
- `artwork_component_versions` — append-only design history
- `artwork_production_checks` — audit log for measurement/quality checks
- `artwork_approvals` — client sign-off via shareable token-gated links with e-signature

### Architect Leads (migration 011)

- `architect_leads` — separate lead capture for architect referral programme

### Design Packs (migration 014)

- `design_packs`, `design_pack_items` — curated sets of design references

## Route Structure

```
app/                           ← Next.js app directory
├── (print)/                   ← print-optimised layouts (no auth chrome)
│   └── admin/
│       ├── artwork/[id]/print         ← artwork job print sheet
│       ├── artwork/[id]/[cId]/print   ← component print sheet
│       ├── quotes/[id]/print          ← quote print sheet
│       ├── quotes/[id]/client         ← client-facing quote preview
│       └── design-packs/[id]/export   ← design pack export
│
├── app/                       ← main portal (authenticated)
│   ├── (portal)/
│   │   ├── admin/             ← super-admin area
│   │   │   ├── artwork/       ← artwork compliance CRUD
│   │   │   ├── booking/       ← booking module
│   │   │   ├── design-packs/  ← design pack management
│   │   │   ├── leads/         ← marketing lead list
│   │   │   ├── orgs/          ← org management
│   │   │   ├── pricing/       ← pricing set editor
│   │   │   ├── quotes/        ← quoter
│   │   │   ├── reports/       ← report management
│   │   │   ├── subscriptions/ ← subscription management
│   │   │   └── deliverables/  ← deliverable management
│   │   ├── dashboard/         ← client dashboard
│   │   ├── deliverables/      ← client deliverable view
│   │   ├── reports/           ← client report view
│   │   ├── assets/            ← client asset view
│   │   ├── billing/           ← client billing
│   │   └── settings/          ← user settings
│   └── components/            ← shared UI components
│
├── approve/artwork/[token]/   ← public artwork approval (token-gated)
├── architects/                ← architect referral page
├── growth/                    ← marketing pages + enquiry wizard
├── login/                     ← auth
└── signup/                    ← auth
```

Note: the `app/app/` double nesting is a quirk from the initial scaffold. It is intentional — do not flatten it.

## Role Hierarchy

```
super_admin          ← Onesign staff. Full system access. Bypasses all org-scoped RLS.
  └── org owner      ← Created when an org is set up. Can manage org settings + members.
       └── org admin ← Can manage deliverables, members within their org.
            └── org member ← Read-only access to org deliverables, reports, assets.
                 └── anon  ← Can submit marketing leads and view public pages.
```

RLS helper functions:
- `is_super_admin()` — checks `profiles.role = 'super_admin'`
- `is_org_admin(org_id)` — checks membership with `owner` or `admin` role
- `is_org_member(org_id)` — checks any membership

## How Quoter and Artwork Connect to Orgs

Currently, both the quoter and artwork modules are **super-admin-only internal tools** with no direct org link:

- **Quotes** have a `client_name` / `client_email` text field but no FK to `orgs`. A quote can exist independently of any org (transactional clients). Migration 023 adds an optional `subscription_id` FK for retainer clients.
- **Artwork jobs** have a `client_name` text field and an approval flow with external token-gated links, but no FK to `orgs`.

This means org members cannot currently see their own quotes or artwork jobs in the portal — they are managed entirely from the admin side.

## Known Gaps

1. **Lead conversion** — `marketing_leads` are collected but there is no flow to convert a lead into an org + subscription. Migration 022 adds the `convert_lead_to_org()` RPC to bridge this.
2. **Subscription vs quote ambiguity** — retainer clients have subscriptions; transactional clients get standalone quotes. The relationship between these two models is not formalised. Migration 023 adds an optional `subscription_id` on quotes.
3. **No client-facing quote/artwork views** — org members cannot see quotes or artwork jobs from their portal. The only client touchpoint is the public artwork approval link.
4. **No billing integration** — the billing page exists but has no payment provider connection.
