# Projecting signs — implementation notes & assumptions

## v2 — two-tab composite model (current)

The original single-panel `signType: fascia | projecting` toggle (v1, below)
was **replaced** at the user's direction after they shared a shopfront photo:
a projecting sign that protrudes directly off the fascia, like a real blade
sign. The new model:

- A **design = a main fascia panel + an optional projecting (blade) sign**,
  edited on **two tabs** ("Main panel" / "Projecting sign"). Each tab is a full
  panel with its own dimensions, artwork (SVG), materials and colours.
- The blade is **seeded as a mirror of the main panel** (`seedProjectingFromMain`)
  then fully editable — decision: *mirrors main, then editable*.
- Both panels are **visualised together** in one 3D scene (fascia on the wall,
  blade protruding perpendicular), with the blade positioned/scaled via its own
  dimensions + a **Mounting** section (side, position across, height from top,
  double-sided, bracket style).
- **Separate exports per panel** — each panel gets its own PDF / backshop item.
- **No DB migration**: the whole blade (`panel` + `mount` + its `svgSource`)
  nests inside `params_json.projectingSign`. Old designs (no `projectingSign`)
  load as a main panel only.

### Store design (the key mechanism)
Only ONE panel is "live" at a time (the active tab); the other is stashed in
`inactive` and swapped in on tab change (`setActiveTab`). This keeps every
existing per-panel edit action operating on a single `params`/`svgSource`/
`imported` target untouched. `splitPanels(state)` resolves main-vs-projecting
regardless of which tab is live; the save path (`assembleMain` in ExportBar)
and the 3D composite both go through it. The blade's mount lives in top-level
store state (`mount`).

### Staged delivery
- **Change-set 7 (this):** data model + store tabs + controls + helpers/tests.
  Each panel edits + renders + saves/loads on its own tab. The old single-panel
  3D wall/bracket + PDF/backshop projecting additions were reverted (they
  belonged to the replaced model).
- **Change-set 8 (done):** composite 3D. The active panel renders in full
  (editable); the other panel is drawn as a positioned, correctly-sized ghost
  slab (`CompositeGhost` in Scene3D) so both signs read together in real space.
  From the Main tab the blade ghost protrudes perpendicular at the mounted
  edge (shopfront arrangement); from the Projecting tab the fascia ghost is the
  wall the blade mounts to. Position (mount side/offsets) + scale (each panel's
  own dimensions) drive it live. Verified in the live app (both tabs, no
  console errors).
  - **Known follow-up:** the ghost shows footprint + colour, not the inactive
    panel's artwork. Full artwork on BOTH panels simultaneously needs the
    Scene3D geometry pipeline (the ~30 derivation useMemos in VisualiserClient)
    extracted into a reusable `derivePanelScene(params, imported, svg)` and run
    for both panels. Deferred deliberately — that extraction is the highest-risk
    change in the codebase and is best done as its own focused pass. You see
    each panel's full artwork by switching to its tab.
- **Change-set 9 (done):** per-panel export. Exports are **per active tab** —
  the reference/production PDF and backshop push all act on the panel of the
  current tab (its own derived geometry + `name`, so the blade's sheets are
  named "… — projecting"). To export both, push/print from each tab. When the
  blade tab is active, the backshop item carries the projecting spec line on
  its Build column and the contextual **Wall fixing** (bracket) stage. This is
  the "separate sheets per panel" decision — each panel is an independent
  fabrication item.

---

### Change-set 10 — shape + small default + off-the-face mount

Refinements from the Wallsend shopfront photo:
- The projecting sign **defaults to a small square** (`DEFAULT_PROJECTING_SIZE_MM`
  = 500mm), not a clone of the fascia size. `seedProjectingFromMain` now mirrors
  the main panel's **look** (colour, material, thickness) but starts with
  **fresh artwork** and small square dims — the fascia-scale artwork can't
  sensibly transfer to a small sign, so you add the sign's own artwork on its
  tab.
- It **always mounts on the fascia FACE and projects perpendicular** out toward
  the street — the left/right `side` mount was removed. `mount` is now
  `{ offsetXMm (across the face), offsetYMm (down from top), shape, doubleSided,
  bracketStyle }`.
- **Shape: square | circle** (`mount.shape`, default square). The composite
  ghost renders a thin box (square) or a thin disc with its axis along X
  (circle), positioned on the face and protruding +Z. Verified live for both.
