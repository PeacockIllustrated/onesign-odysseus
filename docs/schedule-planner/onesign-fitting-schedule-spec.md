# Onesign & Digital — Live Fitting Schedule
**Developer specification · v2.0 · 13 August 2026**

Hand this document to the developer together with the prototype file **`onesign-fitting-board.html`**. The spec says what to build and why; the prototype shows exactly how it should look and behave. Open the prototype in any browser — it needs no install, no server and no internet.

---

## 1. Background & goal

Onesign & Digital (sign manufacturer and installer, Team Valley, Gateshead) schedules its three fitting teams on a physical whiteboard covered in sticky notes and magnets. It works, but: updates aren't live, the board gets crowded and hard to read, notes fall off or go stale, holiday notes are crammed along the top edge, and only people standing in that room can see any of it.

**Goal:** a web-based fitting schedule that

- displays permanently on a wall-mounted TV in the office/workshop;
- is edited from office desktops (and phones), with **every change appearing live on every screen** — this is the single most important requirement, and the reason the project exists;
- preserves the familiar board layout: **weekdays down the left, "week commencing" across the top, each day split into three columns, one per van**;
- offers **week, month and year** views, switched manually;
- is readable across a room and pleasant to use at a desk.

### 1.1 What already exists

| Artefact | What it is |
|---|---|
| `onesign-fitting-board.html` | Working single-file prototype. All views, drag & drop, crew management, holding panels, light/dark, TV mode. Data persists to that browser's local storage only. |
| Photos of the physical board | Source material; the prototype is pre-loaded with real jobs transcribed from them (W/C 10, 17, 24 and 31 Aug 2026) plus the holiday notes. |

The prototype is a **behavioural and visual reference, not production code** — it's one HTML file with no framework, no backend and no auth. Rebuild it properly; copy the layout, interaction model and visual language.

---

## 2. Users & access

| Role | Needs | Notes |
|---|---|---|
| Office / scheduling staff | Full create, edit, move and delete; crew management; imports | Desktop, roughly 2–5 users |
| Workshop TV | Read-only display, view switched manually | 1080p or 4K, landscape, viewed from several metres |
| Fitters | Read-only on phone: their van's jobs, addresses, access notes, map link | **In scope for v1** — simple mobile view, no editing |

**Auth:** one shared workspace behind a login (email magic-link or company SSO is fine). The TV uses a long-lived read-only display URL so a stray remote press can't change data. No granular permissions needed in v1, but **record who last edited each job** (name + timestamp).

---

## 3. Data model

### 3.1 Vans, fitters and per-day crews

**Principle: people move, vans don't.** The three vans are stable board columns. Fitters are a separate roster with a standing pairing per van, plus **per-day overrides** for holidays and swaps. This was the agreed answer to "Van 2 is Dave & Lewis all week, except Wednesday when Lewis and Josh are both off."

Default crews at launch:

| Van | Default crew |
|---|---|
| Van 1 | Paul & Aaron |
| Van 2 | Dave & Mark |
| Van 3 | Josh & Lewis |

The roster is in **two groups**, which the UI keeps visually separate:

- **Fitting crew** (the regular fitters, listed in van order): Paul, Aaron, Dave, Mark, Lewis, Josh
- **Additional bodies** (anyone who can be pulled onto a van when needed): Mak, Bob, Lee, Gary Mac, Alex, Scott, Adam, David S, Chris

Both groups are editable, and anyone from either group can be assigned to a van on any given day.

```ts
Van      { id, name, sortOrder }
Fitter   { id, name, group: "crew" | "additional", active }   // leavers deactivated, never deleted
DefaultCrew      { vanId, fitterIds[] }                        // standing pairing, applies every day
DayCrewOverride  { date, assignments: { fitterId → vanId | "holiday" | "off" } }
```

Behaviour:

- Resolve the crew for a date by starting from `DefaultCrew` and applying that date's override if one exists.
- Days with an override show a **"crew change"** tag; on-holiday names are listed on the day row; affected van cells show that day's actual crew.
- **Understaffing warnings**: one fitter on a van → amber ⚠; nobody assigned → red "no crew". Shown live in the editor *before* saving, and on the board.
- "Off / shop" covers people in the workshop rather than out fitting.
- A per-job free-text `crewOverride` remains for job-level notes ("Paul only, for the survey"), but day-level assignment is the primary mechanism.
- **Phase 2:** holiday date-*ranges* entered once ("Lewis, 12–19 Aug") that expand into daily overrides. Currently holidays are entered per day, which is tedious for a fortnight off. Worth doing early — the physical board's top edge is entirely holiday notes, so this is real daily admin.

