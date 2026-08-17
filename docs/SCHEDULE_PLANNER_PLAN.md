# Onesign Schedule Planner — integration analysis & build plan

**Source material:** `onesign-fitting-schedule-spec.md` (v2.0, 13 Aug 2026) + `onesign-fitting-board.html` (1,032-line single-file prototype, vanilla JS, localStorage only).
**Target:** the live fitting schedule as a first-class Odysseus module, not a standalone app.
**Status:** analysis + plan. No code written yet.

---

## 1. What the attachment actually is

| Artefact | Reality |
|---|---|
| `onesign-fitting-schedule-spec.md` | A complete, well-formed developer brief. Data model, four views, drag & drop rules, live-sync requirement, branding, open questions. Written as if for an outside contractor building greenfield. |
| `onesign-fitting-board.html` | A genuinely working prototype — week/month/year views, native HTML5 drag & drop, crew management, two holding panels, light/dark, TV mode, CSV import, seeded with jobs transcribed from photos of the physical board (W/C 10–31 Aug 2026). Persists to `localStorage`. No backend, no auth, no sync. |

The spec is honest that the prototype is "a behavioural and visual reference, not production code". That framing is correct — but it was written **as if Odysseus doesn't exist**. Roughly half the brief describes infrastructure this repo already has, and one whole section (§7, the ClarityGo integration) describes solving a problem that Odysseus was built to delete.

The right move is not "build the spec". It is **build the board, on the Odysseus spine**.

---

## 2. Three findings that change the shape of the job

### 2.1 The ClarityGo integration (§7) is obsolete — delete it from scope

The spec spends its longest technical section on getting quotes out of ClarityGo: ask Clarity Software for an undocumented API, else CSV export/import de-duplicated on quote ref, else email parsing, else manual re-entry. `quoteRef` is nominated as "the join key between Clarity and the schedule".

**Odysseus is the ClarityGo replacement.** Quotes already live here, in `quotes` + `quote_items`, with `quotes.quote_number` in the `OSD-YYYY-NNNNNN` format and a `quote_status` enum reaching `'accepted'`. The join key isn't a text field to reconcile against a foreign system — it's a foreign key.

So §7 collapses to a single sentence of scope:

> When a quote is accepted, any line item that needs a team on site creates a fitting card in **"to be scheduled"**.

That is the same trigger point that already generates artwork skeletons and production jobs (`createJobFromQuote` in `lib/production/actions.ts`). It removes the CSV importer, the de-duplication logic, the email-parsing endpoint, and the "email Clarity support before building anything" blocker — call it a week of the spec's 3–5 week estimate, and permanently removes a manual export-and-drop step from the office's day.

**Carry-over:** keep a nullable free-text `quote_ref` on the fitting job anyway, for jobs that pre-date Odysseus or arrive outside the quote flow. It costs nothing and covers the transition period.

### 2.2 The board is the missing last node of the documented work flow

`CLAUDE.md` describes the canonical journey as QUOTE → ARTWORK → PRODUCTION → DELIVERY → INVOICE. What is absent is **fitting** — the step where a van and two people turn up at a site and install the thing. That's precisely what the whiteboard tracks, and it's why the board currently lives on a wall instead of in the system.

This matters for the data model. The spec's `Job` carries `customer`, `location`, `postcode` and `quoteRef` as free text, because a standalone app has nowhere else to put them. In Odysseus those are the inheritance chain: `org_id` + `contact_id` + `site_id`, set at the quote and inherited at every handoff, with `org_sites` already holding the postcode **and** `latitude`/`longitude` geocoded via migration 047.

Building the board with free-text customer/postcode fields would create a second, divergent copy of the client record — exactly the thing the inheritance chain exists to prevent. The fitting job must be an inheritance-chain citizen:

```
fitting_jobs.org_id / contact_id / site_id   -- inherited, overridable (CLAUDE.md rule)
fitting_jobs.quote_id                        -- FK, replaces §7's text join key
fitting_jobs.production_job_id               -- nullable; what's being fitted
fitting_jobs.customer_fallback / site_address_fallback / postcode_fallback
                                             -- free text, for jobs with no org record yet
                                                (same pattern as site_surveys, migration 061)
```

