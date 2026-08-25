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
│   │   │   ├── nesting/       # ★ NEW — Acrylic nesting tool (SVG → packed sheets)
│   │   │   ├── orgs/          # Org/client management
│   │   │   ├── pricing/       # Rate card administration
│   │   │   ├── purchase-orders/ # ★ NEW — PO generation (Phase 2)
│   │   │   ├── quotes/        # Quote management
│   │   │   ├── reports/       # Cross-org reporting
│   │   │   ├── schedule/      # ★ NEW — Live fitting schedule (week/month/year board)
│   │   │   └── subscriptions/ # Subscription management
│   │   ├── assets/            # Client asset management
│   │   ├── billing/           # Client billing view
│   │   ├── dashboard/         # Client org home
│   │   ├── deliverables/      # Client deliverables view
│   │   ├── reports/           # Client reports view
│   │   ├── settings/          # Org settings
│   │   ├── shop-floor/        # Shop-floor department queue (tablets; own minimal layout)
│   │   ├── components/        # Portal components (Sidebar, Topbar, ui/)
│   │   └── layout.tsx         # Portal layout (sidebar + topbar)
│   │   # NOTE: the old (marketing) group (/growth + /architects wizards) has been
│   │   # removed; only the legacy architect-leads / leads API endpoints remain.
│   ├── schedule/tv/           # ★ NEW — Workshop TV view of the schedule (read-only)
│   ├── fitting-board/         # Legacy redirect → /schedule/tv
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
│   ├── nesting/               # Acrylic nesting: SVG → pieces (islands kept) → raster BLF engine in a Web Worker → SVG/DXF/PDF
│   ├── offers/                # Marketing offers logic
│   ├── planning/              # Scheduling / planning helpers
│   ├── production/            # Production job + shop-floor actions
│   ├── purchase-orders/       # Supplier PO actions
│   ├── realtime/              # Shared useRealtimeStatus hook (live / connecting / down)
│   ├── schedule/              # ★ NEW — Fitting schedule: crew resolution, date maths, actions
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
│   └── migrations/            # 66 migrations — see "Database schema" section
├── public/
│   └── fonts/
├── CLAUDE.md                  # This file
├── ARCHITECTURE.md            # ★ NEW — Written during cleanup sprint
├── package.json               # name: "onesign-odysseus"
└── next.config.ts
```

## Database schema (66 migrations as of 2026-06; numbered to 067)

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

### Artwork compliance (015–020, 029, 030, 032, 036–040, 043–046, 051, 053–054)
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
| 053 | per-sub-item decisions | `artwork_component_decisions` gains `sub_item_id` — each sub-item is a design variant the client approves (or tweaks) individually; two partial unique indexes let per-sub-item and whole-component decisions coexist |
| 054 | approved-with-feedback | Approve + a comment is not a clean sign-off: the 052 notifications trigger reads `client_comments` and upgrades the event to `severity='urgent'` ("read the feedback") |

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

### Notifications, external orders, production sign-off (052, 055–057)
| 052 | `notifications` + Realtime triggers | Persisted dashboard "Needs Attention" feed. Triggers on `artwork_approvals` (→ approved / changes_requested) and `shop_floor_flags` (→ open) insert a row; dismiss state survives sessions; Realtime-published |
| 055 | `external_orders` | Unified inbox for orders placed via external Onesign apps (Persimmon, Mapleleaf, onesign-lynx shop). Raw payload preserved; staff acknowledge then convert / complete / cancel — never auto-converted |
| 056 | Persimmon live | Adds `psp_orders` to the Realtime publication + a SECURITY DEFINER trigger that drops a `notifications` row on each new Persimmon order; surfaced at `/admin/external-orders` |
| 057 | production sign-off | `artwork_production_approvals` (64-hex token) backs the unauth `/production-sign-off/[token]` surface — Chris / John tick each sub-item before release, separate from the designer UI (same token-as-gate invariant as §3) |

### Visualiser + backshop screen + public studio (058–060)
| 058 | `visualiser_designs` | Saved folded-aluminium panel visualiser designs (params_json + flattened aperture SVG) |
| 059 | `backshop_items` + `backshop` storage bucket | Workshop TV production board — snapshot of a pushed design (name / specs / 3D thumbnail / reference PDF) plus contextual production check gates. Base gates Designed / Cut / Painted / Assembled, plus Push-through / Vinyl / Illumination / Stood-off when the design's construction has them (the keys present in `checks` ARE the item's stages). Realtime-published; PDF in the private `backshop` bucket |
| 060 | `design_requests` (+ `design_request_number_seq`) | Inbound leads from the PUBLIC `/design` studio — a customer's PanelParams + flattened SVG + face-on PNG thumbnail plus their contact details. `DSR-YYYY-NNNNNN` reference via trigger (same pattern as invoices). Status enum `new/reviewing/quoted/won/closed` (`quoted` is the future Stripe-package hook). Super-admin-only RLS; public submissions are written by a service-role server action (no anon policy), mirroring the tokenised approval/delivery pattern. Nullable `design_id` links to a promoted `visualiser_designs` row. Realtime-published for a live admin inbox |

### Site surveys + production packs (061–063)
| 061 | `site_surveys`, `survey_items`, `survey_photos` | Digitised on-site measure-up (ref `SVY-YYYY-NNNNNN`). Sits UPSTREAM of a quote, so `org_id`/`site_id`/`contact_id` are nullable (free-text `client_name`/`site_address` fallbacks) plus an optional `maintenance_visit_id` link; photos live in a private `site-surveys` bucket via the service role |
| 062 | survey photo size | Photo-first survey UX: per-photo real-world `sign_width_mm`/`sign_height_mm` (mm) alongside image pixel dims used to align the annotation overlay; no structured per-item measurement form |
| 063 | `production_packs` | Block-based JSONB works-pack builder (à la `design_packs`) for detailed, on-brand internal build documents. Standalone in v1; soft `linked_quote_id`/`linked_artwork_job_id` seams (no FK) for a later wire-up |

### Fitting schedule (074)
| 074 | `project_managers`, `vans`, `fitters`, `default_crew`, `day_crew_overrides`, `fitting_jobs` | The wall whiteboard, made live. Vans are the stable board columns, fitters a separate roster with a standing pairing per van plus per-day overrides for holidays and swaps ("people move, vans don't"). `fitting_jobs` is an inheritance-chain citizen (`org_id`/`contact_id`/`site_id` + `quote_id`) with free-text fallbacks for urgent work that reaches the board before a quote exists (same pattern as `site_surveys`, 061). Ref `FIT-YYYY-NNNNNN`; soft-archive only — completed jobs stay on the board ticked. All six tables Realtime-published |

### Public studio launch hardening (073)
| 073 | design_request notifications | SECURITY DEFINER trigger on `design_requests` INSERT drops a `notifications` row (kind `design_request`, added to the kind CHECK) so new public leads appear on the dashboard Needs Attention feed — same pattern as the Persimmon trigger in 056 |

### Studio persistence: nesting, returns, binder, LED (064–067)
| 064 | `nesting_designs` | Saved acrylic nests — uploaded artwork SVG + run config; super-admin write, any-authed read |
| 065 | `letter_return_jobs` (+ `nesting_designs.source_kind` / `source_job_id`) | Built-up letter return jobs: read outlined letters, break the side-wall return strips at sharp corners + the stock length (outer edges AND counters), and push faces + returns to the nester as ONE linked nest (same brass). `source_job_id` FK links the nest back to its job both ways (nester banner ↔ job's "nested here" list); ON DELETE SET NULL |
| 066 | `binder_assets` | Reusable SVG logo library ("Save to binder" in the vectoriser + a binder picker at every SVG-upload point — visualiser / neon / returns / nesting). Super-admin write, any-authed read/create; optional `org_id` (ON DELETE SET NULL) |
| 067 | `led_layout_designs` | Persists the LED layout & wiring tool (module layout → runs → drivers → wiring PDF). Optional `source_design_id` back-link to `visualiser_designs` (ON DELETE SET NULL) |

## Key architectural decisions

### 1. Artwork is the spec-bearing record — it comes *before* production
Earlier drafts of this project modelled artwork approval as a stage inside the production pipeline. The current model reverses that: **nothing enters production until artwork is signed off.** On quote acceptance, each production-work line item auto-generates a skeleton artwork component (type + name + sub-items with material/method/finish/dimensions already populated from the quote). The designer's job is to verify, upload artwork files, and sign off — not to retype the spec.

Only after the client approves the artwork and staff click "Release to production" do the job_items appear on the department Kanban. The artwork module is therefore the authoritative specification; the production module is the fabrication tracker derived from it. Service-only line items (fitting, removal, site surveys) skip artwork and go straight to delivery/invoicing.

Under the hood, production_jobs are still created at quote acceptance time (the schema hasn't been inverted). The difference is entirely in the user-facing flow and the narrative: artwork is the first thing staff touch after a quote accepts, and the Kanban surface for the production team only becomes relevant once artwork releases.

### 2. Shop floor has its own minimal layout (inside the portal route group)
`/shop-floor` lives under `app/(portal)/shop-floor/` — it's authenticated like the rest of the portal but the route segment owns its own layout with no sidebar or admin nav. Large touch targets for Start, Pause, Complete. Staff log in and see only their department's queue. Runs on shop-floor tablets. (Earlier drafts put this at the app root as a separate route group; the current placement keeps auth/session behaviour consistent with the rest of the staff-only UI.)

### 2b. Backshop TV board is a top-level route (NOT under the portal)
`/backshop` (workshop production board for the shop TV) lives at `app/backshop/`, deliberately **outside** the `(portal)` route group, with its own `layout.tsx` doing a plain `requireAuth()`. Two reasons it can't sit under `(portal)` like shop-floor: (1) the portal sidebar/topbar is useless on a wall-mounted TV, and (2) the portal layout's `getUserOrg()` redirects any user without org membership to `/login?error=no_org`, which would lock out floor staff. The board is read + tick for any authed user; pushing a design onto it (`addToBackshop`, from the visualiser's ExportBar) is super-admin only. Snapshot model: each `backshop_items` row freezes the design's name/specs/3D-thumbnail/reference-PDF at push time (PDF in the private `backshop` storage bucket, reached via short-lived signed URLs server-side). Stages are **contextual** — `BACKSHOP_STAGE_CATALOG` in `lib/backshop/types.ts` holds base gates (Designed/Cut/Painted/Assembled) plus feature-gated ones (Push-through/Vinyl/Illumination/Stood-off); `checksForFeatures()` freezes the applicable set onto the item at push time from the design's pieces (the keys in `checks` define the stages). The board thumbnail is the 3D capture auto-trimmed to the sign via `trimImageDataUrl` (`lib/visualiser/image.ts`) so it fills its banner. Light theme to match the visualiser. Built for remote navigation (arrow-key roving focus + Enter), refreshed live via Supabase Realtime on `backshop_items`.

### 2c. Public "Design Your Sign" studio is a top-level UNAUTH route
`/design` (`app/design/`) is the **public, customer-facing** version of the visualiser — a lead-gen front door to push aperture & projecting signs. It sits **outside** `(portal)` with its own light, Onesign-branded `layout.tsx` and **no auth at all** (anyone with the link can build a sign). It does NOT duplicate the engine: the studio is a guided four-step **wizard** (`app/design/PublicWizard.tsx` — Size → Artwork → Light → Your details) that mounts the SAME store, geometry derivation, `Scene3D` and the full `ControlsPanel` / `SvgDropzone` the staff tool uses, so customers keep **every** building capability staff have (apertures, push-through, vinyl, stand-off, illumination, projecting blade) — reskinned in the shared cinematic Studio language (`components/studio`: `StudioStage` + `DayNightSwitch`; full-bleed dark stage as the hero, a frosted glass dock, the marquee day/night switch). (`VisualiserClient` still carries a now-unused `variant='public'` branch from the previous shell — harmless, left in place.) A short reusable spotlight tour (`app/design/Tour.tsx`, re-anchored to the wizard's `data-tour="steps"` / `data-tour="daynight"` elements) orients first-time visitors, auto-runs once (localStorage), and is replayable via "Show me how". The final "Your details" step assembles the design (`app/design/assemble.ts`) and submits it — design + face-on thumbnail + contact details — via `submitDesignRequest` into `design_requests` (migration 060) through the **service-role admin client** — the same unauth-write-via-server-action pattern as the token flows in §3 (do NOT add `getUser()`/`requireAuth()` to `submitDesignRequest`; there is no session). Spam guard is a honeypot field + a best-effort in-memory rate limit (Turnstile/captcha is a future toggle). Staff triage at `/admin/design-requests` (super-admin), where "Open in visualiser" promotes a request into a real `visualiser_designs` row; each submission also drops a `design_request` row into `notifications` via a SECURITY DEFINER trigger (migration 073), so new leads surface live on the dashboard "Needs Attention" feed. The visualiser tab links to `/design` via the "Public design studio" button next to the Neon tool. Pricing is deferred: today it's an enquiry; the `quoted` status + the request row are the seam for the planned hands-off Stripe package checkout.

**The `simplified` contract.** The wizard mounts the SAME shared components as the staff tool (`ControlsPanel`, `SvgDropzone`, `TraceImage`), so every control added to them ships to the public page the day it merges — unless it is gated behind the `simplified` prop. Treat `simplified` as a contract, not a skin: staff-only affordances (binder picker, links into `/admin/*`, production spec fields like material thickness / shadow gap / stud hardware, staff rail step numbering, shop vocabulary) MUST be `!simplified`-gated, and customer-facing copy for the remainder lives behind `simplified` ternaries. When adding a control to a shared visualiser component, decide explicitly which side of the gate it belongs on.

### 2d. The fitting schedule is the last node of the work flow
The canonical journey (quote → artwork → production → delivery → invoice) had no **fitting** step — the point where a van and two people turn up at a site and install the thing. That lived on a physical whiteboard in the office, which is why it was the last thing outside the system.

`/admin/schedule` (migration 074) is that board: weekdays down the left, w/c across the top, each day split per van, with AM / PM / all-day / out-of-hours slots and two holding panels ("to be scheduled" / "to be delivered"). Week, month and year views; drag & drop via **dnd-kit** (never native HTML5 DnD — it is mouse-only and loses `dragend` when the board re-renders mid-drag); live via Supabase Realtime.

Three things are load-bearing:

- **Card colour is whose job it is** — the project manager — never a status. Completion reads separately (✓, strike-through, fade) so PM identity survives on finished work. `project_managers` stores one base hex and the board derives card fill / border / chip from it with `color-mix()` against the active theme, so a PM added next year needs no new CSS.
- **People move, vans don't.** Vans are the stable columns; `default_crew` is the standing pairing and `day_crew_overrides` carries holidays and swaps for a single date. `lib/schedule/utils.ts` resolves a day by applying overrides over the standing pairing, and only rows that *differ* from it are persisted — so a day edited back to normal loses its "crew change" tag instead of carrying a no-op override forever.
- **Jobs are a permanent record.** Completed work is never removed; even the delete action is a soft `archived_at`.

**There is no ClarityGo importer, and there should not be one.** The original brief specified a CSV export/import de-duplicated on a quote-ref *string*, because it assumed a standalone app. Odysseus replaces ClarityGo — quotes are already here, so the join is `fitting_jobs.quote_id` and the "from a quote" picker lists accepted quotes that have no card yet.

`/schedule/tv` is the workshop TV view (`/fitting-board` redirects to it). Like `/backshop` (§2b) it sits **outside** `(portal)` with a plain `requireAuth()`, and that placement is the whole point rather than a preference: anything nested under `(portal)` — `/admin/schedule/tv` included — inherits the portal layout, so the sidebar and topbar come with it however the board itself is styled. The two reasons are the same as backshop's: that chrome is useless on a wall TV, and the portal layout's org gate is the wrong question to ask of floor staff.

It renders the *same* `ScheduleBoard` component in read-only tv mode, so the week view can't drift between office and workshop. View state (`?view=`/`?week=`/`?month=`/`?year=`) is a URL param because the server has to know which window of dates to load — and it makes the TV pointable at an exact view. The office board's "TV view" button opens `/schedule/tv` carrying the week currently on screen; there is deliberately no in-place TV toggle, because hiding the board's own controls leaves the portal chrome behind and that is not what a wall TV wants.

**The board is styled with the platform's own design system — it borrows nothing from the prototype's look.** The supplied prototype was built in OneLaser's visual language (near-black teal ground, hot orange accent, monospaced data, lowercase micro-labels, 2px corners). None of that survives: it produced a board that read as a wireframe next to the rest of the portal. `app/(portal)/admin/schedule/schedule.css` consumes the tokens in `app/globals.css` (`--card`, `--card-border`, `--fg`/`--fg-muted`/`--fg-subtle`, `--surface-2`, `--accent`, `--radius-*`), Gilroy, Studio rounding and the shared `PageHeader` / `.btn-*` / `.badge` components. What the prototype contributed is **layout and interaction only** — the day × van grid, the slot mechanics, the holding panels.

Two traps worth knowing before touching the stylesheet:

- **`--accent-light` is not usable as a background on a panel.** The theme model is "light dock on a dark stage": panels (`--card`, `--surface-2`) stay light in both themes, but `--accent-light` flips *dark* under `.dark`. A tag using it goes dark-on-light in dark mode. Mix against `--card` instead — the board defines `--sb-tint` / `--sb-tint-strong` for exactly this.
- **The board has no theme of its own.** Light/dark is the app's, set on `<html>` by the topbar `ThemeToggle`. `/fitting-board` applies `dark` on its own wrapper because a wall TV has no topbar and a bright panel in a workshop is glare.

### 3. Single-tenant internal platform — clients are records, not users

Onesign Odysseus is used **only by Onesign & Digital staff** to run the internal production pipeline. It is not a customer-facing portal. The businesses Onesign does work for never log in here — they interact with Onesign via email, the tokenised artwork sign-off links at `/sign-off/[token]` (legacy `/approve/artwork/[token]` redirects), and proof-of-delivery links at `/delivery/[token]`. An additional internal-but-unauth surface at `/production-sign-off/[token]` lets the production approvers (Chris / John) tick each sub-item off before release to fabrication, using the same token-as-gate pattern.

**Invariant: `/sign-off/[token]`, `/delivery/[token]`, and `/production-sign-off/[token]` must stay fully unauth.** External recipients (and internal production reviewers using `/production-sign-off/*` without logging in) clicking those links don't have a Supabase session — the 64-char hex token on `artwork_approvals` / `deliveries.pod_token` / `artwork_production_approvals.token` is the only authorisation. Every server action called from those pages (`getApprovalByToken`, `submitApproval`, `requestApprovalChanges`, `getPodByToken`, `submitPod`, `refusePod`, `getProductionApprovalByToken`, `signOffSubItemProduction`, `requestSubItemProductionChanges`) uses `createAdminClient()` (service-role key) so RLS on the super-admin-managed tables doesn't block writes. Do NOT add `getUser()` / `requireAuth()` to these actions, and do NOT introduce a middleware that protects those route prefixes.

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
- **Acrylic nesting tool** (`/admin/nesting`, migration 064 — saved nests) — uploads an outlined-artwork SVG, splits it into cut pieces (letter counters stay welded as islands; an island inside a hole becomes a piece again), and packs them onto configurable sheets via a raster bottom-left-fill engine in a Web Worker: gap tolerance via full-gap dilation, rotation steps (15° default), optional nesting inside letter counters, multi-sheet overflow with an off-cut size suggestion. Grouped piece list hover-highlights related pieces on the canvas. Exports per-sheet SVG + DXF (R12) and a jsPDF summary — always from a frozen snapshot of the nested run. Engine is DOM-free and Vitest-covered (`lib/nesting/`).
- **Public design studio** (`/design`, migration 060) — unauthenticated customer-facing visualiser with a guided spotlight tour; submissions land in the `/admin/design-requests` inbox. See §2c.
- **Built-up letter returns tool** (`/admin/visualiser/returns`, migration 065) — reads an outlined-letters SVG (real-size calibration like the neon tool), measures each contour's perimeter and breaks the side-wall return strips into welded segments at sharp corners + the stock length, wrapping the outer edge AND every counter. Produces an annotated cut-sheet PDF (faces drawn, weld dots, per-letter strip/weld table, totals). "Send to nester" hands the faces + return rectangles to `/admin/nesting` as ONE linked nest (same brass), grouped `FACES` / `RETURNS`; the nest banners back to its job and the job lists where it was nested. Engine is DOM-free + Vitest-covered (`lib/visualiser/returns.ts`).
- **Live fitting schedule** (`/admin/schedule` + `/fitting-board`, migration 074) — the whiteboard made live. Week / month / year views, AM / PM / all-day / OOH slots, two holding panels, per-day crews with understaffing warnings, holiday ranges, dnd-kit drag & drop with optimistic rollback, Supabase Realtime with a *fail-loudly* offline banner, and a read-only workshop TV route. Accepted quotes feed the board directly — no ClarityGo importer. See §2d
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
- **Storefront Studio** *(IN PROGRESS — merged via #45, not yet complete)* — reconstruct a prospect's shopfront as a to-scale parametric BLOCK model (no AI mesh — AI image→3D hallucinates buildings; see the research that drove this decision), into which a visualiser sign drops at exact 1:1 (mm). `lib/storefront/` engine (`specToBlocks` + measurement-first `traceToSpec`, Vitest-covered); in-app R3F surface at `/admin/storefront` with a trace-to-scale tool (anchor + element boxes → measured spec), add-from-visualiser (sign on the fascia mount), and `storefront_projects` persistence (migration **072** — apply on deploy) + a site-survey link (surveyed dims as trace anchors, the dimensional source of truth). **Known gaps:** the trace tool assumes a roughly FRONT-ON photo — no camera-match/perspective correction yet (the next, highest-value step for reliability on angled photos); the placed sign is a to-scale colour panel, not the real sign geometry; render is clean-blocky (no HDRI/photo-projection — Phase 4). Not yet runtime-verified end-to-end.
- **AI in-situ sign mockups (Higgsfield)** *(IN PROGRESS — merged via #45)* — `lib/visuals/` spec→tag→prompt engine + a "Generate mockup" button in the visualiser ExportBar that sends the 3D render as a reference image to the Higgsfield Cloud API. Quality-tier model select (cheap Soul preview / premium edit model), both endpoints env-overridable. **Go-live:** set `HIGGSFIELD_API_KEY` (+ optional `HIGGSFIELD_MODEL_*`) in Vercel; unconfigured = clean no-op.
- **`Result<T>` migration** — new server-action code uses the typed discriminated union from `lib/result.ts`; legacy `any`-typed returns are being retired module by module.
- **Supabase test mocks** — shared factory in `lib/__mocks__/supabase.ts` enables Vitest coverage of server actions without hitting live DB; rollout ongoing.
- **In-depth raster → SVG converter** — elevating the panel visualiser's silhouette tracer (`lib/visualiser/trace.ts`) into a first-class image-to-vector tool: median-cut colour quantization + stacked multi-layer vectorisation (`lib/visualiser/quantize.ts` + `vectorise.ts`), cleaner curve fitting, a dedicated Studio surface (Web Worker for big images), and export into the artwork (vinyl / cut) + nesting pipelines. Dependency-free + Vitest-covered, in the spirit of the nesting / returns engines.

### Deferred
- **Email sending** (Resend wiring) — hook points exist in deliverables, leads, reports, and the approval flow; needs API key
- **Sentry / observability** — error boundaries ready; DSN not provisioned
- **Integration tests against live Supabase** — needs a dedicated test project
- **AI artwork extraction** — scoped in `docs/artboard-template-example.html` / `docs/artboard-component-card-template.html`; standardised card template ready for Davey to trial
- **Sage 50c invoice push, HubSpot contact sync** — downstream integrations; separate infra work

### Planned
- **Non-standard fabrication builder** — grow the built-up lettering panel (the visualiser + built-up returns tools) into a general bespoke-fabrication configurator for non-standard jobs, in the vein of the Halman Thompson app: parametric, customer- or staff-driven, feeding the same artwork → nesting → production pipeline. Strategic direction for the Studio suite; full scope to be detailed (Tom to expand).
- **Place a saved built-up lettering asset into the visualiser scene** *(flagged — big, do after the QoL pass)* — drop a saved built-up-returns letter set onto a panel in the visualiser and have its **fixings + cable holes behave the same way** as native lettering (anchored to the asset, placeable/deletable, exported on the cut sheet). The connective feature that links the built-up-returns tool back into the panel visualiser. Larger than a QoL change: it needs an "asset instance" concept in the store (a placed reference to a `letter_return_jobs` row with its own transform), the geometry pipeline to treat it as a standoff-like piece for fixings/cable holes, and Scene3D to render + explode it. Tackle last.
- **Per-file default materials** *(flagged — needs a derivation change)* — today the artwork "Default material" (`apertureMode`) is **global** across every uploaded SVG layer; the friction is that you can't say "this file is stand-off, that file is cut-out" without per-shape overrides. The better model is a per-layer default: each `artworkLayers[]` entry carries its own default material, with per-shape/group overrides on top. Needs (1) a `defaultMaterial` field on the artwork layer in the store, (2) `composeLayers` to expose a composed-path → layer map, and (3) `usePanelDerivation`'s ungrouped-material resolution (`defaultUngroupedKind`) to consult the owning layer's default instead of the global `apertureMode`. Verify visually before landing — it touches the core material pipeline every export depends on.

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
- **Style from the design system, never a bespoke palette.** `app/globals.css` owns the tokens (`--card` / `--card-border` / `--fg` / `--fg-muted` / `--fg-subtle` / `--surface-2` / `--accent` / `--radius-sm|md|lg`) plus `.btn-primary` / `.btn-secondary` / `.btn-danger` / `.card-base` / `.badge`, and `app/(portal)/components/ui` owns `PageHeader`. A new admin surface uses those. If a design brief arrives carrying another company's visual language (as the fitting-schedule brief did), take its **layout and interaction** and drop its palette and typography — a page that doesn't look like the rest of the portal reads as unfinished, whatever the brief said. Remember the theme model: panels stay light in both themes, only the backdrop and chrome flip
- **Sidebar nav is three accordion groups**, agreed with the office: **Operations** (what we're doing — surveys, quotes, job board, shop floor, flags, deliveries, schedule, maintenance, reports), **Design & development** (what we're making — the Studio tools plus artwork, packs, approvals, design requests) and **Financials** (what it's worth — invoices, POs, pricing, clients, external orders). A new admin surface joins one of the three rather than starting a fourth; groups are defined in `app/(portal)/components/Sidebar.tsx`
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
