# Handoff — add "projecting signs" to the visualiser

> A self-contained brief so a fresh Claude chat can add **projecting signs**
> to the Onesign Odysseus signage visualiser, following the same pattern as the
> existing flat fascia signs. Written 2026-05-31. Read this top-to-bottom, then
> see **§8 Autonomous kickoff with `/goal`** for a paste-ready brief.

---

## 1. The goal

Today the visualiser models a **flat fascia** — a folded-aluminium tray that
mounts flat against a wall, facing forward. Add a second sign type: a
**projecting sign** (a.k.a. blade / fin sign) — the *same tray construction*
but mounted **perpendicular to the wall on a bracket**, projecting out so it's
read from the street. Typically **double-sided**.

It must follow the existing pattern: one `PanelParams` discriminator drives the
3D mesh, the flat development, both PDFs, and the backshop snapshot — no new
parallel pipeline.

**Definition of done:** a `signType: 'fascia' | 'projecting'` choice in the
controls; when `projecting`, the 3D scene shows the tray held off a wall on a
bracket (double-sided artwork option); the flat-development + production PDF
gain the bracket / wall-plate; the reference PDF + backshop note the type,
projection and sidedness. `fascia` behaviour is 100% unchanged. tsc + vitest +
eslint green; verified in the live preview; committed and pushed per change-set.

---

## 2. Project context

Onesign Odysseus is the internal production platform for Onesign & Digital
(Next.js 16 App Router, TS strict, Tailwind 4, Supabase, Zustand, React Three
Fiber + drei + three, jsPDF, Vitest). **Read `CLAUDE.md` first** — it has the
brand, stack, conventions, schema, and architectural invariants. Brand accent
`#4e7e8c`. No emoji in code/commits. Comments explain WHY not WHAT.

The visualiser lives at `app/(portal)/admin/visualiser/` (UI) and
`lib/visualiser/` (logic). It is **super-admin gated** (`requireAdmin()` in
`page.tsx`). `PanelParams` is the single source of truth — the 3D mesh, the flat
development, and both exporters all derive from it.

---

## 3. Current architecture — the fascia pattern

### 3.1 Data model — `lib/visualiser/types.ts`
`PanelParamsSchema` (Zod) is the spec. Key fields:
- `name`, `panelWidthMm`, `panelHeightMm`, `materialThicknessMm`, `panelColor`
- `returnDepthMm` + `returns {top,bottom,left,right}` — the folded edges (tray depth)
- `shadowGapMm` + `shadowGapEdges {top,bottom}` — inward lip at the return tip
- `keylineMm` — outward offset around the aperture cut
- `apertureMode: 'aperture' | 'standoff'` + placement (`AperturePlacement`)
- `materialGroups` — per-path material assignment (cut/solid/vinyl/acrylic/standoff/pushthrough)
- `artworkLayers[]` — multiple independently-placed artwork pieces (composited)
- `illumination.keyline {enabled,color,intensity}`
- `manualFixings[]`, `cableHoles[]`, standoff/letter specs, `centrePanelOverrideMm`
- Also exported: `Returns`, `AperturePlacement`, `ApertureMode`,
  `PanelDevelopment`, `PanelSegment` (`role: SegmentRole`, `edge`, x/y/w/h),
  `SectionedExport`/`SectionLayout`, `FlatPath`, `MaterialPiece`,
  `StandoffPiece`, `PushThroughPiece`, `ExportWarning`, `VisualiserDesignRow`,
  `SaveDesignInputSchema`.

### 3.2 Geometry — `lib/visualiser/geometry.ts` (pure, unit-tested)
- `buildDevelopment(params): PanelDevelopment` — unfolds the tray into flat
  segments (face + returns + lips), applying the bend deduction
  (`bendDeductionPerSide = thickness/2`).
- `placementTransform()`, `placeAperture()` — map artwork onto the face.
- `clipApertureToFace()`, `clipApertureToSection()` — clip cuts to the face / split sections.
- `outlinePerimeter()`, `placeFixings()`, `circlePoly()`.
- `splitPanels()` (`lib/visualiser/split.ts`) — splits a too-wide face across sheets.
- `buildSectionedExport(params, split): SectionedExport` — per-section export geometry.
- `validateExport(opts): ExportWarning[]` — material/clip/fold/seam advisories.
- Other libs: `svg-import.ts` (`importSvg`, `buildKeyline`), `compose.ts`
  (`composeLayers`/`composeLayersSvg` for multi-layer artwork),
  `trace.ts` (PNG→SVG tracer), `image.ts` (`trimImageDataUrl`/`findContentBounds`).

