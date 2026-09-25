# Styles

A style is two things: a **palette of semantic roles** and a **render mode** that decides how a
shape is drawn. Scenes never name a colour — they name a role (`fill: 'desk'`, `fill: 'c1'`) — so
swapping the style re-skins the whole film, and a brand can override just the roles it cares about.

```js
STYLES.paper = {
  label: 'Paper & ink', render: 'ink', stroke: 3.4, boil: 1.25, boilEvery: 3, grain: 1, vignette: 0.10,
  C: { page, wall, floor, ink, desk, screen, card,        // neutral roles: the set and props
       a1, a2, a3, a4,                                    // accents: objects that should pop
       c1, c2,                                            // characters (one per person or role)
       glow },                                            // light sources, halos, ideas
};
```

- `render` — how `shape()` draws (below).
- `stroke` — outline width in world units. `boil` — hand-drawn wobble amplitude in *screen* pixels
  (so it stays consistent while the camera zooms). `boilEvery` — frames per re-seed of the wobble:
  3 is "animated on threes", the classic hand-drawn cadence; 1 is jittery, 6 is calm paper.
- `grain` — paper texture overlay strength. `vignette` — edge darkening (deepens in slow motion).
- `ACCENT_ROLES` — roles that glow in neon, stay opaque in blueprint, get chalk colour in chalk.

## The six presets

| Style | Render | Feel | Good for |
|---|---|---|---|
| paper | ink: flat fill + boiling ink outline, paper grain | warm, handmade, friendly | brand stories, crafts, trades (the Onesign house style) |
| flat | flat: crisp fills, no outlines, no wobble | clean, modern, product-y | apps, SaaS explainers, UI-adjacent pieces |
| chalk | chalk: translucent fill, two scratchy chalk passes, heavy wobble | classroom, "let me explain" | education, process breakdowns, onboarding |
| neon | neon: dark fills, glowing tubes in each shape's colour | night, energetic, techy | nightlife, launches, gaming, signage-at-night |
| blueprint | blueprint: ghosted fills, fine white lines, grid | technical, precise | engineering, "how it's made", specs |
| cutout | cutout: paper pieces with hard cast shadows, gentle wobble | tactile, stop-motion | kids, food, lifestyle, seasonal |

## Designing a new style

1. **Start from the nearest preset** and copy it. Most new styles are a palette plus one tweak.
2. **Palette:** pick the `page`/`wall`/`floor` first (they're most of the frame), then `ink` for
   contrast against them, then accents. Characters need to separate from the wall *and* from each
   other — check the thumbnails at phone size. Keep it to ~8 colours; restraint reads as designed.
3. **Line:** decide outline or no outline, weight, and wobble. Wobble + `boilEvery: 3` = hand-drawn;
   zero wobble = digital. Match the line to the story's register.
4. **Surface:** fill treatment (flat / translucent / textured) and any overlay (grain, scanlines,
   paper fibre, halftone). Overlays go in `drawFrame` after the world, in screen space.
5. **Add a render mode only if needed** — a new `case` in `shape()`. Keep `dot()` and `line()`
   consistent with it (eyes and limbs are drawn with those).
6. **Check every beat in the new style** — contact sheets in both orientations. Styles fail in
   specific places: glows bloom over faces, translucent fills make characters vanish into sets,
   dark styles lose eyes. Fix per role, not per shot.

Ideas that fit this engine well: risograph (2–3 inks, misregistration offset, halftone overlay),
pencil sketch (graphite stroke, cross-hatched fills), watercolour (soft fill blooms + bleed),
comic (thick ink, halftone shading, speed lines), 8-bit (snap coordinates to a pixel grid, no AA).

## Brand overrides

A brand pack can define its own style (e.g. `STYLES.onesign`) or override roles on a preset:
`STYLES.paper.C.a1 = BRAND.accent`. Keep brand colours on the things that carry the brand (the
characters, the hero object, the logo) and let the set stay neutral.
