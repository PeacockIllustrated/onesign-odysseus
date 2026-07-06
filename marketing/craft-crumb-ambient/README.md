# Craft & Crumb — Ambient Menu-Screen Suite

Ambient logo animation (screensaver) + a promotional ad set for **Craft & Crumb**
(coffee bar · sando deli) in-store menu screens. Standalone [Remotion](https://remotion.dev)
project — its own `package.json`/`node_modules`, excluded from the main app build.

Built on the reusable motion-graphics process in `marketing/prompt-library/` — the engineering
spine and QA rhythm are inherited; the look is authored fresh from the brand pack (RAL 9005 jet
black, warm coffee-brown `#995c28`, Bebas Neue, artisan/warm/minimal).

## What's in it

- **`CraftCrumbScreensaver`** — a **seamless 16s loop** for the menu screens' idle/screensaver
  state. The real circular badge on a warm dim-café stage: powder-coated-metal light sweep, an
  orbiting ring glint, a soft breath, drifting warm motes, and a slow rota of artisan lines
  (CRAFTED DAILY / FRESHLY BAKED / SINGLE ORIGIN / MADE TO ORDER). Loops forever with no seam.
- **`CraftCrumbPromos`** — a **~19s promotional set** cross-dissolving four cards: Single-Origin
  Espresso · Sourdough Sandos · Grab & Go Breakfast · brand sign-off. Line-art motifs, Bebas
  headlines with brand-brown `&`/`.`, on the same warm stage.

Both are **16:9 1920×1080** (landscape menu boards). For portrait screens set `WIDTH=1080`,
`HEIGHT=1920` in `src/theme.ts` — layouts are centred/relative so it's a small change.

## Render

```bash
cd marketing/craft-crumb-ambient
npm install                 # or reuse a sibling reel's node_modules (identical deps)
npm run render:saver        # → out/craft-crumb-screensaver.mp4
npm run render:promos       # → out/craft-crumb-promos.mp4
npm run studio              # live preview
```

Headless renders use the `chrome-headless-shell` binary (baked into the scripts); see
`marketing/prompt-library/02-engineering-constraints.md`.

## Change the copy

Promo cards live in `PROMOS` at the top of `src/Promos.tsx` (`head` lines + `sub`). The
screensaver's rota is `WORDS` in `src/Screensaver.tsx`. The logo is inlined from
`public/logo/craft-crumb-logo.svg` (its two fixed-position tagline nodes are replaced with one
centred, self-fitting tagline in `src/ui/Badge.tsx` so substituted Bebas can't collide).

## Notes

- **Bebas Neue** is bundled (`public/fonts/BebasNeue.woff2`, Google Fonts) — the brand face.
- **Sound-off by design** (menu screens are silent); a soft loop of café ambience/music could be
  added under the promo set if the screens have audio.
- Real menu items in the promo copy are placeholders drawn from the brand's format — confirm the
  actual products / hours before it goes on-screen.
