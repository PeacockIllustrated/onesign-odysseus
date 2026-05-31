# Projecting signs — implementation notes & assumptions

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
