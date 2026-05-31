# Onesign Odysseus

## What it is
**The internal production management platform for Onesign & Digital** (Team Valley, Gateshead) — the signage and digital-products agency. Odysseus replaces a third-party SaaS (Clarity Go, ~£55/user/month) with a bespoke, Onesign-owned system that runs the end-to-end production pipeline.

It is **single-tenant and staff-only**. Clients (Persimmon, Balfour, SKS, Slick, etc.) are records in the system, not users — they interact via email and two tokenised public links: artwork sign-off and proof-of-delivery.

## The workflow it runs

```
QUOTE → ARTWORK JOB → PRODUCTION JOB → DELIVERY
                    └→ INVOICE (branches from quote acceptance)
```

- **Quote** — line items (make-something *or* service), structured spec per line, signage quoter engine (`panel_letters_v1`) plus generic items.
- **Artwork** — auto-generated skeleton on quote acceptance. Artwork is the **spec-bearing record**; nothing enters production until the client signs off via `/sign-off/[token]`.
- **Production** — department Kanban (CNC, Vinyl, Fabrication, Assembly, Goods Out) + shop-floor tablet queue with big touch targets.
- **Delivery** — proof-of-delivery via `/delivery/[token]` (driver + client signature).
- **Invoice** — generated from the accepted quote, independent of production progress.

## Key features
- Quote engine with signage-specific pricing + rate cards + generic items
- Artwork compliance module with per-sub-item sign-off and "release to production"
- **Visual approval flow** (mockup variants, client comments, changes-requested status)
- Production job board (Kanban) + shop-floor queue with problem-report escape hatch
- Purchase orders, invoices, deliveries — full CRUD + print views
- Client CRM (orgs, contacts, sites with primary/billing/site/delivery flags)
- Site geocoding via postcodes.io + Mapbox rendering
- Maintenance visits (surveys, inspections, repairs, cleaning)
- Driver roster + delivery assignment
- Reference numbering: `OSD-YYYY-NNNNNN`, `AWC-…`, `PO-…`, `INV-…`

## Tech stack
Next.js 16 (App Router) · React · TypeScript strict · Tailwind CSS 4 (`@tailwindcss/postcss`) · Supabase (Postgres + RLS + Realtime + SSR auth via `@supabase/ssr`) · React Hook Form + Zod · Lucide icons · Vitest · Vercel · Wix DNS (onesignanddigital.com subdomains → CNAME to Vercel).

## Architecture principles
- **Artwork before production.** Artwork module holds the spec; production is the fabrication tracker derived from it.
- **Inheritance chain.** `org_id` + `contact_id` + `site_id` carried quote → artwork → production → delivery, overridable at any step, record-in-hand wins.
- **Tokenised public routes must stay unauth** (`/sign-off/[token]`, `/delivery/[token]`) — service-role client, no `getUser()`, no middleware gate.
- **Terminology:** UI says "client", code/schema says "org".
- **Typed `Result<T>` discriminated union** for server-action returns (`ok()` / `err()` helpers in `lib/result.ts`).
- External integrations (HubSpot CRM, Sage 50c accounting) stay external.

## Database
~50 Postgres migrations across quoting, artwork, production, POs, invoices, deliveries, CRM, maintenance, drivers — all RLS-scoped.

---

## Brand identity

### Palette — "Monochrome & Structured"
| Token | Hex / HSL | Role |
|-------|-----------|------|
| Background | `#FFFFFF` (0 0% 100%) | Page background |
| Foreground | `#000000` (0 0% 0%) | Body text / primary action fill |
| Surface 50 | `hsl(0 0% 98%)` | Faintest surface tint |
| Surface 100 | `hsl(0 0% 95%)` | Card hover / muted fill |
| Surface 200 | `hsl(0 0% 90%)` | Borders / dividers |
| Surface 300 | `hsl(0 0% 80%)` | Secondary text / icons |
| **Brand accent** | **`#4e7e8c`** | **Muted steel teal — the single accent** |
| Accent light | `#e8f0f3` | Tinted highlight / selection / option hover |
| Accent dark | `#3a5f6a` | Pressed / deep accent |
| Dark UI bg | `#1a1f23` | Dark surfaces where used |

### Typography
**Gilroy** (local font, `public/fonts/`) — Light 300 / Regular 400 / Medium 500 / Bold 700 / Heavy 900. Used for both headings and body. Headings: `letter-spacing: -0.02em`, weight 700.

### Design language
- **Monochrome, structured, editorial.** Pure black on pure white, with a single muted-teal accent — the opposite of Lynx's dark glow and Persimmon's airy green retail.
- **Sharp radii** — `--radius-sm: 2px`, `--radius-md: 4px`, `--radius-lg: 8px`. No rounded-2xl frivolity; tight, architectural corners.
- **Buttons:**
  - **Primary** — solid black fill, white text, 2px radius, hover `#262626`, focus uses a double-ring (`0 0 0 2px #fff, 0 0 0 4px #000`).
  - **Secondary** — white fill, black text, 1px `#e5e5e5` border.
- **Cards** — white, 1px `#e5e5e5` border, 4px radius, `0 1px 2px rgb(0 0 0 / 0.05)` shadow.
- **Badges** — pill (fully rounded), `#f5f5f5` fill, neutral-800 text.
- **Selection highlight + focus rings + select-option hover** all use teal (`#4e7e8c` / `#e8f0f3`) — the accent is reserved for *state*, not decoration.
- **Logo** — white Onesign mark on dark backgrounds; logomark is a circle with a geometric "1" cutout.
- Motion: minimal — 150ms ease transitions; slide-in sidebar (200ms), fade-out presentation mode.

### Section-styling suggestion for the brochure
Treat the Odysseus section as the **editorial, no-nonsense** entry in the lineup. Pure white background, pure black Gilroy headlines (tight `-0.02em` tracking, weight 700/900), black-on-white cards with 1px neutral-200 borders and 2–4px radii, and **`#4e7e8c` steel teal** used sparingly — only on accents, links, selection states, or a single underline/pill. Consider one high-contrast black-fill CTA block to carry the "production platform, not a marketing site" tone. For a dark hero variation, swap to `#1a1f23` with white type and the same teal accent.

---

**Source repo:** `C:\Users\peaco\OneDrive\Creative Cloud Files\Documents\GitHub\onesign-odysseus`
**Key files referenced:** `CLAUDE.md`, `app/globals.css`, `app/layout.tsx`, `ARCHITECTURE.md`
