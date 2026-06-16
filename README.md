# Onesign Odysseus

Internal production management platform for **Onesign & Digital** — a signage and digital products agency in Team Valley, Gateshead. It replaces Clarity Go (a third-party production/workflow SaaS) with a bespoke, Onesign-owned system covering the whole journey from customer quote to signage delivery, plus an in-house **Studio** suite of parametric design + CAM tools.

Single-tenant and staff-only: clients are data records, not portal users. They interact through tokenised links (artwork sign-off, proof-of-delivery) and the public `/design` studio.

> **Orientation:** `ARCHITECTURE.md` for the route / schema / auth map · `CLAUDE.md` for the canonical workflow, conventions, and per-migration ledger · `TESTING.md` for the test layers.

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Supabase (Postgres + RLS + Realtime) · Tailwind CSS 4 · React Hook Form + Zod · React Three Fiber / three.js · jsPDF · Zustand · Vitest · hosted on Vercel.

## Getting started

```bash
npm install                    # install dependencies
cp .env.example .env.local     # then fill in your Supabase + Mapbox values
npm run dev                    # http://localhost:3000
```

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run lint` | ESLint |

Type-check with `npx tsc --noEmit` — it must be clean before pushing.

## Environment variables

Validated at startup in `lib/env.ts`, so a misconfigured deploy fails fast rather than crashing on first request.

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | for admin / service ops | Service-role key — **bypasses RLS**. Powers the unauth token flows and public `/design` submissions. Server-only; never expose to the browser |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | for the site map | Mapbox GL access token |
| `NEXT_PUBLIC_MAPBOX_STYLE` | optional | Override the default Mapbox style URL |

## Project layout

- `app/(portal)/` — authenticated staff portal (admin pipeline + Studio tools + shop floor)
- `app/(print)/` — print-optimised views for every printable record
- `app/design/`, `app/backshop/`, `app/sign-off/[token]/`, `app/production-sign-off/[token]/`, `app/delivery/[token]/` — top-level surfaces **outside** the portal: the public design studio, the workshop TV board, and the three token-gated unauth flows
- `lib/` — server actions + engines, one folder per domain (the quoter and Studio engines are pure and Vitest-covered)
- `supabase/migrations/` — 66 sequential SQL migrations (001–067; `031` intentionally absent)

See **ARCHITECTURE.md** for the full route tree, schema-by-domain, and auth model.

## The pipeline

```text
QUOTE → ARTWORK → PRODUCTION → DELIVERY
                               ↘ INVOICE (branches from quote acceptance)
```

Artwork is the spec-bearing record: **nothing enters production until artwork is signed off.** Every record from the quote onward inherits `org_id` + `contact_id` + `site_id`, set at the quote and overridable at each handoff. Full narrative in `CLAUDE.md`.

## Database & deployment

- **Database** — Supabase Postgres. All tables use RLS: super-admin access via `is_super_admin()`, org-scoped reads via `is_org_member()`. Migrations in `supabase/migrations/` apply in order.
- **Hosting** — Vercel (auto-deploy). DNS via Wix (`onesignanddigital.com`); subdomains CNAME to Vercel.

## Conventions

Server actions live in `lib/` and return `Result<T>` (`lib/result.ts`); inputs are `safeParse`d with Zod at the top of the action. Calculation-heavy logic gets Vitest coverage (see `lib/quoter/engine/` for the gold-standard pattern). User-facing UI says "client"; code and schema say "org". The full conventions list is in `CLAUDE.md`.
