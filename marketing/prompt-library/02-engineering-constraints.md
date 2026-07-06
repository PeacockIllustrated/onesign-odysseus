---
id: motion-02-engineering-constraints
category: engineering
title: Engineering Constraints — the quality spine
tags: [remotion, headless, render, gotchas, fonts, css-3d, ci]
---

# 02 · Engineering Constraints (the quality spine)

These are **hard rules, not preferences**. They are the reason the seed reel renders reliably
headless and looks sharp, and they are 100% brand-independent. Treat every row as a constraint on
the new brand's build. This is the single most important module for **quality consistency**.

## Project shape

- Each reel is a **standalone Remotion 4 project** under `marketing/<brand>-reel/` with its own
  `package.json`/`node_modules`.
- It is **excluded from the app build**: add the folder to root `tsconfig` `exclude` and
  `eslint.config.mjs` globalIgnores. Verify `verify` CI stays green after adding it.
- Canvas: **1080×1920, FPS 30** unless the brief says otherwise.

## Render pipeline (verbatim)

```bash
cd marketing/<brand>-reel && npm install
npm run render     # full → out/<name>.mp4

# QA still (fast loop — always before a full render):
npx remotion still src/index.ts <CompositionId> out/frame.png --frame=<N> \
  --browser-executable=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell
```

- **Browser binary MUST be `chrome-headless-shell`**, never full `chrome` (full binary fails:
  "Old Headless has been removed"). Path:
  `/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell`.
- System `ffmpeg` is **not installed** — pull frames from the MP4 with `npx remotion ffmpeg …`.
- Type-check the sub-project directly: `npx tsc -p marketing/<brand>-reel/tsconfig.json --noEmit`
  (root `tsc` won't cover it — it's excluded).

## Non-negotiable gotchas (each cost real debugging)

| Rule | Why |
|------|-----|
| Load fonts from a guarded `ensureFonts()` called in a **component body** — never `delayRender()` at module scope | Module-scope `delayRender()` crashes the render at webpack startup |
| Bundle display faces as **woff2 under `public/fonts/`**; register via FontFace | `gstatic.com` is proxy-allowed; general font CDNs 403. Commercial fonts can't be fetched — wire a free fallback and drop the licensed woff2 in later |
| Prefer **CSS/DOM 3D (`preserve-3d`)** over WebGL for any dimensional object | WebGL is unreliable headless; CSS-3D renders identically |
| Never put a `filter` on a `preserve-3d` element that has `translateZ`'d children | A filter **flattens the 3D context to z=0** and hides the children. Put glow on `box-shadow`; render layered artwork as a `translateZ`'d sibling whose **inner, non-3D** wrapper carries the colour/filter |
| Flash/strobe overlays must guard `if (frame < at \|\| frame >= at+dur) return null` | Otherwise `interpolate` extrapolation returns the end value early and white-outs the frame |
| Colour helpers must accept **both** `#rrggbb` and `rgb(r,g,b)` | Mixers return `rgb(...)`; a hex-only parser yields `NaN` |
| Inside a nested `<Sequence from=…>`, author springs against the **local** frame (resets to 0) | The outer scene provides the global offset |

## The quality bar these produce

Programmatic-only (no capture, no AI frames), bold sound-off type, one dimensional hero object
that renders headless, and a clean CI that never touches the app. Hold this bar for every brand.