### 3.3 3D — `app/(portal)/admin/visualiser/Scene3D.tsx` (~2050 lines, R3F)
- `<Canvas camera={{position:[reach, reach*0.7, reach], fov:45}}>` + `<OrbitControls>`.
- `S = 0.01` mm→scene-units scale. **The panel faces +Z.**
- `<Panel>` builds the face + returns + lips + apertures + push-through inserts
  + standoff letters + fixings + dimensions from the same params/geometry.
- `meshBasicMaterial` everywhere (no real lights); "illumination/night" view
  darkens the background + surfaces and lets emissive elements glow.
- **`sceneCapture`** (exported): `{ fn, faceOn }`. `fn` = current orbit shot
  (used by the reference PDF); `faceOn` = straight-on orthographic shot framed
  to the sign bounds (used by the backshop thumbnail). Set by `CaptureBinder`.

### 3.4 Flat 2D — `app/(portal)/admin/visualiser/FlatPreview.tsx`
SVG of the flat development with state-driven `viewBox` (scroll-zoom + fit
controls), path-pick overlays, layer-drag handles, fixings/cable rings.

### 3.5 PDFs — `lib/visualiser/pdf.ts` (~2400 lines, jsPDF)
- `generateReferencePdfBlob(opts)` — A4 landscape shop drawing (overview/spec +
  3D thumbnail, flat layout with dimensions, one page per material).
- `generateProductionPdfBlob(opts)` — 1:1 CAM bundle (panel cut, push-through
  inserts, backing panel, per-material cut pages, placement template). Acrylic /
  vinyl / stood-off pieces are filled in their real colour (FD), counters white.
- `pdfFilename(params, kind)`. Both take the same `*BySection` geometry arrays
  + piece arrays computed in `VisualiserClient`.

### 3.6 Orchestration
- `store.ts` (Zustand) — `params`, `imported`, `designId`, `dirty`,
  `markSaved`, group-edit + fixing + cable modes, artwork-layer actions,
  `setParam`, `applyPrefill`, `loadDesign`.
- `VisualiserClient.tsx` (~1900 lines) — computes `development`, `sectionExport`,
  the `*BySection` arrays + `materialPieces`/`standoffPieces`/`pushThroughPieces`,
  the unified `advisories`, runs tabs (3D folded / unfold / flat), the Display
  panel, editable 3D dimension widgets, and renders `ControlsPanel`,
  `SvgDropzone`, `Scene3D`/`FlatPreview`, `ExportBar`.
- `ControlsPanel.tsx` — left rail: panel dimensions, material spec, illumination
  (collapsible `Section.tsx`).
- `ExportBar.tsx` — production/reference PDF + Save + **Add/Update backshop screen**.
- `page.tsx` — `requireAdmin()`, `listDesigns()`, `?id=`/`?quoteItemId=` prefill.

### 3.7 Backshop integration (the most recent pattern to mirror)
`lib/backshop/` + `app/backshop/` (top-level, `requireAuth`, light theme TV
board). `ExportBar` pushes a snapshot (face-on thumbnail + reference PDF +
contextual stages) via `addToBackshop`. Stages are contextual
(`BACKSHOP_STAGE_CATALOG` + `checksForFeatures`). See CLAUDE.md decision §2b.

---

## 4. How to add projecting signs (layer by layer)

The tray construction is reused; a projecting sign is the **same panel oriented
perpendicular on a bracket**. Touch points, in dependency order:

1. **`types.ts`** — add to `PanelParamsSchema`:
   - `signType: z.enum(['fascia','projecting']).optional()` (absent → `'fascia'`,
     so every saved design still loads unchanged).
   - A `projecting` sub-object (all optional, with defaults applied in code):
     `projectionMm` (how far it stands off the wall, default ~600),
     `doubleSided` (default `true`), `bracketStyle`
     (`'flat-plate' | 'box-arm' | 'scroll'`, default `'box-arm'`),
     `wallPlate {widthMm,heightMm}` / fixing-centres spec.
   - Keep these additive + optional; never make `fascia` paths read new required fields.

