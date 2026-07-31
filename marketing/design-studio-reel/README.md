# Design Your Sign — social reel (9:16)

A bold, **34-second vertical "viral cut"** advertising the public
**[Onesign & Digital sign builder](../../app/design)** (`/design`). Result-first
hook, heavy **Anton / Archivo Black** kinetic type, snap-zoom cuts, the four-step
build (**Size → Artwork → Light → Send**), the day→night glow money-shot, a
**real-brand social-proof montage** (Black Rabbit, HERD, Ginger, Aqua TCG, FCR
Roofing, Persimmon — genuine Onesign clients pulled from the production
database), and a hard CTA. No music yet (works sound-off on captions).

Display fonts (`public/fonts/`, loaded in `src/fonts.ts`): **Anton** (condensed
caption face) and **Archivo Black** (numbers / brand nameplates). The frosted
app dock keeps a system UI sans so the product reads as authentic.

This is a **standalone [Remotion](https://remotion.dev) project**. It is *not*
part of the Next.js app build (its own `package.json` / `node_modules`), so it
never touches the production app's dependencies. Everything on screen is a
faithful, brand-exact reconstruction of the real studio UI — the dark 3D stage,
the frosted white wizard dock, the day/night switch, the glow presets, the spec
HUD and the `DSR-YYYY-NNNNNN` success card — animated programmatically, so every
frame is on-brand and the film is fully reproducible.

## The deliverables

| File | What it is |
|------|------------|
| `out/onesign-design-studio-reel.mp4` | The rendered reel (1080×1920, 30fps, H.264) |
| `STORYBOARD.md` | Shot-by-shot storyboard (10 scenes, timings, motion notes) |
| `SCRIPT.md` | Voiceover + on-screen captions, hooks, sound brief, post caption |
| `MOTION.md` | The motion-design system (transitions, easings, colour rules) |

## Render it

```bash
cd marketing/design-studio-reel
npm install
npm run render        # → out/onesign-design-studio-reel.mp4
npm run studio        # open the Remotion preview to scrub/tweak live
```

The render scripts point `--browser-executable` at the pre-installed
`chrome-headless-shell` (Remotion needs old-headless mode). On another machine,
drop that flag and Remotion will fetch its own Chrome Headless Shell, or point it
at your local Chrome.

## How it's built

```
src/
├── index.ts          registerRoot
├── Root.tsx          the <Composition> (1080×1920 · 30fps · 1140 frames)
├── Reel.tsx          the timeline — tiles the 10 scenes 0→38s
├── scenes.tsx        the 10 scenes (shared demo design state: the "AURELIA" brand)
├── theme.ts          brand tokens (a 1:1 lift of components/studio/tokens.ts) + easings
└── ui/
    ├── SignPanel.tsx  the faux-3D folded-aluminium sign (real CSS 3D, no WebGL)
    ├── StageSign.tsx  places the sign with the continuous idle rotation
    ├── Studio.tsx     stage / top bar / spec HUD / wizard dock / stepper / switches / cursor
    ├── Controls.tsx   the dock's inner controls (size fields, RAL swatches, dropzone, glow…)
    ├── Fx.tsx         the energy layer — beat pulse, film grain, light sweep, whip-flash cuts, shockwave rings, spark bursts, speed lines
    ├── Caption.tsx    the kinetic broadcast captions (masked line reveal, punch-in, accent-word glow)
    ├── BrandArt.tsx   the demo customer's logo (AURELIA)
    ├── Logo.tsx       the real Onesign wordmark + a brand mark
    ├── Icons.tsx      inline icon set (no icon-font dependency)
    └── anim.ts        shared animation helpers
```

The 3D sign is deliberately **CSS 3D, not WebGL** — it renders identically and
reliably in headless Chromium, and lets the motion graphics (captions, callouts,
the day→night wipe) sit on top cleanly.

## Change the demo brand / sign

Everything the film shows is driven by a few constants at the top of
`scenes.tsx` (`ALU`, `TEAL`, `D0`, `D1`, `CUSTOMER`) and the `AureliaLogo`
component in `ui/BrandArt.tsx`. Swap those to re-skin the reel for a different
example customer without touching the motion.
