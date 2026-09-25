---
name: onesign-motion
description: Onesign & Digital's brand pack for animation — the paper-and-ink house style, the "1nesign crew" mascots (staff made from the Onesign mark, the 1 lit in each role's colour), the Onesign logo, the BLOOM reference film and Tom's delivery preferences. Use this whenever the animation, explainer, story video, social clip or motion piece is for Onesign (signs, fascias, fabrication, fitting, van wraps, the Onesign team) or uses Onesign's characters or logo, and whenever something in public/motion/ is being changed or rendered. Always use it together with the story-motion skill, which supplies the engine and the workflow.
---

# Onesign motion — brand pack

This pack makes every Onesign film look like part of one family. It sits on top of
**story-motion** (engine, template, styles, workflow, tooling, craft rules): load that skill too
and follow its workflow; this pack decides the look, the cast and the house rules.

Assets here:
- `assets/onesign-pack.js` — paste it at the template's **BRAND PACK marker** (after `STYLES`,
  before `CAST`) and set `DEFAULT_STYLE = 'onesign'`. It adds `STYLES.onesign`, the real logo paths
  (`ONESIGN_LOGO`, `drawOnesignLogo`), `onesignMascot(role)` (a cast spec whose body is the Onesign
  mark), fallbacks so the Onesign roles exist in every style, and `sk()` / `BLOOM_COLORS` adapters
  for lifting code from the reference film.
- `assets/crew.html` — the character bible: line-up, how a mascot is built, expressions, status
  stickers, the eight eye placements that were tried and the one chosen, and the rules.
- `assets/reference-bloom-sign-story.html` — the 40s reference film (a BLOOM sign from idea to lit
  fascia). The best place to lift scenes, props and choreography from: the studio, the CNC and
  router, the Luton van (`roundedPoly` body, alloy wheels, tail lift), the fascia and flowering
  sprigs, the ladder fit, dusk lighting. It predates the template's API — use the pack's `sk()` and
  `BLOOM_COLORS` adapters, or translate `sk(pts, {width})` → `shape(pts, {w})` as you lift.
- `assets/video-page.html` — the delivery page for the two MP4s.

In the Odysseus repo the same things live at `public/motion/` (`bloom-sign-story.html`,
`onesign-crew.html`) with the tooling in `scripts/motion/`; new pieces go in `public/motion/`.

## Look

- **Style: paper & ink** (`STYLES.onesign`): flat fills, 3.4px ink outline that boils on threes,
  paper grain, muted warm palette. Paper `#f3efe6`, ink `#23282b`, brand teal `#4e7e8c`,
  tealSoft `#a8c3ca`, tealDark `#35606c`. No pure black or white.
- **One continuous take**, composed for 9:16 first (most Onesign pieces go to social).
- **The Onesign logo is filled from its real path** (`drawOnesignLogo`), never typed or redrawn.
  It appears on the van, and anywhere Onesign signs its work.

## The cast: the 1nesign crew

Onesign staff are mascots made of **the Onesign mark** (an O with a 1 cut out of it):
- the body is the icon, in ink, never reshaped or outlined;
- **the 1 glows in the role's colour** (a colour shape behind the mark shows through the cut-out,
  like a halo-lit letter);
- **an eye either side of the stem** (left (46,112), right (134,102) in icon units, white with an
  ink pupil). Chosen over seven alternatives — see crew.html; don't move them;
- stick limbs, hands in the role colour, **one piece of kit per role**, no mouths.

| Role | Colour | Kit |
|---|---|---|
| Designer | mustard `#e9b44c` | none (the monitor is theirs) |
| Project manager | brand teal `#4e7e8c` | headset |
| Fabricator | raspberry `#cf5c78` | goggles |
| Fitters | orange `#f2a65a`, brick `#b9573f` | hard hats: a domed helmet with a brim that wraps the head |
| Driver (if needed) | teal | flat cap |

**Customers and the public are paper characters** (pill or round bodies, dot eyes), never the
mark. The customer owns coral `#e07a5f`, and no staff member uses it.

In code: `CAST.fitter = onesignMascot('fitterA', { w: 132 })`. The mascot's state takes the
template's fields plus `lids` (0–1, "dead serious"), `wide`, `wink`. New roles or kit go on the crew
sheet first (crew.html), then into the film.

**Flipping:** "never reshape the mark" means at rest. A mascot may *turn* in 3D — `sx` passing
through zero as they spin, as the PM does mid-air in the reference — because that reads as the
character turning, not as a mirrored logo. Keep turns brief and never hold a mascot mirrored; to face
the other way, use `look` (the eyes), not a flip.

**Scale and access:** a mascot is ~120–170 units tall; a van box side is ~480 and a fascia sits
~250 up. Give them access the way the trade does — hop-ups and a staging board for a van side, a
ladder for a fascia — rather than scaling the crew up.

## House rules (from Onesign reviews)

- **Get the trade right.** A sign job goes quote/idea → design → sign-off → fabrication (CNC,
  letters, LEDs) → wrap and load → van → fit. On site, **the fascia panel goes up before the
  letters**; the sign lights only once the last letter is fixed; dusk gathers while they finish.
- **Vehicle wraps:** design on screen → wide-format print → cut → carried as one panel by two
  fitters → applied from hop-ups/staging: one squeegees in a single direction with the graphic
  appearing behind the blade, the other holds the far end → trim → step back and check. The "before"
  vehicle is plain white; the livery is drawn from the logo path (`drawOnesignLogo`), never typed.
- **Vans look real** — whether it's Onesign's own van or the job: a Luton with square corners where
  the real one is square, a tail lift, real alloy wheels (never toy wheels).
- **The PM signs work off**: the reference film's slow-motion sign-off, deadpan and mid-air while
  the page flies past untouched, is the tone for Onesign comedy.
- **Fascia graphics look designed**: the flowering sprigs on the BLOOM fascia are the standard.
- **Thumbs-ups read clearly**: a wide fist with a short stout thumb, pointing up in the room.

## Delivery (Tom's preferences)

- Review happens on the **live page** (a claude.ai artifact of the piece, updated at the same URL
  each round). Don't render until the pointers are done; stop renders immediately when asked.
- Render with a background agent when asked: **mobile (9:16) first, then desktop (16:9)**.
- Always give videos as a **claude.ai link**: `assets/video-page.html` with both web MP4s, plus the
  6 Mbps share copies attached as files.
- In the repo: commit the piece and any crew changes; never commit rendered videos.
