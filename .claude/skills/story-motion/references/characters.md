# Characters

## The rig

A character is a spec (what they are) and a state function (what they're doing at time t).

```js
CAST.maker = { shape: 'square', w: 150, h: 132, legLen: 50, color: 'c1', eyeGap: 38, eyeY: 0.62, eyeR: 7, k: 1.2 };

function makerState(t) {            // pure in t
  return { t, x, y /* feet */, rot, sx, sy /* squash & stretch */, dir,
           look: [x, y] /* -1..1 pupil direction */, blink, happy, wide,
           legs: { mode: 'stand' | 'sit' | 'air' | 'walk' }, jump,
           hands: [left | null, right | null] /* world points; null = rest */,
           handStyle: [null, 'thumb'] };
}
drawCharacter(CAST.maker, makerState(t));
```

- **Body:** `pill`, `round`, `square` — simple, readable at thumbnail size. Squash/stretch via `sy`
  with `sx = 1/√sy` (volume-preserving).
- **Eyes do all the acting.** No mouths. `look` aims the pupils; `happy` (^ ^), `blink`, `wide`
  (surprise), and `lids` 0–1 (sleepy, serious, focused; the template draws a lid line above 0.15 and
  a shut line above 0.85 — drive it back to 0 when they wake, or the line lingers like an eyebrow)
  cover almost every emotion.
- **Stick limbs** with a slight bend; hands are circles in the character's colour. Hands are placed
  in *world* space, so a hand can hold a prop, reach a keyboard or catch something precisely.
- **Arms cross the body only on purpose** — an arm drawn across the face hides the acting. Use the
  near hand for close work.

## Acting beats that read

- **Anticipation → action → follow-through.** Crouch (`sy` 0.82) before a jump; wind-up before a
  throw; the throwing hand carries on past the release point, then settles.
- **Land it.** `sy -= 0.14 * settle(t - landTime)` gives the little squash-wobble on landing.
  Squash about the **contact point**: characters already scale about their feet (the frame's base);
  for props, translate to the base before scaling, or a landing squash lifts them off the surface.
- **Pose hands with points.** `keys2(t, [[t0, [x, y]], [t1, [x, y], easing]])` moves a hand (or a
  prop) between poses — every pose change eases; nothing jumps.
- **Notice → look → react.** A character sees something (pupils track it), a beat of stillness,
  then the reaction. The beat of stillness is what makes it read.
- **Walking.** `legs: walkState(x, amt)` — feet stride with the ground covered, the body bobs and
  arms swing opposite. Drive `x` with `keys()` and derive `amt` from how fast `x` is changing (see
  the catcher in the template), so steps ease in and out instead of sliding.
- **Idle life.** A slow breath (`sy` ± 1.5%), occasional blinks (listed times), a tapping foot —
  using `cyc(t, n)` so idle motion loops exactly with the film.
- **Thumbs up** must be a wide fist with finger creases and a short stout thumb. A tall single digit
  reads as a middle finger. If the character is rotated or upside down, keep the thumb pointing up
  *in the room*.

## Custom bodies (mascots made from a logo)

`spec.drawBody(frame, state)` replaces the body shape. `frame.bx/by` is the body's bottom-centre,
`frame.sx/sy` the squash, `state.rot` the rotation. Transform into the logo's own units and fill it
from its SVG path (`new Path2D(d)`), never redraw it:

```js
spec.drawBody = (f, st) => {
  const s = spec.w / LOGO.w;
  ctx.save(); ctx.translate(f.bx, f.by); ctx.rotate(st.rot || 0); ctx.scale(f.sx * s, f.sy * s); ctx.translate(-LOGO.cx, -LOGO.base);
  ctx.fillStyle = col(spec.color); ctx.fill(ACCENT_SHAPE);   // e.g. colour glowing through a cut-out
  ctx.fillStyle = col('ink'); ctx.fill(LOGO_PATH);          // the mark itself, untouched
  // eyes, kit (hats, goggles, headsets) in the logo's units, so they turn and flip with the body
  ctx.restore();
};
```

Rules that keep a logo mascot on-brand: the mark is filled from its real path and never reshaped;
colour goes where the brand allows it (a cut-out, a counter, a background shape); eyes sit where
they don't fight the mark (try several placements side by side and let the client choose); one
piece of kit per role so the cast reads as a team with jobs. Build a one-page "crew sheet" (line-up,
construction, expressions, eye placement study, rules) before animating — it's the character bible.

**Edge-on flips:** if a body flips by scaling `sx` through zero, clamp `|sx| ≥ 0.07`. A zero-width
transform makes the wobble maths divide by ~0 and floods the frame with ink.
