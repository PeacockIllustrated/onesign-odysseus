---
id: motion-01-creative-direction
category: workflow
title: Creative Direction — multi-agent director workflow
tags: [fable-5, workflow, multi-agent, treatment, direction]
---

# 01 · Creative Direction (multi-agent)

How the seed reel got a strong concept fast: **parallel creative leads → executive synthesis**,
run as a Fable-5 `Workflow`. Use it when you need a *next-level* treatment, not a mechanical
reskin. For a pure logo/colour swap, skip this and just edit the style tokens.

## When to run it

- New brand, new feel, blank page → **run it.**
- "Make it pop / more viral / next level" → **run it** (it re-pitches, doesn't just tweak).
- Swapping assets on an existing template → **don't** — it's overkill.

## The workflow shape

```
Phase 1 — LEADS (parallel):   N creative leads, each pitches a COMPLETE treatment for the
                              brand's feel from a different angle (e.g. product-hero,
                              typographic, story-first, kinetic-abstract).
Phase 2 — JUDGE (parallel):   score each treatment on: on-brief feel, hook strength (first
                              1.5s), sound-off legibility, feasibility in CSS/DOM (no WebGL),
                              memorability.
Phase 3 — SYNTHESIS (1):      pick the winner, graft the best beats from runners-up, output a
                              single shooting treatment: scene list + timing + type/motion spec.
```

## Lead prompt template (fill from `00-brand-intake`)

> You are a creative lead directing a **9:16 sound-off <PLATFORM>** film for **<BRAND>**.
> Feel: **<3 adjectives>**. Hero object: **<hero>**. It must be renderable as **CSS/DOM in
> headless Chromium — no WebGL, no stock footage, no AI-generated frames** (everything drawn
> programmatically). Pitch a COMPLETE treatment from the **<angle>** angle: the hook (first
> 1.5s), the beat-by-beat scene list with rough frame durations at 30fps, the type system, the
> motion signature, the transition motif, and the CTA. Optimise for a scroll-stopping hook and
> full legibility with the sound off.

## What to keep from the seed process (not its output)

- **Result-first hook** — show the payoff in frame 1, explain after. (What the *result* is
  changes per brand; that it leads changes never.)
- **Sound-off first** — kinetic captions carry meaning; music is a bed, not a crutch.
- **One money-shot** the whole film builds toward.
- **A repeating transition motif** for rhythm (the seed used whip-flash + iris; pick the brand's
  own).

Output of this module = a treatment that feeds `03-scene-architecture`.
