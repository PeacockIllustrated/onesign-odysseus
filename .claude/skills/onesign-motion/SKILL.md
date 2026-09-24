---
name: onesign-motion
description: Make an Onesign motion piece — a hand-drawn "paper" animation of a job (a sign, a van wrap, a fit) starring the Onesign crew mascots, reviewed live in the browser and delivered as mobile + desktop MP4s. Use when asked for an Onesign animation, explainer, story video, social clip, or to add/change a scene, character or beat in public/motion/, or to render/export one of those pieces to video.
---

# Onesign motion pieces

Onesign tells the story of a job in short, hand-drawn animations. The reference piece is
`public/motion/bloom-sign-story.html`: a customer's idea for a "BLOOM" sign travels thought bubble →
designer's monitor → peeled sheet → project manager's slow-motion sign-off → CNC template → letters →
van → a fascia fitted at dusk, in one continuous take. Build new pieces the same way and they will look
like part of the same family. **Read that file before starting anything new; lift from it rather than
reinventing.** `public/motion/sign-making.html` is the simpler logo-only sibling (12s loop).

## The house style

- **Paper and ink.** Flat fills from the palette, 3.4px ink outlines that *boil* (re-seeded wobble every
  3 frames). Everything is drawn with `sk(points, opts)` so it boils; the only crisp thing on screen is
  the Onesign logo, which is always filled straight from its SVG path.
- **Palette** (`COLORS` in the reference): paper `#f3efe6`, paperHi `#fbf8f1`, ink `#23282b`, brand teal
  `#4e7e8c`, tealSoft `#a8c3ca`, tealDark `#35606c`; role colours below. Muted, warm, no pure black/white.
- **One continuous take.** No cuts, no fades. The hero object (the design) is one object the whole way
  and the camera follows it between rooms; a scene change is the object *moving*, not an edit.
- **Composed for 9:16 first.** Every shot must work on a phone (the 830-unit-wide centre slice at 1.3×);
  16:9 is the same shot with more room. Check both orientations for every beat.
- **Loops.** The last frame lands on the first frame's framing (the reference soft-focuses down onto the
  pavement it opened on).

## The cast: the 1nesign crew

Customers and members of the public are simple paper characters (pill/round bodies, dot eyes).
**Onesign staff are mascots made of the Onesign mark itself.** The design reference is
`public/motion/onesign-crew.html` (open it in a browser: line-up, construction, expressions, stickers,
the eight eye placements that were tried, and the rules).

- The body **is** the logo icon: filled from `ONESIGN_LOGO.mark` clipped to x < 160, in ink. Never
  redraw, reshape, outline or recolour the mark.
- The **1 is lit in the role's colour**: a colour ellipse (centre 79,81; 74×68 in icon units) drawn
  *behind* the mark, so the cut-out 1 glows like a halo-lit letter.
- **Eyes either side of the stem** — left eye (46,112), right eye (134,102) in icon units, white with an
  ink pupil. This was chosen over seven alternatives (see the crew page); do not move them.
- Stick limbs; hands in the role colour. **One piece of kit per role**, nothing more:

  | Role | Colour | Kit |
  |------|--------|-----|
  | Designer | mustard `#e9b44c` | none (the monitor/pencil is theirs) |
  | Project manager | brand teal `#4e7e8c` | headset |
  | Fabricator | raspberry `#cf5c78` | goggles |
  | Fitters | orange `#f2a65a`, brick `#b9573f` | hard hats (domed, brim wrapping the head) |
  | Driver (if one is ever needed) | teal | flat cap |

  The customer owns coral `#e07a5f`, so no staff member uses it.