2. **`store.ts` / `ControlsPanel.tsx`** — a sign-type selector (Fascia /
   Projecting) at the top of the controls; when `projecting`, reveal a
   "Projecting" `Section` (projection distance, double-sided toggle, bracket
   style, wall-plate size). Default `signType` so existing designs are `fascia`.

3. **`Scene3D.tsx`** — when `signType==='projecting'`:
   - Wrap/transform the existing `<Panel>` group so the tray sits perpendicular
     to a wall (rotate about Y so the face reads side-on; the wall is the XY
     plane behind it). Reuse the Panel mesh — do **not** fork it.
   - Add a thin **wall** plane + a **bracket** (`bracketStyle`): a wall-plate +
     an arm/box holding the panel `projectionMm` off the wall. Brushed-metal grey.
   - Double-sided: ensure artwork/material faces render on both sides (or mirror
     the artwork group to the back face). `meshBasicMaterial` is single-sided by
     default — set `side: THREE.DoubleSide` or add a back instance.
   - The `faceOn` capture already frames the bounds — confirm it still produces a
     clean face shot (you may want it to ignore the wall/bracket; trim handles margins).

4. **`VisualiserClient.tsx`** — the flat development of the tray is unchanged
   (you still cut the same panel), so `buildDevelopment`/`buildSectionedExport`
   likely need **no change**. Add the bracket/wall-plate as extra export geometry
   if production fabricates it (else treat as bought-in and just spec it).

5. **`FlatPreview.tsx`** — only if the bracket/plate is cut: add its outline to
   the flat layout. Otherwise unchanged.

6. **`pdf.ts`** — reference PDF: add a "Sign type: Projecting · projection Nmm ·
   double-sided" line to the spec block + the bracket note. Production PDF: a
   bracket / wall-plate cut+fixing page (or a "bracket bought-in: <spec>" note).