The fallback columns are the pattern migration 061 already established for `site_surveys`, which sits upstream of a quote and so can't always resolve an org. The fitting board has the mirror-image problem — an urgent callout may hit the board before anyone raises a quote — so the same solution applies.

### 2.3 Odysseus already has three "a team goes to a site on a date" models — this would be the fourth

| Module | Table | Who goes | Date field | Surface |
|---|---|---|---|---|
| Deliveries | `deliveries` (035) + `drivers` (049–050) | a driver | `scheduled_date` | `/admin/deliveries` — week view with driver columns, unassigned pool, Mapbox route optimisation, PoD tokens |
| Maintenance | `maintenance_visits` (048) | unassigned | `scheduled_date` | `/admin/maintenance` |
| Site surveys | `site_surveys` (061) | unassigned | — | `/admin/site-surveys` |
| **Fitting (new)** | `fitting_jobs` | a van crew | `date` | the new board |

Left alone, Onesign ends up with four calendars and no single answer to "what is happening on Thursday". That is a worse outcome than the whiteboard, which at least is one surface.

**Recommendation:** build `fitting_jobs` as its own table — the board needs slots, vans and crews that deliveries don't have — but make the week view render **deliveries and maintenance visits as read-only overlay cards** from day one. They appear in a van's day cell, visually distinct (dashed border, source badge), not draggable on the fitting board, and click through to their own module. The office gets one honest picture of the week; each module keeps its own record; nothing is duplicated.

The spec's own §4.5 open question — "some jobs are presumably both a delivery and a fit" — is answered by this. Don't create a second holding panel that reinvents `deliveries`; render the existing `deliveries` records into the board, and put a `delivery_required` flag on the fitting job so a fitting card can show a small marker instead of becoming two cards.

> **Decision needed (office):** does "to be delivered" mean the existing Deliveries module (driver drops materials, PoD signature), or something lighter the fitters do informally? If it's the former, the second holding panel becomes a view onto `deliveries` where no date is set — which needs `deliveries.scheduled_date` relaxed from `NOT NULL DEFAULT CURRENT_DATE` to nullable.

---

## 3. What Odysseus already provides — the reuse map

This is the core of the answer to "what do we need to tie this in". Most of the spec's hard requirements are solved problems in this repo.