- In code: a character spec with `shape: 'mark'` and `kit: 'headset' | 'goggles' | 'hardhat'` in
  `CHARACTERS`; `drawCharacter` routes it through `drawMarkBody`. State fields that matter for mascots:
  `look` (pupil direction in the body's own frame), `lids` (0–1, "dead serious"), `wide` (surprise),
  `happy`, `blink`, `wink`, `rot`, `sx` (flip), `hands`, `handStyle: 'thumb'`, `thumbAng`.
- **No mouths.** All acting is eyes + posture + timing.

## The file contract (every piece)

One self-contained HTML file in `public/motion/`, no dependencies, canvas 2D:

- `drawFrame(t)` is a **pure function of t** — no `Math.random`, no clocks, no accumulated state.
  Randomness comes from `hash(n)`. This is what makes review stills and final renders exact.
- `window.renderFrame(realSeconds)` and `window.DURATION` for capture. URL params: `?t=` freeze,
  `?ui=0` hide the review bar, `?native=1` exact-pixel canvas, `?portrait=1` the 9:16 cut.
- A **SETTINGS block at the top**: `STORY_END`, `SCENES`, `COLORS`, `CHARACTERS`, and `T`, the beat
  sheet — every time in the piece is a named key in `T` (or derived from one), never a loose literal in
  a function. Retiming a beat, or making room for a new one, is then a change to `T`.
- **Story time vs real time.** Beats are authored in story seconds; `speedAt(s)` warps story into real
  time (`WARP` table, `realAt`, `storyAt`). The flight plays at 1.7×; the PM's sign-off at 0.085× —
  slow motion is done by warping time, not by slowing the animation code. Everything slows together,
  while the line boil keeps ticking in real time, which is what makes it read as slow-mo.
- A review bar (play/pause, scene jump, scrubber with scene ticks, orientation toggle). Copy it.

## Building blocks to lift from the reference

- `sk / boil / rrect / ellipse / chaikin / partial` — the drawing kit.
- `arcPath / pathAt` — an arc-length spline, so speed along a path is exactly what the easing says.
  `THROW_T` shows a path whose speed varies along it (the paper *floats* past the PM's desk).
- `camKeys / camLerp / cam()` — keyed camera, values may be functions of t (follow shots).
  `followSheet` blends a follow cam into a composed two-shot.
- `ghosted` (trails on fast objects) + the camera **smear** in `drawFrame` (tracked subject stays sharp).
- `drawNightSet / drawLitLayer` — dusk/night: the set is darkened and lit first, the moving cast is lit
  on its own layer from the same sources, so lights glow *behind* people and lamps throw shadows.
- `puff`, `drawConfetti`, `spring / settle` (squash-and-settle on every landing), `keys` (piecewise easing).

## Craft rules (each one is a note that came back in review — don't make them come back)

- **Don't cram. Add time.** If a beat feels rushed, lengthen the piece; shift the later `T` keys
  together rather than squeezing. Comedy and payoffs need air.
- **Nothing snaps.** Hands and props ease between poses (a hand must not jump from hip to target);
  lights come on only after the thing they light is finished (halo after the *last* letter).
- **Nothing clips.** Parcels clear van doors, windows never paint over the people in front of them,
  a character's feet stay on the thing they stand on.
- **Vehicles look real.** Square corners where a real van has them (`roundedPoly` with per-corner
  radii), real alloy wheels — never toy/"Peppa Pig" wheels.
- **Gestures read at a glance.** Thumbs-up = wide fist with finger creases + short stout thumb
  (a tall single digit reads as a middle finger). If the character is upside down the thumb still
  points up in the room (`thumbAng: 0`).
- **When the brief says an object keeps flying, it never leaves its path** — characters move around
  it, never touch or stop it.
- **Deadpan is funny.** The PM's sign-off works because he is *serious* (lids down, scanning line by
  line) while doing something absurd (flipping mid-air with the page, in slow motion).
- **Clear stage behind the key action.** Move furniture so a slow-motion or hero beat plays against
  wall/window, not a busy bookshelf.
- **Frame the face on phone.** Two-shots push in (≈2×) and centre on the character's eyes.
- **Edge-on flips:** clamp a flipping body's `sx` away from zero (`±0.07`) — a zero-width transform
  blows up the line boil and floods the frame black.

## Workflow

1. **Plan the beats** in `T` before drawing: what happens, when, and where the camera is.
2. **Build and check with contact sheets**, not by eye in a player:
   ```bash
   node scripts/motion/stills.mjs public/motion/<piece>.html --at 10.5,10.9,11.1,11.3 --out out/beat.png
   node scripts/motion/stills.mjs public/motion/<piece>.html --at 10.5,10.9,11.1,11.3 --portrait --out out/beat-p.png
   node scripts/motion/stills.mjs public/motion/<piece>.html --at 10,11,12,13,14 --real --out out/pacing.png
   ```
   Times are story seconds (uses `realAt`); `--real` samples at even real time to judge pacing. The
   script also reports console errors and whether a frame re-renders identically — both must be clean.
   Always look at the sheet (Read the PNG) — and check the 9:16 sheet, not just 16:9.
3. **Share the live page for review** as an artifact (it plays instantly; video takes ~15 min). The
   artifact must not carry the `<!doctype>/<html>/<head>/<meta>/<body>` wrapper lines:
   ```bash
   grep -vE '^<!doctype html>$|^<html lang="en">$|^<head>$|^<meta charset|^<meta name="viewport"|^</head>$|^<body>$|^</body>$|^</html>$' \
     public/motion/<piece>.html > "$SCRATCH/<piece>.html"
   ```
   then publish that file (update the same artifact URL each round so the link stays stable).
4. **Iterate on pointers.** Commit + push each round of changes.
5. **Render only when asked** ("render it", "export it"). Hand it to a background agent so the
   conversation stays free; if the user says stop, kill the renders immediately (`pkill -f render.mjs`).
   ```bash
   node scripts/motion/render.mjs public/motion/<piece>.html --portrait --out out/<piece>-mobile-master.mp4 &
   node scripts/motion/render.mjs public/motion/<piece>.html --out out/<piece>-desktop-master.mp4 &
   scripts/motion/encode.sh out/<piece>-mobile-master.mp4  out/<piece>-mobile.mp4  2600k   # web, < 15 MB
   scripts/motion/encode.sh out/<piece>-desktop-master.mp4 out/<piece>-desktop.mp4 2600k
   scripts/motion/encode.sh out/<piece>-mobile-master.mp4  out/<piece>-mobile-6mbps.mp4  6M  # share copies
   scripts/motion/encode.sh out/<piece>-desktop-master.mp4 out/<piece>-desktop-6mbps.mp4 6M
   ```
   Mobile first, then desktop (both can run in parallel). ~15 min per orientation for ~40s at 60fps.
   Keep `out/` (or the scratchpad) out of git — videos are not committed.
6. **Deliver videos as a link**: publish `video-page.html` (in this skill folder — update the title,
   copy and the duration/size lines) with the two web MP4s passed via the artifact `files` map
   (each ≤ 15 MB; lower the web bitrate for longer pieces: 15 MB ≈ 120 Mbit ÷ seconds). Attach the
   6 Mbps share copies as files. Frame-check one still from each encode before sending.

## Delivery preferences (Tom)

- Always give videos as a **claude.ai link** (the video page artifact), mobile and desktop together.
- Review happens on the **live page**; don't start a render until the pointers are done.
- The mascot concept and eye-placement study live at `public/motion/onesign-crew.html`; new characters
  or kit go there first, then into the piece.
