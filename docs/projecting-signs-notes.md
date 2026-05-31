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
- **Change-set 8 (next):** composite 3D — render both panels together (blade
  perpendicular, mounted on the fascia), double-sided.
- **Change-set 9:** per-panel PDF + backshop export.

---

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
