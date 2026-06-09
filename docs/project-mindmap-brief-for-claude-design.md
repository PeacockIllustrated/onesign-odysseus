# Brief for Claude Design — Onesign Odysseus mindmap

Paste the block below into Claude Design as a single prompt. It's self-contained; no codebase access needed.

---

## THE PROMPT (copy from here to the end)

Design a single-page visual mindmap for a web app called **Onesign Odysseus**. The output should be an aesthetic, information-dense diagram that communicates how the app's data entities, routes, and work flow interconnect. It is for the founder / lead developer to keep a live mental model of the system and spot gaps.

Format: **one HTML file**, self-contained, dark theme, uses only inline CSS and SVG (no external fonts or scripts). It should look gorgeous on a widescreen monitor and still print reasonably to PDF.

### Brand

- Name: **Onesign & Digital** — a signage and digital products agency, Gateshead UK.
- Accent colour: **`#4e7e8c`** (muted steel teal). Light `#e8f0f3`, dark `#3a5f6a`.
- Dark UI background: `#1a1f23` or deeper.
- Font: system sans (Inter / Geist / -apple-system). No serifs, no novelty fonts.
- Tone: industrial-quiet. Think boat-captain's chart, not dashboard. Minimal, precise, confident.

### What the app is

Odysseus is an internal production management platform replacing a SaaS called Clarity Go. It handles the full journey from customer quote to signage delivery. Clients never log in — they're data records. Staff (Onesign employees) are the only users.

The canonical pipeline:

```
QUOTE → ARTWORK → PRODUCTION → DELIVERY
                                  ↘
                               INVOICE (branches off quote acceptance)
```

### Entities to visualise

Treat each of these as a **named node**. Sizes should reflect importance.

**Pipeline nodes (primary — large, central):**
- **QUOTE** — reference `OSD-YYYY-NNNNNN`. Line items, each either production-work or service.
- **ARTWORK** — reference `AWC-YYYY-NNNNNN`. The *spec-bearing record*: materials, dimensions, finishes, target department. Sub-items = spec-bearing row.
- **PRODUCTION** — reference `JOB-YYYY-NNNNNN`. Kanban across 13 real departments. Staff advance items stage-by-stage.
- **DELIVERY** — reference `DEL-YYYY-NNNNNN`. Driver assignment, proof of delivery.

**Branch nodes (secondary — medium):**
- **INVOICE** — reference `INV-YYYY-NNNNNN`. Branches from quote acceptance (manual button today).
- **PURCHASE ORDER** — reference `PO-YYYY-NNNNNN`. Manual linkage only.

**Substrate nodes (cross-cutting — smaller):**
- **CLIENTS** — orgs + contacts + sites. Every downstream record inherits `org_id`, `contact_id`, `site_id` from the quote. In the UI they're "clients"; in the schema they're "orgs".
- **STAFF / AUTH** — Supabase SSR, super_admin profiles, `/login`, `/signup`.
- **PRICING** — rate cards that feed the quote engine.
- **MAINTENANCE** — scheduled visits (separate workflow).

**Surface nodes (where work happens):**
- `/admin/quotes`, `/admin/artwork`, `/admin/jobs`, `/admin/deliveries`, `/admin/invoices`, `/admin/purchase-orders`, `/admin/clients`, `/admin/pricing`, `/admin/maintenance`, `/admin/approvals`, `/admin/reports`
- `/shop-floor` — touch-friendly department queue (no sidebar).
- `/approve/artwork/[token]` — external client approval page. No auth, token-based.
- `/delivery/[token]` — external proof-of-delivery. No auth, token-based.

**Legacy nodes (dim, de-emphasised):**
- `/dashboard`, `/assets`, `/billing`, `/deliverables`, `/reports` (client-facing leftovers from a multi-tenant SaaS past — clients don't log in now).
- `/admin/orgs`, `/admin/subscriptions`, `/admin/leads`, `/components` — orphaned routes.

### Connections to draw

Use **line style** to communicate semantics:

**Thick solid teal** — primary pipeline (wired, working today):
- Quote → Artwork (via "Generate artwork" action)
- Artwork → Production (via "Release to production" — rebuilds stage routing)
- Production → Delivery (auto-created when last item reaches Goods Out)

**Dashed teal, thin** — data inheritance:
- Clients → Quote, Artwork, Production, Delivery (org/contact/site flow downstream)
- Staff → every pipeline node (created_by)
- Pricing → Quote

**Dashed amber** — partial / manual (works but needs admin to push the button):
- Quote → Invoice (manual button on quote page)
- Quote → Purchase Order (manual nav, no trigger)

**Dashed red** — MISSING link (the email gap — this is the biggest open work):
- Artwork → `/approve/artwork/[token]` (token generated, but no email send)
- Delivery → `/delivery/[token]` (token exists, but no send action at all)

### Data points worth surfacing

Include these quiet numerics as subtitles / tooltips / annotations where they fit:

- 50 database migrations applied
- 57 page routes, 6 API routes, 9 print views
- 163 / 164 unit tests passing (one Zod schema bug surfaced)
- Live DB as of snapshot: 15 clients · 11 contacts · 11 sites · 9 quotes · 17 artwork jobs · 2 production jobs · 2 deliveries · **0 invoices** · **0 POs** (← suggests invoice/PO flow isn't being used yet)
- 13 production stages, from `order-book` through `artwork-approval`, 10 department stages, ending at `goods-out`
- Full quote → delivery pipeline proven end-to-end by an automated CRUD walkthrough

### Aesthetic direction

This should feel like a **captain's chart or control panel**, not a slide. Look at these for reference:

- Edward Tufte's small multiples
- A24 movie posters — restrained palette, generous negative space
- Apple's Keynote schematics (but darker)
- Observable / D3 gallery — but static, not interactive

Specific stylistic requests:

- **Concentric or radial layout** with the pipeline as either a vertical axis through the centre or a curved flow around an `ODYSSEUS` hub. Not a boring left-to-right flowchart.
- **Generous negative space**. Don't fill the canvas.
- **Typography as a graphic element**: tracked-out uppercase labels for sections, monospace for route paths, regular sans for body.
- **Subtle depth** via radial gradients on nodes, soft outer glows, barely-there grid backdrop at 5–8% opacity.
- **Line quality matters**: smooth Bezier curves, varying stroke weight for hierarchy, directional arrows only where flow matters (not everywhere).
- **Minimal colour**: stick to the teal. Use amber and red only for the two "gap" states above. No gratuitous rainbow.
- One or two small numerical cards or legend items below the diagram — don't clutter the canvas with every stat.

### Deliverable

A single `.html` file. Should include:

1. A brief header with title and date.
2. A legend (line-style → meaning) — 4 items max.
3. The main SVG diagram (aim ~1600×1000 viewBox).
4. 4–6 short prose cards below the diagram explaining the most important insights (one insight each, 2 sentences tops).
5. A quiet footer with the project name.

Do not include:

- Interactivity beyond simple hover tooltips (optional).
- Placeholder lorem ipsum.
- External image URLs or CDN dependencies.
- Emoji.

### Success criteria

I should be able to:

- Print it as a single landscape A3 and pin it above my desk.
- Glance at it and immediately find: where is the missing email wiring, what flows into what, what's legacy.
- Feel that it was designed, not auto-generated.

---

*(End of prompt — everything above this line goes to Claude Design.)*
