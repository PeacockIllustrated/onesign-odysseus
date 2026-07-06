# Motion-Graphics Core — Reuse Playbook

How to take this Remotion reel engine and point it at a **new brand / new product** with
minimum re-derivation. Written so a fresh chat can be productive in one read.

> **One-line brief for a new chat:**
> "Reskin `marketing/design-studio-reel/` for **<brand>**. Read `REUSE-PLAYBOOK.md` first.
> Swap `src/brands.ts` + `public/brands/*.svg` + theme accents, render QA stills, then full render."

---

## 0. What this core IS

A **standalone Remotion 4 project** that renders a 9:16 (1080×1920) vertical reel entirely
programmatically — no screen capture, no WebGL, no AI-generated frames. Everything is CSS/DOM
so it renders reliably in **headless Chromium**. It lives at `marketing/design-studio-reel/`
with its **own** `package.json`/`node_modules`, deliberately **excluded from the Next.js app
build** (root `tsconfig` exclude + `eslint.config.mjs` globalIgnores both list `marketing`).
Touching this project never affects the app's typecheck/lint/build.

The reusable value is three things:
1. **A render pipeline that works headless** (the binary + the gotchas below).
2. **A component kit** — a folded-aluminium 3D sign, kinetic captions, a "viral" motion kit.
3. **A single brand-swap surface** — one data file + a few SVGs + a couple of theme colours.

---

## 1. The render pipeline (copy these verbatim)

Scripts already in `package.json`:

```bash
cd marketing/design-studio-reel
npm install

# full reel → out/onesign-design-studio-reel.mp4
npm run render

# one still at a chosen frame (fastest QA loop — ALWAYS do this before a full render)
npx remotion still src/index.ts DesignStudioReel out/frame.png --frame=707 \
  --browser-executable=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell
```

**Gotcha — the browser binary.** You MUST use `chrome-headless-shell`, not the full `chrome`
binary. The full binary fails in this sandbox ("Old Headless has been removed"). Exact path:
`/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell`. It's baked into
the `render`/`still` scripts via `--browser-executable`.