Vans and fitters must be tables, not hard-coded — a fourth van is plausible.

### 3.2 Jobs

One job = one card. Several jobs can share a van/day/slot (the real board regularly carries 3–5 in a day); the UI stacks them and there is **no cap**.

```ts
Job {
  id: string
  customer: string          // required — customer / job name
  quoteRef: string          // ClarityGo quote ref; the join key for imports (§7)
  location: string          // town / site
  postcode: string          // drives the map feature
  pmId: string              // project manager — determines card colour (§3.3)
  done: boolean             // "fitted" ✓ — see permanent-record note

  vanId: string | null      // null while in a holding list
  date: date | null         // null = unscheduled, sits in a holding panel (§4.5)
  lane: "" | "delivery"     // which holding panel it sits in while unscheduled
  slot: "AM" | "PM" | "DAY" | "OOH"

  crewOverride: string      // optional one-off note
  accessEquipment: string   // "cherry picker booked", "DBS required", "on site before 8am"
  notes: text
  createdBy / updatedBy, createdAt / updatedAt
}
```

Notes:

- **Slots.** Hour-level scheduling was explicitly rejected as too granular. `DAY` renders as a single tile filling the full cell (see §4.1); `OOH` (out of hours) is a slot below PM that is **hidden unless used** — needed for evening and after-close installs.
- **Jobs are a permanent record.** Completed jobs are never removed: they stay in place marked ✓ and struck through, so the business can always see who fitted what and when. Never hard-delete on completion; even the explicit delete action should be a soft-delete/archive.
- **Multi-day jobs** are entered as one card per day in v1 (see the Barconwood schools job, 17–19 Aug, in the prototype). A linked multi-day entity is a phase-2 refinement.

### 3.3 Colours = project managers

**Card colour indicates whose job it is** — the project manager — not a status. Four PMs, in this fixed display order:

| Order | PM | Colour |
|---|---|---|
| 1 | Chris | Yellow |
| 2 | Adam | Green |
| 3 | Michael | Red |
| 4 | Mak | Blue |

```ts
ProjectManager { id, name, colour, sortOrder, active }
```

- Every job has exactly one PM; the whole card renders in that colour in every view, with a legend in the header.
- Completion is shown **separately** from colour (✓ marker, strike-through, slight fade) so the PM identity stays visible on finished work.
- PMs must be a table (name, colour, order, active) — people join and leave.
- Light and dark themes need **separate colour values** for these, not a filter: see the prototype's `pm-*` rules. Identity must survive the theme switch.

---

## 4. Views

Shared header across all views: logo, view switcher (week / month / year), previous / today / next, current period title, PM legend, and toggles for weekends, light/dark and TV mode. **View switching is manual only** — no auto-rotation.

### 4.1 Week view (the workhorse)

- Rows = days down the left with dates; today's row marked. **Weekends are hidden by default**, appearing only when the weekends toggle is on *or* a weekend day actually has a job — they're needed only occasionally. Same rule in month view.
- Columns = the three vans; header shows van name and that van's current default crew.
- Each day × van cell holds an **AM** stack and a **PM** stack.
- **All-day jobs span the full width of the cell**, sitting over where AM and PM would be, tagged "all day". The AM/PM labels hide while an all-day job covers the cell and reappear during a drag so they stay droppable; a slim "+ am job / + pm job" line covers the click path. This mirrors a sticky note covering the whole square on the physical board.
- **OOH row** below PM, hidden unless that cell has an OOH job (and revealed during drags as a drop target).
- Card shows: customer (bold), quote ref, location + postcode, ✓ when fitted, crew override / access note. Click opens the edit modal.
- **Drag & drop** — see §4.6.
- **Day-crew editing**: each day row has a "change crews" control opening the day editor (§3.1), which lists *fitting crew* and *additional bodies* as separate sections, with live warnings and a "reset to default" action.

### 4.2 Month view

- Columns = every W/C (Monday) touching the month; each subdivided into three narrow van sub-columns.
- Rows = weekdays down the left.
- Jobs render as compact one-line colour chips; click opens the full modal; drag works here too.
- Clicking a W/C header jumps to that week in week view.