| Spec requirement | Existing Odysseus asset | Reuse verdict |
|---|---|---|
| **§5 Live sync** — "the single most important requirement" | `JobBoardClient.tsx`, `BackshopBoard.tsx`, `NeedsAttentionLive.tsx`, `ShopFloorClient.tsx`, `ExternalOrdersClient.tsx` all run `supabase.channel(...).on('postgres_changes', ...)`. Publication + trigger patterns established in migrations 052 / 056 / 059. | **Direct reuse.** Copy the `JobBoardClient` shape: optimistic local update, realtime reconcile, `router.refresh()` where the payload can't be hydrated alone. |
| **§4.6 dnd-kit, explicitly NOT native HTML5 DnD** | `@dnd-kit/core` + `@dnd-kit/utilities` are already dependencies, already used in `JobBoardClient.tsx` / `JobCard.tsx` / `ClientGroupCard.tsx`, with `PointerSensor` (8px activation), `DragOverlay`, and a `preDragBoardRef` rollback on server failure. | **Direct reuse.** Worth noting: the prototype uses native HTML5 DnD and carries the exact `cleanupDrag()` global-handler workaround the spec warns about. Odysseus already has the correct implementation, touch support included. |
| **§4.1 week view, day rows, unassigned pool** | `lib/planning/utils.ts` — `getWeekDates(monday, includeWeekends)`, `getMonday(date)`, `groupDeliveriesByDriverAndDay()`, with `utils.test.ts` alongside. Components: `DayColumn`, `DriverGroup`, `UnassignedPool`, `PlanningPanel` (prev/today/next nav, Mon-Fri ↔ Mon-Sun toggle). | **Generalise, don't fork.** `groupDeliveriesByDriverAndDay` → `groupByDayAndColumn(items, columnKey)`; `getWeekDates` already handles the weekends toggle. The delivery planning panel is the same widget rotated 90°. |
| **§4.4 TV mode** | `app/backshop/` — a top-level route deliberately **outside** `(portal)`, plain `requireAuth()`, no sidebar, large type, Realtime-refreshed, arrow-key roving focus for a TV remote. | **Direct reuse of the whole approach**, including the trap it documents: the `(portal)` layout's `getUserOrg()` bounces users without org membership to `/login?error=no_org`, which would lock a wall TV out. Put the board at `app/fitting-board/`, not under `(portal)`. |
| **§6 Map** | `lib/geo/actions.ts` (`geocodeSite`, postcode → lat/lng), `org_sites.latitude`/`longitude` populated, `lib/mapbox/` with `optimiseRoute()` and `ONESIGN_HQ`, and `MapPanel.tsx` / `RouteLayer.tsx` / `RouteInfoBar.tsx` / `MapPopup.tsx` already plotting a day's stops and optimising visit order from a driver's home or HQ. | **The spec's "v2 stretch goal" is ~80% built.** Recolour pins by van instead of driver and it ships in v1. Postcodes are geocoded on save already — no new geocoding work. |
| **§3.1 Roster: vans + fitters + per-day crews** | `drivers` (049) — name, phone, `home_postcode`, `home_lat`/`home_lng`, `vehicle_type` (`van`/`truck`/`car`), `is_active` (deactivate, never delete). `DriverManagerPanel.tsx` is the CRUD UI. | **Pattern reuse, new tables.** `drivers` is people-with-vehicles; the spec's model is deliberately "people move, vans don't" — vans and fitters must separate. Build `vans` + `fitters`, copy `DriverManagerPanel`'s shape, and plan to fold `drivers` into `fitters` later (a driver *is* a person who can be pulled onto a van). |
| **§3.2 permanent record, never hard-delete** | Already the house convention — artwork delete requires a typed reference confirmation; `is_active` on drivers/PMs. | **Convention reuse.** `archived_at TIMESTAMPTZ` on `fitting_jobs`; completed jobs stay in place, ticked and struck through. |
| **§2 auth, "record who last edited"** | `lib/auth.ts` — `requireAuth`, `isSuperAdmin`, `requireSuperAdminOrError`. `created_by`/`updated_by` columns are standard across the schema. | **Direct reuse.** |
| **Notifications** (not in spec, but wanted) | Migration 052 `notifications` + Realtime triggers; the dashboard "Needs Attention" feed; the 056/073 SECURITY DEFINER trigger pattern. | **Cheap win.** A trigger on `fitting_jobs` (job added to *to be scheduled*, or a date moved inside 48 hours) drops a row in the existing feed. Add `'fitting_job'` to the `notifications.kind` CHECK — the expand-in-place pattern is already used three times (055/056/073). |
| **Server-action conventions** | `Result<T>` in `lib/result.ts` (`ok()` / `err()`), Zod `safeParse` at the top of each action, actions in `lib/`, `lib/__mocks__/supabase.ts` factory for Vitest. | **Follow, don't invent.** |
| **Pure-logic testing** | `lib/quoter/engine/`, `lib/nesting/`, `lib/planning/utils.test.ts`, `lib/visualiser/returns.ts` — the repo's strong habit of DOM-free, Vitest-covered engines. | Crew resolution, understaffing warnings, holiday-range expansion, and week/month/year date maths are all pure functions. `lib/schedule/` should be a DOM-free, fully tested engine in the same spirit. |

### 3.1 Genuine gaps — what actually has to be built

Everything above is plumbing that exists. What is new:

