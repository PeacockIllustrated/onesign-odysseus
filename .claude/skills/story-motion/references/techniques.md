# Techniques

Everything here is in `assets/template.html` unless marked *(advanced)*, in which case the snippet
is below.

## Beat sheet and keys
- `T` holds every time. Derive, don't repeat: `T.land = [T.leap[1], T.leap[1] + 0.45]`.
- `keys(t, [[t0, v0], [t1, v1, easing], ...])` for anything that moves between poses.
- Easing vocabulary: `inOutSine` (camera, drifts), `inOutCubic` (moves with intent), `outBack`
  (pops, overshoot), `outBackBig` (cartoon pop), `inCubic` (falls), `settle()` (landing wobble).
- **Making room for a new beat:** add it to `T`, then shift every later key by the same amount
  (a small script over the `T` block and camera keys is safer than hand-editing), and extend
  `STORY_END`. Re-check the end of the film: loops and lighting cues live there.

## Paths
- `arcPath(points)` + `pathAt(A, s)`: a Catmull-Rom spline sampled by arc length, so speed along it
  is exactly the easing you give `s`. Use for thrown/flying objects.
- A thrown thing: fast off the hand, easing into the catch — `s = 1 - (1-u)^1.6`.
- **Floating (paper, leaves):** make the speed along the path vary — integrate a speed profile into
  a table (`c[i] = c[i-1] + v(t)`, normalise) and look `s` up from it. Lets an object hang in the
  air past a character without ever leaving its path.
- Rotation + `flip = cos(2π·u)` (scale x by flip) reads as a card tumbling in 3D.

## Camera
- `camKeys(t, [[t, cam(cx, cy, zoom), easing], ...])`; a key's value may be a function of t for
  follow shots (`followCard`). Zoom interpolates in log space so pushes feel even.
- Compose each key for 9:16: the phone sees ~830 world units ÷ zoom across. Faces and hands in the
  centre third.
- A follow cam lags its subject slightly (sample the subject at `t - 0.15`).
- Push in for the payoff (zoom ~1.4–2 on the face), pull wide for the reaction, drift home to loop.

## Time warps (slow motion, speed-ups)
- `speedAt(storyT)` returns playback speed; `WARP` integrates it into a table; `realAt`/`storyAt`
  convert. Slow motion: `k: 0.08–0.15` over the key moment with ~0.07s ramps.
- Everything slows together, but the line wobble keeps ticking in real time — that's what makes it
  read as slow motion rather than a pause. Deepen the vignette while slow (the template does).
- Speed up travel (a flight, a drive) with `k: 1.5–1.8` so journeys don't drag.
- `stills.mjs --real` samples even real time to judge pacing as the viewer sees it.

## Motion blur
- `ghosted(t, drawFn)` draws faint earlier copies — for fast objects the camera isn't following.
- *(advanced)* **Camera smear:** when the camera itself moves fast, render the world offscreen and
  composite copies spread along the camera's motion, then draw the tracked subject sharp on top:
  ```js
  const SHUTTER = 0.75 / FPS;                                   // real seconds the shutter is open
  const c = camera(t), cp = camera(storyAt(Math.max(0, r - SHUTTER)));
  const mv = [(cp.cx - c.cx) * c.zoom, (cp.cy - c.cy) * c.zoom], smear = Math.hypot(...mv);
  if (smear > 5) {                 // world → offscreen canvas `off`, then:
    const n = Math.min(12, Math.ceil(smear / 3)) + 1;
    for (let i = 0; i < n; i++) { const u = i / (n - 1) - 0.5; ctx.globalAlpha = 1 / (i + 1); ctx.drawImage(off, mv[0] * u * K, mv[1] * u * K); }
    ctx.globalAlpha = 1;           // then draw the subject sharp with the normal camera transform
  }
  ```

## Light and time of day *(advanced)*
- **Dusk/night:** a `nightAt(t)` key curve (0 day → 1 night). Darken the set with a
  `multiply` fill, then add light with `lighter`: window glows, lamp cones, a pool on the pavement,
  a sign's halo (radial gradients in warm colours scaled by night level).
- **Two layers so light sits behind people:** draw the set and its lights first; draw the moving cast
  on an offscreen layer, darken that layer with `source-atop`, add the same light sources to it,
  composite it on top. Now a window glows *behind* whoever stands in front of it.
- **Shadows from a lamp:** for each person, a gradient quad from their feet away from the lamp,
  length ∝ their height and distance, fading out.
- **Focus pull:** render the world offscreen, draw it back with `ctx.filter = 'blur(Npx)'` — at the
  loop point it hides the seam between end and start.

## Props and sets
- Sets are drawn in world units with roles, so they restyle for free. Keep the stage quiet behind
  hero beats — move furniture rather than fight it.
- Vehicles: model the silhouette with per-corner radii (square where the real thing is square),
  real wheels (tyre, rim, hub, bolts), shading bands. Toy wheels read as toy vehicles.
- Logos and wordmarks: fill from the real SVG path (`Path2D`), never approximate with text.

## Loops
- Idle motion: `cyc(t, n)` — whole cycles over `STORY_END`.
- First frame = last frame: same camera (`HOME`), same poses, props reset off-screen or back home.
- Check with `stills.mjs --at 0,<STORY_END - 0.001>` side by side.