### 4.3 Year view

- Twelve month panels, each listing its W/C rows; per week, three heat cells (one per van) shaded by load with the count printed.
- Per-van annual totals along the top. Clicking any week jumps to it.
- Purpose is spotting quiet and overloaded weeks months ahead — not editing.

### 4.4 TV mode

- Larger type throughout; all edit affordances hidden; read-only session.
- Target 1920×1080 viewed from 3–5 m. Verify a busy day (4–5 jobs in a cell) still fits without scrolling.
- Dark theme suits the TV; avoid large static bright areas (screen burn).

### 4.5 Holding panels — "to be scheduled" and "to be delivered"

A right-hand sidebar on the week view carries **two stacked panels that look and behave identically** — the digital version of the sticky notes parked around the edge of the physical board.

| Panel | Holds |
|---|---|
| **to be scheduled** | Quoted/won jobs with no fitting date yet |
| **to be delivered** | Items going to site **without a fitting team** — dropped off, not installed |

- Both show PM-coloured cards with a count badge, both accept drags in and out, both have their own "+ add job".
- Dragging a card **onto the board** schedules it (sets date/van/slot, clears its lane); dragging a card **into a panel** unschedules it into that lane. Dragging between the two panels just changes the lane.
- The job modal's "no date yet" option offers a two-button choice of which panel it belongs to.
- **ClarityGo imports land in "to be scheduled"** (§7).
- Both panels are visible read-only on the TV so everyone can see what's waiting.

**Open design question:** some jobs are presumably *both* a delivery and a fit — materials dropped Tuesday, fitted Thursday. Today that's two cards. If it turns out to be common, a "delivery required" flag on the job (rendering a small marker on the fitting card) would model it better than two entries. Confirm with the office before building.

### 4.6 Drag & drop

- Any card can be dragged: between days, between vans, between AM / PM / all-day / OOH, and into or out of either holding panel. Month view accepts drops (changes day/van/week, keeps the slot).
- Drop targets highlight during the drag; the source card dims.
- **Use a pointer-events-based library (dnd-kit or similar), not native HTML5 drag & drop.** Native DnD is mouse-only and loses its `dragend` when the board re-renders mid-drag — that bug appeared in an early prototype and had to be worked around with global cleanup handlers. A proper library avoids the whole class of problem and gives touch support for tablets.
- Disabled entirely in TV mode.

---

## 5. Live sync — the core requirement

- Any create, edit, move or delete must appear on the TV and all other open screens **within a couple of seconds, with no manual refresh**.
- Use a realtime backend — **Supabase (Postgres + Realtime subscriptions)** is the natural fit; Firebase is an alternative. The standalone prototype only saves locally; do not carry that approach forward.
- Concurrency: last-write-wins per job is acceptable at this team size, but warn or lock if two people have the same job's modal open.
- **Fail loudly.** If the connection drops, show a clear "not syncing" banner. A stale board that looks live is worse than the whiteboard it replaced.

---

## 6. Map feature

- v1 (in prototype): a "map ↗" button on each job opens Google Maps at its location/postcode.
- v2: a **day map** — plot a selected day's jobs as pins colour-coded by van, so routes and clustering are visible. Geocode postcodes on save (postcodes.io is free for UK postcodes) and cache lat/lng on the job. Stretch: suggested visit order per van.

---

## 7. ClarityGo integration (no public API — workarounds)

