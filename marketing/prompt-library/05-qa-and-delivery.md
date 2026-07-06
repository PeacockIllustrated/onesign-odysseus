---
id: motion-05-qa-and-delivery
category: process
title: QA & Delivery — the working rhythm
tags: [qa, verify, render, ci, branch, delivery]
---

# 05 · QA & Delivery

The working rhythm that kept the seed reel fast and correct. Brand-independent; follow it every
time.

## The loop (fastest path)

1. **QA still → eyeball → iterate.** Never full-render to check a layout. Render ONE still at the
   target frame (seconds), read it, fix, repeat. Full render only once it looks right.
   ```bash
   npx remotion still src/index.ts <CompositionId> out/frame.png --frame=<N> \
     --browser-executable=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell
   ```
2. **Type-check the sub-project** (`npx tsc -p marketing/<brand>-reel/tsconfig.json --noEmit`).
3. **Full render** (`npm run render`).
4. **Verify from the encoded MP4**, not just the raw still — timing/encoding can differ:
   ```bash
   npx remotion ffmpeg -loglevel error -ss <seconds> -i out/<name>.mp4 -frames:v 1 out/v.png -y
   ```
   Frame→time: `t = frame / 30`. Then read the PNG.
5. **Spot-check the money shot and every montage card** frame-by-frame before calling it done.

## Delivery

- Commit the **rendered MP4 alongside the source** so reviewers see it in the PR.
- Keep the reel **out of the app build** (root `tsconfig` exclude + eslint ignore) so CI (`verify`)
  stays green — confirm after the first push.
- **Branch/PR discipline:** motion-graphics work is content, not app code — its own branch/PR,
  separate from any app-feature branch. Push, open a **draft** PR, send the MP4 to the user.
- **Consent check** before anything with real client names/specs goes public; keep an anonymised
  swap ready.

## Definition of done

- [ ] Renders clean headless (no font/3D artifacts).
- [ ] Reads with **sound off** — captions carry it.
- [ ] Hook lands in ≤1.5s.
- [ ] Money shot and CTA are unmistakable.
- [ ] `verify` CI green; app build untouched.
- [ ] MP4 committed + delivered.
