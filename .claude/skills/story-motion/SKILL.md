---
name: story-motion
description: Make a hand-built 2D story animation — a short character-driven explainer, brand story, "how we do it" film or social clip — in any visual style (paper & ink, flat vector, chalkboard, neon, blueprint, cut paper, or a new one), as a deterministic canvas page reviewed live in the browser and rendered to frame-exact mobile (9:16) and desktop (16:9) MP4s. Use this whenever someone asks for an animation, animated video, explainer, motion piece, story video, animated characters or mascots doing something, a looping social clip, or to render/export an animation to video — even if they don't say "canvas" or name a style. If a brand pack skill exists for the client (e.g. onesign-motion), use it together with this one.
---

# Story motion

A method for making short animated films that look hand-made and play back exactly the same
every time: one self-contained HTML page per piece, where every frame is a pure function of time.
The same page is the review tool (it plays live in a browser, instantly) and the render source
(frames are captured one at a time into MP4s). It was developed on a 40-second story of a sign
being made; the lessons from every round of review notes are folded in here.

Two layers:
- **This skill — the engine and the method.** Style-agnostic: pick or invent a style, cast
  characters, write the beat sheet, build, review, render, deliver.
- **A brand pack** (a separate skill, e.g. `onesign-motion`) — a client's palette, characters made
  from their mark, their reference pieces and delivery preferences. When one exists, it wins on
  look and cast; this skill still supplies the engine and workflow.

## Start from the template

`assets/template.html` is a complete working piece (12s: an idea becomes a card, is thrown across a
room, caught in slow motion, thumbs up, camera drifts home and loops). It demonstrates every
technique and all six styles (`?style=paper|flat|chalk|neon|blueprint|cutout`). **Copy it, then
replace the story — keep the engine.** Don't write a new engine from scratch; the template already
solves determinism, capture, portrait/landscape framing, time warps, the review bar and styles.

Read in this order:
1. `references/craft.md` — the review notes that shaped this method. **Before the first build.**
2. `references/styles.md` — when choosing or designing the look (roles, presets, new styles)
3. `references/characters.md` — when casting and acting (rig, eyes and lids, hands, logo mascots)
4. `references/techniques.md` — while building (keys, paths, camera and framing, time warps,
   motion blur, light, loops, text and end cards)
5. `references/brand-packs.md` — when a client will want more than one piece

## The contract (every piece)

- **Pure function of t.** No `Math.random`, no `Date`, no accumulated state between frames.
  Randomness comes from `hash(n)`; idle motion loops with `cyc(t, n)`. This is what makes review
  stills, live playback and final renders agree to the pixel.
- `window.renderFrame(realSeconds)` and `window.DURATION` for capture.
- URL params: `?t=` freeze · `?ui=0` hide the review bar · `?portrait=1` 9:16 · `?native=1` exact
  pixels · `?style=` style preset.
- **A settings block at the top**: `STORY_END`, `SCENES`, `T` (the beat sheet — every time in the
  piece is a named key here), `STYLES`, `CAST`. Retiming or adding a beat is an edit to `T`.
- **Story time vs real time.** Beats are authored in story seconds; `speedAt()` warps them into real
  time (slow motion, sped-up transitions). `realAt()` / `storyAt()` convert.
- **Composed for 9:16 first.** Every shot must read on a phone; 16:9 is the same shot with more room.

## Workflow

1. **Brief.** Pin down: what happens (the story in one breath), who's in it, length (15–45s
   typical), where it will be shown (phone-first social? website hero? both), style or brand pack,
   and any must-have moment. Ask only what you can't infer; propose a style if none is given.
2. **Beat sheet.** Write `T` before drawing anything: each beat, its time, and where the camera is.
   Give comedy and payoffs air — if it feels rushed, make the piece longer rather than faster.
3. **Build** from the template (craft.md in mind): set, cast, state functions (pure in t), camera
   keys composed for 9:16 (techniques.md → framing). Keep to the style's colour roles. With a brand
   pack, paste its module at the template's BRAND PACK marker and set `DEFAULT_STYLE`.
4. **Check with contact sheets, not by eye in a player** — both orientations, story-time and
   real-time pacing. Always look at the PNGs (Read them):
   ```bash
   node <skill>/scripts/stills.mjs story.html --at 1,2.5,4,6,8 --out out/beats.png
   node <skill>/scripts/stills.mjs story.html --at 1,2.5,4,6,8 --portrait --out out/beats-p.png
   node <skill>/scripts/stills.mjs story.html --at 0,2,4,6,8,10,12,14 --real --out out/pacing.png
   node <skill>/scripts/stills.mjs story.html --at 4,6 --style neon --out out/neon.png
   ```
   It also reports console errors and whether a frame re-renders identically; both must be clean.
   Judge details (hands, faces, props) in a close crop: `--clip x,y,w,h` (canvas pixels).
5. **Share the live page for review.** It plays instantly; video takes ~15 minutes. If publishing
   as a claude.ai artifact, strip the `<!doctype>/<html>/<head>/<meta>/<body>` wrapper lines first,
   and update the same artifact URL each round so the link stays stable.
6. **Iterate on pointers.** Commit each round if the piece lives in a repo. Expect several rounds;
   the craft notes exist because each of them came back once.
7. **Render only when asked** ("render it", "export it"). Hand it to a background agent so the
   conversation stays free; if the user says stop, kill it immediately (`pkill -f render.mjs`).
   ```bash
   node <skill>/scripts/render.mjs story.html --portrait --out out/story-mobile-master.mp4 &
   node <skill>/scripts/render.mjs story.html --out out/story-desktop-master.mp4 &
   <skill>/scripts/encode.sh out/story-mobile-master.mp4  out/story-mobile.mp4  2600k   # web (< 15 MB for ~40s)
   <skill>/scripts/encode.sh out/story-desktop-master.mp4 out/story-desktop.mp4 2600k
   <skill>/scripts/encode.sh out/story-mobile-master.mp4  out/story-mobile-6mbps.mp4  6M  # share copies
   ```
   Mobile first, then desktop (they can run in parallel). ~15 min per orientation for ~40s at 60fps.
   Add `--style <name>` to render a particular style. Frame-check a still from each encode.
8. **Deliver.** Videos as a link: `assets/video-page.html` (update title, copy, duration lines) with
   the two web MP4s alongside it (claude.ai artifact `files` map, ≤ 15 MB each — lower the web
   bitrate for longer pieces: 15 MB ≈ 120 Mbit ÷ seconds). Attach the 6 Mbps copies as files.
   Never commit rendered videos to a repo; commit the page that makes them.

Tooling needs Playwright (Chromium) and ffmpeg; the scripts find both at runtime (global npm
Playwright, then `ffmpeg` on PATH or an imageio-ffmpeg binary; set `FFMPEG=` to override). `scripts/lib.mjs` has the shared capture code if you need a custom capture.

## What makes these good (short version of craft.md)

- **One continuous take.** No cuts or fades; the camera follows the hero object from place to
  place. Scene changes are the object moving.
- **Nothing snaps, nothing clips.** Hands ease between poses; props clear what they pass; lights
  come on only after the thing they light is finished.
- **Everything lands.** Squash on take-off, settle on landing (`settle()`), anticipation before a throw.
- **Gestures read at a glance** — especially at phone size. Test them in a close crop.
- **Deadpan is funny.** Serious characters doing absurd things; slow motion via the time warp.
- **Clear stage behind the key action.** Move props so hero beats play against quiet background.
- **Loop it** where it suits: the last frame lands on the first frame's framing (for a before/after
  story, matching the framing is enough — see techniques.md → loops).