1. **Tables + RLS + Realtime publication** — `vans`, `fitters`, `default_crews`, `day_crew_overrides`, `project_managers`, `fitting_jobs`, `holiday_ranges`. Next migration number is **074** (note: `068` is used twice already — `068_panel_extra_face_nest.sql` and `068_token_expiry.sql` — don't repeat that).
2. **Slot mechanics** (§4.1) — the AM/PM stacks, the all-day tile spanning the cell with labels that hide but reappear during a drag, the OOH row hidden unless used and revealed as a drop target mid-drag, weekends auto-appearing when a weekend job exists. This is the fiddly part of the build and has no analogue in the repo. Budget accordingly.
3. **Month view** (W/C columns subdivided into van sub-columns) and **year heatmap** — new.
4. **Day-crew editor** with live understaffing warnings (amber ⚠ one fitter, red "no crew") shown *before* saving — new.
5. **Fitter mobile view** — read-only, their van's jobs, addresses, access notes, map link. No direct analogue; `/shop-floor` is the closest in spirit (authenticated, minimal chrome, big touch targets, own layout).
6. **"Fail loudly" connection banner** (§5) — *no existing equivalent.* `JobBoardClient`, `BackshopBoard` and `ShopFloorClient` all degrade silently if the Realtime socket drops. The spec is right that a stale board that looks live is worse than a whiteboard. Build a shared `useRealtimeStatus()` hook exposing `connected | reconnecting | dead` and a banner component — then **retrofit it to backshop and shop-floor**, which have the same wall-display risk today.

---

## 4. Design reconciliation — the one thing to settle before pixels

The spec's §8 specifies OneLaser's visual language at the client's request: near-black teal ground `#0C1315`, hot "cut edge" orange `#FF6A2B`, steel-white buttons, lowercase labels, monospaced data, 2px corners.

`CLAUDE.md` specifies Onesign Odysseus: accent `#4e7e8c` (muted steel teal), light `#e8f0f3`, dark UI `#1a1f23`, Geist Sans.

These are different design systems. Inside Odysseus, the module has to read as Odysseus — the sidebar, topbar and every neighbouring screen are already `#4e7e8c`. But three parts of the prototype's language are *system-agnostic* and genuinely good for a dense schedule board, and should be carried over:

- **monospaced data** — refs, dates, counts, so columns align at a glance across a room;
- **lowercase UI labels** — already how the delivery planner and backshop write their controls;
- **hairline rules + tight corners** — reads better at TV distance than soft cards.

Take those; take the Odysseus palette. The orange `#FF6A2B` should not survive: `CLAUDE.md` fixes the accent, and the spec's own warning ("keep the accent visually distinct from the four PM colours") is satisfied more easily with `#4e7e8c` against yellow/green/red/blue than with orange.

The one place the spec's requirement is load-bearing is **PM colours needing separate light and dark values, not a filter** (§3.3) — job ownership must survive the theme switch. That's a real constraint; store the pair on the `project_managers` row (`colour_light`, `colour_dark`) rather than deriving one from the other.

> **Decision needed (Tom):** confirm Odysseus palette over OneLaser palette. The spec asked for OneLaser at the client's request, but the client is Onesign and the surface lives inside Onesign's own platform.

---

## 5. Answers the codebase already gives to the spec's open questions (§10)

| # | Spec question | Answer from Odysseus |
|---|---|---|
| 1 | Delivery + fitting on one job — two cards or a flag? | **A flag.** `deliveries` already exists as a full module with drivers, PoD tokens and route optimisation. `fitting_jobs.delivery_required` + a link to the `deliveries` row; render a marker on the fitting card. See §2.3. |
| 2 | Red / green magnets — meaning beyond PM colour? | Office question. If it's confirmed vs provisional, that's a `confirmed BOOLEAN` and a border treatment, not a colour. |
| 3 | PRA / DEL / MEJ sketch headers | Office question. |
| 4 | Recurring jobs (maintenance contracts)? | **Partly solved.** `maintenance_visits` (048) already models surveys, inspections, repairs and cleaning with a `scheduled_date`. Recurring fitting work is a maintenance visit surfaced on the board as an overlay card (§2.3) — not a new recurrence engine. |
| 5 | ClarityGo export format / API | **Moot.** See §2.1. |
| 6 | Holiday ranges — phase 2? | **Pull into v1.** It's a pure function (`expandHolidayRange(fitterId, from, to) → DayCrewOverride[]`), Vitest-covered in an afternoon, and the spec notes the physical board's entire top edge is holiday notes. Deferring it means shipping a tool that's tedious in exactly the way the whiteboard is. |
| 7 | Seeded prototype data | **Do not migrate it.** Transcribed from photos by eye; day/van placements are best-guess and three entries were unreadable. Start empty, or have the office key in the live weeks. Keep it as fixture data for tests only. |

---

## 6. Build plan

### Phase 0 — decisions (blocking, ~1 conversation)
- Odysseus palette vs OneLaser palette (§4).
- "to be delivered" = the existing Deliveries module, or a lighter fitter-side concept? (§2.3)
- TV access: authed kiosk account like `/backshop`, or a new tokenised read-only URL? **Recommend authed kiosk** — `/backshop` already proves the pattern, and a new unauth route prefix would need a deliberate exception to the token-as-gate invariant in `CLAUDE.md` §3.
- Office to confirm magnet meanings and PRA/DEL/MEJ (§10.2, §10.3).

### Phase 1 — spine (the "prove two browsers stay in sync" milestone)
Migration 074: `project_managers`, `vans`, `fitters`, `default_crews`, `day_crew_overrides`, `fitting_jobs` (+ RLS, + `supabase_realtime` publication).
`lib/schedule/` — DOM-free types, Zod schemas, crew resolution, date maths; Vitest from the first commit.
`lib/schedule/actions.ts` returning `Result<T>`.
Week view at `/admin/schedule` reusing `getWeekDates` / `getMonday` and the `DayColumn` shape; job modal; dnd-kit drag & drop lifted from `JobBoardClient`; realtime subscription + the new `useRealtimeStatus` banner.

### Phase 2 — the Clarity replacement
Holding panels ("to be scheduled" / "to be delivered"). Accepted-quote bridge: service line items and completed production jobs create fitting cards in *to be scheduled*, inheriting `org_id` / `contact_id` / `site_id`. Deliveries + maintenance visits render as read-only overlay cards. `notifications` trigger.

### Phase 3 — crews
Day-crew editor with the crew/additional-bodies split and live understaffing warnings. Holiday ranges (pulled forward from spec phase 2). Crew-change tags on day rows.

### Phase 4 — the other views
Month view with van sub-columns; year capacity heatmap; click-through navigation between all three.

### Phase 5 — the screens
TV mode at `app/fitting-board/` (outside `(portal)`, backshop pattern). Fitter mobile read-only view. Light/dark, remembered per device. Retrofit the connection banner to backshop and shop-floor.

### Phase 6 — map + convergence
Day map with van-coloured pins and suggested visit order, reusing `lib/mapbox/optimiseRoute`. Then the convergence question: fold `drivers` into `fitters`, and consider whether deliveries/maintenance/fitting want one `schedule_events` spine.

### Effort
The spec estimates 3–5 weeks greenfield for one developer. With dnd-kit, Realtime, the week-view helpers, geocoding, route optimisation, the TV route pattern, auth and the notifications feed all already in place — and §7 deleted outright — **2–3 weeks is realistic**, with the slot mechanics (§3.1 item 2) and the month/year views carrying most of the remaining risk.

---

## 7. What this unlocks beyond replacing the whiteboard

Worth stating, because it's the argument for building it *inside* Odysseus rather than as the standalone app the spec describes:

- **The quote knows when it gets fitted.** Accepted → scheduled → fitted, on one record, with no re-keying.
- **The client record stops forking.** One `org_sites` row, geocoded once, used by deliveries, surveys, maintenance and fitting alike.
- **Capacity feeds the quote.** The year heatmap is, in effect, a lead-time answer — "we can't fit that until the week of the 12th" becomes visible at quoting time rather than after acceptance.
- **The fitters' phone view is the last unclosed loop.** Artwork sign-off, production sign-off and proof-of-delivery all have tokenised or authed surfaces; fitting is the one field activity with no digital trace.