7. **Backshop** (`lib/backshop/*`, `ExportBar`) — optional but on-pattern: add a
   contextual feature/stage (e.g. `bracket` / "Wall fixing") so projecting signs
   show a Bracket gate; surface "Projecting · double-sided" in the Build column
   (extend `BACKSHOP_STAGE_CATALOG` + `elementsForChecks`, and pass the feature
   from `ExportBar`'s `features` object). If you add a stage key, no migration is
   needed — `checks` is free-form JSONB; only update the TS catalog.

8. **Migration** — only if you add a *persisted* column. The visualiser stores
   everything inside `visualiser_designs.params_json` (JSONB), so adding
   `signType`/`projecting` to `PanelParams` needs **no migration**. A migration is
   only needed if you add a real backshop column (you shouldn't — derive from checks).

---

## 5. Recommended defaults (so unattended work isn't blocked)

Pick these unless the repo clearly says otherwise; note any you change:
- `signType` absent ⇒ `'fascia'` (backward compatible).
- Projecting default: `doubleSided: true`, `projectionMm: 600`,
  `bracketStyle: 'box-arm'`, wall-plate ~300×300mm.
- Reuse the folded-tray construction for the projecting panel (don't invent a new build).
- Bracket is **bought-in** for v1 — spec it on the PDFs rather than generating a
  fabrication drawing (keeps scope tight; can add a cut page later).
- Keep the flat-development / production-cut of the tray identical to fascia.

---

## 6. Open questions (resolve with the user OR default per §5 and document)

- Double-sided always, or single-sided option? (default: double, toggle present)
- Bracket: bought-in + spec only, or fabricated with a cut/weld drawing? (default: bought-in)
- Bracket styles to offer (flat-plate / box-arm / scroll)? (default: all three, box-arm default)
- Does production need a separate bracket page on the PDF? (default: a spec note, not a drawing)
- Projection distance range + default? (default 600mm, clamp e.g. 150–1500)

For an unattended run: **choose the defaults, implement, and write the
assumptions into the commit body + a short `docs/projecting-signs-notes.md`** so
the user can adjust on return rather than being blocked.

---

## 7. Conventions & verification (do this every change-set)

- **Verify:** `npx tsc --noEmit` (clean) · `npx vitest run lib/visualiser lib/backshop --exclude ".claude/**"` (all pass; add unit tests for any new pure geometry/helpers) · `npx eslint <changed files>` (0 errors). Note the eslint rule **`react-hooks/set-state-in-effect` is an ERROR** here — never call `setState` synchronously in an effect body; use the "adjust state during render with a stored prev key" pattern, or defer in a rAF/callback.
- **Live walk (UI changes):** the visualiser is `requireAdmin`. To screenshot without a session, create a throwaway `app/ux-walk*/page.tsx` that renders the client component with mock/empty props, add `.claude/launch.json` (`npm run dev -- -p 3001`), start it with the **Claude Preview MCP** (`preview_start`/`preview_eval`/`preview_screenshot`), walk it, then **delete the sandbox + launch.json + `.next`** and re-run tsc. The preview viewport is ~480px (mobile) and `resizeTo` is ignored — design responsive and confirm the wide layout on the real TV. **Do NOT insert fabricated rows into the production Supabase DB** (the auto-mode classifier blocks it, rightly) — use mock props instead.
- **DB:** apply additive migrations via the Supabase MCP `apply_migration` (project `duilwyurfywrltwkiaha`). Highest migration is **059** (next is 060). You almost certainly need none (params live in JSONB).
- **Git:** branch off `master` only if asked; otherwise commit per change-set with a clear body and push to `master` (the user has been working directly on master this session). End every commit message with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
  No emoji. Expect benign CRLF warnings on Windows.
- **Memory:** live Supabase project is `duilwyurfywrltwkiaha` (listed as "onesign-employee-hub", not the repo name).

---

## 8. Autonomous kickoff with `/goal`

`/goal` is a UI command you run yourself (it can't be launched by Claude). Open a
**new chat in this repo** and paste the brief below after `/goal`. It's
self-contained, so it also works with `/loop` or as a plain first message if you
prefer. It tells Claude to make sensible decisions and keep going rather than
stop to ask — so you can leave it running while you're at the gym.

```
/goal Add "projecting signs" to the Onesign Odysseus visualiser. First read
docs/projecting-signs-handoff.md and CLAUDE.md in full — they contain the
architecture, the exact files to touch, recommended defaults, and the
verification loop. Then implement projecting signs following the SAME pattern as
the existing flat fascia: one `signType: 'fascia' | 'projecting'` discriminator
in PanelParams (absent => 'fascia', fully backward compatible) that drives the
3D scene, controls, PDFs, and backshop snapshot — no parallel pipeline.

Scope for this run:
- types.ts: add `signType` + an optional `projecting` sub-object (projectionMm,
  doubleSided, bracketStyle, wallPlate) — additive/optional only.
- ControlsPanel + store: a Fascia/Projecting selector + a Projecting section.
- Scene3D: when projecting, reuse the existing <Panel> but orient it
  perpendicular to a wall on a bracket; render wall + bracket; double-sided
  artwork. Keep `sceneCapture.faceOn` producing a clean face shot.
- pdf.ts: note sign type/projection/sidedness on the reference PDF; bracket spec
  note on production (bracket bought-in for v1, no fab drawing).
- Backshop (optional, on-pattern): a "Bracket"/projecting contextual element.
- Leave the folded-tray flat development + cut identical to fascia.

Work autonomously: choose the recommended defaults in §5 of the handoff, make
reasonable assumptions rather than blocking on questions, and record every
assumption in the commit bodies and a new docs/projecting-signs-notes.md.

Guardrails:
- Fascia behaviour must be 100% unchanged. Don't touch the token/unauth routes
  or the backshop auth model. No destructive git/DB ops. Don't insert demo rows
  into the production DB — verify UI with the throwaway-sandbox + Claude Preview
  technique in §7, then clean up the sandbox.
- After EACH change-set: `npx tsc --noEmit`, `npx vitest run lib/visualiser
  lib/backshop --exclude ".claude/**"`, and eslint the changed files must all be
  green (remember set-state-in-effect is an error). Add unit tests for any new
  pure geometry/helpers. Commit per change-set ending with the Co-Authored-By
  line, no emoji, and push to master.
- Probably no DB migration is needed (params live in visualiser_designs JSONB);
  only add one via the Supabase MCP if you genuinely persist a new column.

Stop and summarise when the definition of done in §1 of the handoff is met
(projecting signs work end-to-end, fascia unchanged, everything green and
pushed), or if you hit a genuinely blocking ambiguity you can't resolve with a
documented default.
```

> Tip: if you'd rather it pause for your input at key milestones, drop the
> "Work autonomously / make reasonable assumptions" sentence and it'll ask.
```