- **Known follow-up (unchanged):** the active-tab full render still uses the
  rectangular Panel pipeline, so a circle is edited on a rectangular face and
  the shape is conveyed in the composite; the inactive panel is still a colour
  ghost (no artwork). Full shaped + artworked panels need the geometry-pipeline
  extraction noted under change-set 8.

### Change-set 12 — enclosed box, design-in-composite, drag, transition

From the shopfront top-view feedback:
- **Enclosed box** — `Panel` gains an `enclosed` prop that closes the tray back
  (a panel at z = -returnDepth); passed wherever the projecting sign renders, so
  it is a sealed box, not an open-backed tray. Fascia stays an open tray.
- **Design remains in the composite** — the projecting sign's artwork is composed
  to an SVG (`secondaryArtworkSvg`) and rasterised to a texture mapped on the
  sign's face(s) in `SecondaryTray`, so its design shows on the main tab (and
  the back face too when double-sided). Silhouette-quality (black shapes) — the
  full apertured artwork shows when you edit the sign on its own tab.
- **Drag to position** — the projecting sign is draggable in the viewer: pointer
  events on its group raycast onto the fascia face (z=0) and update the mount
  offsets (`onRepositionProjecting` → `setMount`), disabling orbit while
  dragging. Numeric Position-across / Height controls remain.
- **Mode transition** — `CameraFocus` flies the camera to frame the active
  panel whenever the tab changes (tight on the small projecting sign, wide for
  the composite), via a finite frame-counted easeOut tween that always
  terminates (so the canvas goes idle). The fascia reads as a faded ghost slab
  while editing the projecting sign.

**Verification note:** tsc + 102 vitest + eslint all green (only the long-
standing `DimensionEditLabel` set-state-in-effect error remains). The enclosed
box was confirmed live; (B)/(C)/(D) could NOT be screenshot-verified this
session — the Claude Preview capture pipeline wedged (screenshots timed out even
on non-canvas pages while `preview_eval` stayed responsive and the console was
error-free). The camera tween is frame-counted specifically so it cannot peg
the renderer. Worth a hands-on pass: drag feel + the transition timing, and the
artwork texture's appearance/orientation on the sign faces.

### Change-set 13 — signs stay in situ; tab switch only shifts focus

Fixes the "editing the projecting sign teleports it to the centre" flaw. The
swap-to-origin render is gone. Now BOTH panels render in FIXED in-situ
positions and never move on tab change:
- The **fascia is always at the origin** — the full editable Panel when it is
  the focus, a faded backdrop (`FadedFascia`: dim plane + faint design texture)
  while the projecting sign is being edited.