Onesign quotes in **ClarityGo** (Clarity Software's cloud print/sign MIS). Ideally quotes would flow straight into "to be scheduled", but ClarityGo's advertised integrations are accounting-side (Xero/QuickBooks) and there is **no publicly documented scheduling API**. In order of preference:

1. **Ask Clarity Software directly, before building anything.** Cloud MIS products often have an undocumented API, webhooks or a Zapier/Make connector. One support email could make this trivial.
2. **CSV export → import** (demonstrated in the prototype). ClarityGo exports quote/job reports; the importer accepts `Customer, Quote ref, Location, Postcode, PM`, creates cards in "to be scheduled", and **de-duplicates on quote ref** so repeat imports are safe. Day-to-day this is a 30-second export-and-drop instead of retyping every job.
3. **Email parsing** — if Clarity can email quote reports on a schedule, an inbound-mail endpoint can parse and import them with no manual step.
4. **Manual quick-add** for one-offs; the modal takes about 20 seconds.

Treat **quote ref as the join key** between Clarity and the schedule, whichever route is taken.

---

## 8. Design & branding

The prototype's visual language is deliberate and should be carried over.

- **Brand:** Onesign & Digital logo (supplied white PNG; a dark-ink variant is generated for light mode and embedded in the prototype). Part of **One Group** alongside OneLaser and OneDesign Studios.
- **Design language** is borrowed from **onelasercutting.com** at the client's request: near-black teal ground (`#0C1315`), steel-white primary buttons, lowercase UI labels, monospaced data (refs, dates, counts), 2px corners, hairline rules, and one hot "cut edge" orange accent used sparingly for today's marker, crew-change flags and focus states.
- **Light and dark modes**, toggled in the header and remembered per device — dark for the workshop TV, light for office desks. The logo swaps variant automatically with the theme.
  - ⚠ The light palette was *derived* from OneLaser's dark theme colour and industrial feel, **not** copied from a published light scheme. If One Group has official light-mode values, apply them (the `body.light` block in the prototype).
- Keep the accent visually distinct from the four PM colours so brand chrome is never confused with job ownership.

---

## 9. Suggested stack & sizing

| Layer | Suggestion |
|---|---|
| Frontend | React + Tailwind (Vite or Next.js) |
| Drag & drop | dnd-kit (see §4.6) |
| Backend / DB | Supabase — Postgres, Realtime, Auth, row-level security |
| Hosting | Vercel or Netlify; TV runs a browser in kiosk mode on the read-only URL |
| Map | Google Maps links (v1) → Leaflet/Mapbox + postcodes.io (v2) |

Roughly **3–5 weeks for one developer**, including the fitter mobile view, auth, the Clarity importer and polish. It is a small CRUD + realtime app; the complexity is in the layout and interaction detail, not the data.

### Suggested build order

1. Data model, auth, realtime plumbing — prove that two browsers stay in sync.
2. Week view + job modal + drag & drop.
3. Holding panels, month and year views.
4. Crew management, holidays, warnings.
5. TV mode, fitter mobile view, themes.
6. Clarity importer, map.

---

## 10. Open questions

1. **Delivery + fitting on one job** — two cards, or a flag on one? (§4.5)
2. **Red / green magnets** on the physical board — do they mean something beyond the PM colour (e.g. confirmed vs provisional)? If so, a secondary indicator on cards is needed.
3. **Sketch headers PRA / DEL / MEJ** — confirm what these abbreviations are and whether the digital board should use them anywhere.
4. **Recurring jobs** (maintenance contracts) — needed?
5. **ClarityGo export format** — get a sample CSV to lock the importer's columns; and confirm with Clarity support whether any API exists (§7).
6. **Holiday ranges** — confirm phase-2 priority (§3.1); it may be worth pulling into v1 given how much of the physical board is holiday notes.
7. **Seeded data check** — the prototype's jobs were transcribed from photos by eye. Day/van placements are best-guess, and a few entries were unreadable (a Blackpool "full sign rebrand", a "banner replace", and a holiday name read as "Woy"). Have the office verify before this data is treated as real.

---

## 11. Prototype → spec map

| Feature | Where to see it |
|---|---|
| Week view, AM/PM stacking, multi-job days | Week view, W/C 17 Aug |
| All-day tile spanning the cell | Barconwood schools, 17–19 Aug, Van 3 |
| OOH slot (appears only when used) | Week view — job with slot OOH |
| PM colours + legend, in order | Header legend: Chris, Adam, Michael, Mak |
| ✓ fitted, kept as permanent record | Any completed card |
| Weekends only when needed | "weekends" toggle; auto-appears if a weekend job exists |
| Month view, van sub-columns | Month view |
| Year capacity heatmap | Year view |
| Drag & drop | Drag anything anywhere, repeatedly |
| Two holding panels | Right sidebar: "to be scheduled" / "to be delivered" |
| ClarityGo import | Sidebar → "import from clarity" |
| Roster: crew + additional bodies | "vans & fitters" in header |
| Per-day crews, holidays, warnings | "change crews" on any day row |
| Map link | Job modal → "map ↗" |
| Light / dark | "light" / "dark" toggle in header |
| TV mode | "tv mode" toggle in header |
| Live sync | **Not in the prototype** — local save only; see §5 |
