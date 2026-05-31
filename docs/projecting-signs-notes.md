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