- The **projecting sign is always mounted perpendicular in situ** (at its mount
  offset). `SecondaryTray` became `ProjectingMounted`, which always renders the
  perpendicular, draggable mount; its content is either the full editable Panel
  (when it's the focus — so editing keeps it in place) or the lightweight
  tray + design texture (when the fascia is the focus). Circle stays a disc.
- Switching tabs only **flies the camera** to the focused panel — to the
  projecting sign's true in-situ centre when editing it (not the origin) — and
  fades the other. Nothing repositions, so you can position the sign and see it
  in situ while editing.
- Rotated-in-situ editing disables the 3D click handlers (fixing/path-pick
  coords assume a face at the origin); the sign is edited via the controls +
  drag + artwork upload. Drag-to-position works in both focus states.

**Verification:** tsc + 102 vitest + eslint green (only the pre-existing
`DimensionEditLabel` error). Live verification was AGAIN blocked — the Claude
Preview environment was wedged this session (routes 404'd / navigation stuck on
a fresh server; not a code issue, tsc clean). Needs a hands-on pass to confirm
the focus fly + the in-situ feel.

### Change-set 14 — both signs show full design (cached bundle)

Fixes: the non-active sign fell back to a flat silhouette (its material groups /
apertures / acrylic weren't shown), so the two signs didn't both show their
real design. Now both always do, via a render-bundle cache (no second pipeline
pass, so the active editing path is untouched):
- `PanelRenderBundle` (types.ts) captures everything the 3D needs to draw a
  panel's full design (development, split, aperture, keyline, push-through,
  fixings, material pieces, standoff).
- VisualiserClient assembles the ACTIVE panel's bundle and caches it to the
  store (`bundles.{main,projecting}`, keyed by tab) in an effect.
- The non-active sign reads its cached bundle and renders via `BundlePanel`
  (a non-interactive `<Panel>`) — identical material-group geometry to when it
  was being edited. Falls back to the tray+texture / faded slab only before a
  panel has ever been the active one. Circle still falls back to a disc.
- Because apertures render with edge outlines (FacePlane `<Edges>`), an
  uploaded SVG now shows as outlined cuts on both signs even before material
  grouping — resolving "can't tell if an SVG was uploaded".
- Cache validity: a non-active panel can't be edited, so its cached bundle
  stays correct; editing a sign re-caches it before you switch away.

Done after a /design-critique (consistency + the upload-feedback gap were the
top findings). tsc + 102 vitest + eslint green (only the pre-existing
DimensionEditLabel error). Live verification still blocked by the wedged preview
environment — needs a hands-on pass (upload an SVG to the projecting sign, group
materials, switch to Main, confirm the full design shows on the in-situ sign).

### Change-set 15 — dark-view ambient lighting

The illumination (dark) view crushed every surface to ~17% albedo, so only the
emissive keyline glow was visible — panels/acrylics went black. The renderer is
UNLIT (meshBasicMaterial ignores scene lights), so "ambient" is simulated by how
much albedo survives. Changes in `Scene3D.tsx`:
- `NIGHT_FACTOR` (0.17) → `NIGHT_AMBIENT` (0.5): material colours now read at
  night while emissive elements still dominate by contrast.
- `NIGHT_BG` `#0a0b0d` → `#0e131b` (dusk blue-grey) so dim surfaces separate
  from the void instead of disappearing.
These are the two dials to tune. This is the base ambient layer; the different
illumination TYPES (face-lit, halo, edge-lit, internally-lit acrylic…) build on
top by making specific surfaces self-lit (emissive) — that's the next step.
A real lit pipeline (meshStandardMaterial + lights) was considered and rejected:
it would force a conditional material swap on every mesh and change the crisp
day/diagram look for no benefit the albedo-multiply doesn't already give.

tsc + 102 vitest + eslint green (only the pre-existing DimensionEditLabel
error). Preview environment wedged — not verified live; the values are easy to
tune once seen.

### Change-set 16 — PDFs cover both signs (after /design-critique)

Both exports now include the projecting sign alongside the fascia, one
document, professional + unambiguous on a workshop floor. Critique priorities
applied: per-item page labelling (anti-mix-up), scope-up-front, mount stated
once.
- `PdfOptions` gains `secondary?` (the other item's full opts), `itemLabel?`
  (shown on every page of a two-item job) and `companionNote?` (reference
  overview callout).
- **Production**: the 720-line job-builder was wrapped in a per-item `buildJobs`
  (by ALIASING opts/params/sectionExport — body byte-identical, zero risk to the
  single-panel output). Jobs for the fascia then the projecting sign are
  concatenated; every page's subtitle + footer is prefixed with the item name.
- **Reference**: loops over the item(s), emitting the same overview/flat/
  material pages per item with the item name in the header; the fascia overview
  shows an "ALSO IN THIS JOB" callout with the projecting spec + mount.
- **Data**: a per-tab `pdfData` cache (mirrors the render-bundle cache) holds
  each panel's sectioned export geometry; VisualiserClient caches the active
  panel's, ExportBar passes the OTHER panel's as `secondary`. Single-item
  designs are unchanged (no secondary, no labels). The per-item board PDF (the
  backshop snapshot) stays single-item.

NOTE: PDFs cannot be rendered/verified in this environment (client-side jsPDF
downloads). The single-panel path is byte-identical (production logic untouched
via aliasing; reference 1-item loop = original pages, no label). The two-item
path reuses the identical per-panel logic. Still needs a hands-on check of an
actual exported PDF before relying on it for fabrication. tsc + 102 vitest +
eslint green (only the pre-existing DimensionEditLabel error).

## v1 — single-panel toggle (REPLACED, kept for history)

Implemented from `docs/projecting-signs-handoff.md`. Run autonomously per the
handoff's §8 brief; the user pre-approved **fully autonomous** execution and a
**bought-in bracket (spec note only, no fabrication drawing)** for v1.

This file records the assumptions made so they can be adjusted on return rather
than reverse-engineered.

## Decisions taken (defaults per handoff §5)

- `signType` absent ⇒ `'fascia'`. Encoded in exactly one place: `signTypeOf()`
  in `lib/visualiser/projecting.ts`. No fascia code path reads any projecting
  field, so every previously-saved design loads byte-for-byte unchanged.
- Projecting defaults (`DEFAULT_PROJECTING` in `types.ts`):
  `projectionMm: 600`, `doubleSided: true`, `bracketStyle: 'box-arm'`,
  `wallPlate: 300×300mm`.
- Projection clamp: **150–1500mm** (Zod `.min(150).max(1500)`).
- Bracket styles offered: `flat-plate`, `box-arm` (default), `scroll`.
- **Bracket is bought-in.** PDFs spec it (`bracketSpecNote`) rather than
  generating a cut/weld drawing. The flat development + production cut of the
  tray are **identical to fascia** — `buildDevelopment` / `buildSectionedExport`
  are untouched.
- No DB migration: `signType` + `projecting` live inside
  `visualiser_designs.params_json` (JSONB). Backshop stage added to the TS
  catalog only (`checks` is free-form JSONB).

## Open questions left at defaults (revisit if needed)

- Single-sided is supported via the `doubleSided` toggle but defaults to double.
- Scroll bracket is represented schematically in 3D (it's bought-in; the 3D is
  indicative, not a manufacturing model).

## Change-sets

1. **types + helpers** — `signType` discriminator + optional `projecting`
   sub-object on `PanelParamsSchema`; `lib/visualiser/projecting.ts` pure
   helpers (`signTypeOf`, `resolveProjecting`, `projectingSpecLine`,
   `bracketSpecNote`) + tests.
2. **controls** — Fascia/Projecting selector + Projecting section
   (ControlsPanel) and a `setProjecting` store action.
3. **3D scene** — `ProjectingMount` (wall slab + wall plate + style-specific
   bracket arms) rendered beside the unchanged `<Panel>` when projecting +
   folded; double-sided draws a second non-interactive `<Panel>` rotated 180°
   about Y and offset by the tray depth so both artwork faces sit on the box.
   `sceneCapture.faceOn` hides the mount during capture so the backshop
   thumbnail frames the sign face alone; the angled reference shot keeps it.
4. **PDFs** — reference spec block gains Sign type + Projection/Sides/Bracket
   rows; production panel-cut page gains a teal bracket-spec info band (bought-
   in, height-reserved so it never collides with the footer/warning). Tray cut
   unchanged.
5. **Backshop** — new `bracket` feature → contextual "Wall fixing" stage
   (appended last) + "Projecting (bracket)" Build-column element; ExportBar
   passes `bracket: isProjecting` and prefixes the board description with the
   projecting spec line. No migration (checks is JSONB; TS catalog only).

## Polish pass (post design-critique)

A /design-critique round flagged small clarity/consistency items, applied in
change-set 6:
- Reference PDF "Sign type" row is now **projecting-only** — a fascia drawing
  is byte-identical to before projecting signs existed (the tool was always
  fascia). Tightens the "fascia unchanged" guarantee.
- Double-sided toggle gained a helper line (matching the keyline-toggle
  pattern); bracket-style buttons gained a "bought-in, box-arm default" helper.
- Projection field hint now states the 150–1500 mm range.

## 3D geometry notes

- The sign keeps its native +Z-facing orientation (so faceOn + the default
  orbit shot still frame the artwork); the wall is a vertical slab placed
  perpendicular to the face, to the left, `projectionMm` from the near edge.
  This is the same physical object as "panel rotated onto a facade", just in
  the coordinate frame the scene already uses — and it avoids re-pointing the
  capture cameras.
- Double-sided with `returnDepthMm === 0` makes the two faces coincide
  (z-fight). A projecting blade realistically has a tray depth, so this is
  left as a benign edge case rather than special-cased.

## Pre-existing lint (NOT introduced here)

`Scene3D.tsx` already carried 1 eslint error (`react-hooks/set-state-in-effect`
in `DimensionEditLabel`) + 2 warnings at HEAD before this work — verified by
linting the stashed/HEAD version. They live in shared fascia code (the
dimension-edit widget / Panel internals), so they were left untouched to keep
the "fascia 100% unchanged" guarantee. The new projecting code adds zero lint
problems.
