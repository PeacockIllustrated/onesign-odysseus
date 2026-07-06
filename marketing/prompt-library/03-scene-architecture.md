---
id: motion-03-scene-architecture
category: creative
title: Scene Architecture — reusable narrative skeleton
tags: [structure, beats, timing, narrative, skeleton]
---

# 03 · Scene Architecture (style-agnostic skeleton)

A narrative skeleton abstracted from the seed reel. The **beats and their job** transfer; the
**look of each beat is reskinned per brand**. Times are for a ~34s / ~1020-frame (30fps) reel —
compress or drop beats for a shorter cut.

| Beat | Job | ~frames | Reskin freely |
|------|-----|--------|----------------|
| 1 · Hook (result-first) | Show the payoff in ≤1.5s so the scroll stops | 0–90 | The payoff image, the punch line |
| 2 · Promise / thesis | One line: what this is | 90–200 | Type, caption motion |
| 3–5 · The "build" | Fast steps that show HOW it's made/used (the seed did Size→Artwork→Light→Send) | 200–560 | Replace the steps with the brand's own process/features |
| 6 · Money shot | The single hero transformation (seed: day→night sign glow) | 560–680 | The hero object + its signature move |
| 7 · Stinger | A hard claim / pattern-interrupt ("these aren't demos") | 680–720 | The claim, the flash motif |
| 8 · Social proof | Real case studies / logos montage | 720–870 | Assets, card layout, per-item motion |
| 9 · Emotional line | The human payoff ("the signs you've walked past? we made them") | 870–960 | Copy, restraint |
| 10 · Hard CTA | URL / handle / offer, unmissable | 960–1020 | CTA treatment, iris/wipe out |

## How to use

1. Map the treatment from `01-creative-direction` onto these beats — keep the *jobs*, swap the
   *content*.
2. Build each beat as a self-contained scene component; a top-level timeline array holds
   `{ scene → startFrame }` and `TOTAL_FRAMES` (see the seed's `src/Reel.tsx` / `src/scenes.tsx`).
3. Drop or merge beats for a shorter reel — the ordering (hook → build → money → proof → CTA) is
   the durable part.

## Durable principles (keep) vs. seed specifics (drop)

- **Keep:** result-first hook · one money shot · a repeating transition motif for rhythm ·
  case-study social proof · a hard CTA · sound-off legibility.
- **Drop:** the four studio steps, the folded-aluminium sign, the teal palette, Anton/Gilroy, the
  specific captions — all of those are *the seed brand's* answers, re-authored per new brand.