**Verifying from the MP4** (system `ffmpeg` is NOT installed — use Remotion's bundled one):
```bash
npx remotion ffmpeg -loglevel error -ss 23.9 -i out/onesign-design-studio-reel.mp4 \
  -frames:v 1 out/verify.png -y
```
Frame→time: `t = frame / 30` (FPS=30). Then `Read` the PNG to eyeball it.

---

## 2. Hard-won gotchas (each cost real debugging — don't rediscover them)

| Symptom | Cause | Fix (already in the code) |
|---|---|---|
| Render dies at webpack startup | `delayRender()` called at **module scope** | Load fonts from a guarded `ensureFonts()` called in the **component body** (`src/fonts.ts`, invoked in `Reel.tsx`) |
| 3D sign face is opaque, **artwork invisible** | A `filter` on a `preserve-3d` element **flattens it to z=0**, hiding `translateZ`'d children | Edge-glow → `box-shadow` on the face (not a panel `filter`); render artwork as a `translateZ`'d **sibling** whose **inner, non-3D** wrapper carries the colour/`filter` (see `SignPanel.tsx`) |
| Whole frame flashes white | A flash overlay's `interpolate` returned its end value **before** its start (extrapolateLeft clamp) | Guard `if (frame < at || frame >= at + dur) return null` (see `WhipFlashCard`, `EntryFlash`) |
| `NaN` in colours | `shade()`/`mixHex()` return `rgb(...)` but a parser only read `#rrggbb` | `hexToRgb()` accepts **both** `#rrggbb` and `rgb(r,g,b)` |
| Montage card animates from the wrong frame | A nested `<Sequence from=…>` **resets local frame to 0** per card | Author each card's springs against the **local** frame; the outer scene offsets via `from={k*CARD}` |
| CI (`verify`) goes red after adding to `marketing/` | Root `tsconfig` `**/*.tsx` pulled the sub-project into the app typecheck | Keep `"marketing"` in root `tsconfig` **exclude** and `"marketing/**"` in `eslint.config.mjs` globalIgnores |

**Fonts.** Google Fonts (`gstatic.com`) is proxy-allowed; general CDNs (e.g. cdnfonts) 403.
Bundle any display face as **woff2 under `public/fonts/`** and register it in `src/fonts.ts`.
Commercial fonts (e.g. **Gilroy**) can't be fetched — wire the family with a free fallback
(Montserrat stands in for Gilroy) and drop the real woff2 in later to activate it automatically.

---

## 3. The component kit (what to reuse, not rebuild)

- **`src/ui/SignPanel.tsx`** — a convincing **folded-aluminium fascia sign** as a real CSS-3D
  cuboid (face + 4 returns, `preserve-3d`, no WebGL). Supports `art='aperture'|'standoff'|'vinyl'|'none'`,
  a `night` day/night paint response, a `fold` 1→0 unfold, and edge keyline `glow`. Pass any
  React node as `artwork` (an `<Img>` of a logo works). This is the money-shot object — most
  signage/product films can reuse it as-is.
- **`src/ui/Caption.tsx`** — kinetic captions that **slam in word-by-word** (Anton, uppercase),
  teal→ice gradient on the key word. Props: `lines[{text, accent?, gradient?}]`, `startF`,
  `stagger`, `size`, `align`, `bottom`.
- **`src/ui/Viral.tsx`** — the "viral" motion kit: `SnapIn` (snap-zoom entrance), `WhipFlashCard`
  (2–3f strobe cuts for rhythm), `StatSlab`, `Kicker`, `Iris` (CTA wipe), `MontageCard`
  (one brand case-study card), `Chip` (material/fixing callouts).
- **`src/theme.ts`** — all shared tokens: `BRAND` colours, `FPS/WIDTH/HEIGHT`, `stageBackground(night)`,
  the font stacks (`CONDENSED`=Anton, `DISPLAY`=Gilroy→Montserrat), and `EASE` cubic-beziers.
- **`src/scenes.tsx` + `src/Reel.tsx`** — the 11-scene timeline. `Reel.tsx` holds the `TL` array
  (scene → start frame) and `TOTAL_FRAMES`; each scene is a self-contained component.

---

## 4. Swapping to a new brand — the minimal surface

Most reskins touch only **three** places:

1. **`src/brands.ts`** — the case-study montage data. Each entry:
   ```ts
   { name, kind, logo: 'brands/x.svg', face: '#hex', accent: '#hex',
     material: 'Built-up illuminated letters', fixing: 'Stand-off locators', lit: true }
   ```
   The montage window auto-fits: set `CARD` in `scenes.tsx` so `cards × CARD == window frames`
   (currently 3 × 64 = 192). The `NN / NN` counter derives from `REAL_BRANDS.length`.

2. **`public/brands/*.svg`** — the actual logo vectors. Prefer clean single-logo SVGs; a
   dimensioned survey/layout drawing is **not** a logo (that's why Olivia's was dropped).
   Mount them on `SignPanel` (folded panel) for shopfront-sign presentation, or on a flat board
   (`SignBoard`, still in `Viral.tsx`) for a different look.

3. **`src/theme.ts`** — swap `BRAND.accent` / glow if the film's own accent changes (distinct
   from each sign's `accent`, which lives per-entry in `brands.ts`).

Copy/caption changes live in `src/scenes.tsx` (the hook line, the stinger kicker, the CTA URL).

**Sourcing real assets.** Real client logos/specs came from the **Supabase MCP** (Odysseus DB
project `duilwyurfywrltwkiaha`). Real names/specs in a public reel warrant a **consent check**
before posting — trivial to swap to anonymised placeholders.

---

## 5. The working rhythm (what actually kept it fast)

- **QA still → eyeball → full render.** Never full-render to check a layout. Render 1 still at
  the target frame (~a few seconds), `Read` it, iterate. Full render only once it looks right.
- **Type-check the sub-project directly:** `npx tsc -p marketing/design-studio-reel/tsconfig.json --noEmit`
  (running `tsc` at repo root won't cover it — it's excluded).
- **Verify from the encoded MP4**, not just the still — encoding/timing can differ from a raw frame.
- **Fable-5 multi-agent workflows** did the creative direction well: spawn parallel creative leads
  (each proposes a full treatment), then one executive-synthesis pass picks/merges. Good for
  "give me a next-level concept"; overkill for a mechanical reskin (just edit the 3 files above).
- **Branch discipline:** develop on the designated `claude/...` branch, commit with clear messages,
  push, and the reel MP4 is committed alongside the source so reviewers see it in the PR.

---

## 6. Fastest path for a brand-new reel (different product, not just new logos)

1. Copy `marketing/design-studio-reel/` → `marketing/<new>-reel/`; keep it excluded from the app build.
2. Keep `theme.ts`, `fonts.ts`, `ui/*` (the kit). Rewrite `scenes.tsx` for the new narrative,
   reusing `SignPanel`/`Caption`/`Viral` primitives.
3. Update `Root.tsx` composition `id` + `Reel.tsx` `TL`/`TOTAL_FRAMES`.
4. Point `brands.ts` + `public/brands/` at the new assets.
5. QA-still each new scene, then full render, then verify from MP4.

Everything else (headless binary, font loading, 3D artwork trick, CI excludes) is already solved —
inherit it, don't rebuild it.
