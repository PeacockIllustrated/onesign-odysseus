---
id: motion-04-component-kit
category: engineering
title: Component Kit — reuse vs. rebuild
tags: [components, remotion, reuse, primitives]
---

# 04 · Component Kit — reuse vs. rebuild

What to lift from `marketing/design-studio-reel/src/` for a new brand, and what to author fresh.
The primitives are **motion mechanics** (reusable); the styled surfaces are **brand-specific**
(rebuild).

## Reuse as-is (motion mechanics, brand-neutral)

- **`theme.ts` structure** — copy the *shape* (BRAND tokens, `FPS/WIDTH/HEIGHT`,
  `stageBackground()`, font stacks, `EASE` cubic-beziers), then **replace the values**.
- **`fonts.ts`** — the `ensureFonts()` guarded loader pattern (see `02-engineering-constraints`).
  Swap the FACES list for the new brand's woff2.
- **Kinetic caption engine** (`ui/Caption.tsx`) — word-by-word slam-in with a gradient key word.
  Reusable; restyle via props (face, size, colours).
- **Motion kit** (`ui/Viral.tsx`) — `SnapIn`, `WhipFlashCard`, `StatSlab`, `Kicker`, `Iris`,
  `MontageCard`, `Chip`. These are timing/entrance mechanics; recolour/retype per brand.
- **`anim.ts` / `ramp()`** helpers and the QA/render scripts.

## Rebuild for the new brand (the visible identity)

- **The hero object.** `SignPanel` (folded-aluminium CSS-3D sign) is *the seed brand's* hero.
  A new brand needs its own — but **reuse the CSS-3D `preserve-3d` technique** and the
  filter-flattening workaround from `02` when building it.
- **The scene compositions** (`scenes.tsx`) — new narrative, new layouts.
- **All palette / type / imagery.**

## The brand-swap surface (minimal reskin, same look family)

If you *are* doing a same-style variant (not this ask, but for reference): three files only —
`src/brands.ts` (case-study data), `public/brands/*.svg` (logos), `src/theme.ts` (accents). See
`design-studio-reel/REUSE-PLAYBOOK.md §4`.

## Rule of thumb

> If it decides **when/how a thing moves**, reuse it. If it decides **what the thing looks
> like**, rebuild it. That line is what keeps quality consistent while letting the look diverge.
