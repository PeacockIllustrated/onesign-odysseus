---
id: motion-prompt-library-index
category: index
title: Motion-Graphics Prompt Library
tags: [reels, remotion, motion-graphics, brand-agnostic, template]
---

# Motion-Graphics Prompt Library

A **brand-agnostic** library of prompt modules that capture the *best parts of the process*
behind the Onesign design-studio reel — the render pipeline, the engineering guarantees, the
creative-direction workflow and the QA rhythm — **without** carrying over that reel's specific
style (teal/steel, folded-aluminium signs, its 11-scene narrative).

**Purpose:** point the same quality bar at a *new brand with a totally different look and feel*,
and get a professional result on the first pass. Process is inherited; style is authored fresh.

> These modules are written to be **stored on the Odysseus dashboard as a prompt library**
> (each file has front-matter `id` / `category` / `tags` so it can be seeded into a
> `prompt_library` table verbatim). Until that admin surface exists, they live here in git and a
> new chat reads them directly.

## The modules

| # | Module | What it fixes across brands |
|---|--------|------------------------------|
| 00 | `00-brand-intake.md` | **What changes per brand** — palette, type, feel, motion signature, hero object. Fill this first. |
| 01 | `01-creative-direction.md` | The multi-agent (Fable-5) director workflow that produces a strong, on-brief treatment. |
| 02 | `02-engineering-constraints.md` | The **non-negotiable technical spine** that makes any reel render headless and look pro. |
| 03 | `03-scene-architecture.md` | A reusable, **style-agnostic** narrative skeleton (beats + timing) to reskin freely. |
| 04 | `04-component-kit.md` | Which primitives to **reuse vs. rebuild** for a new look. |
| 05 | `05-qa-and-delivery.md` | QA-still rhythm, verify-from-MP4, CI isolation, branch/PR discipline. |

The concrete reference implementation these were distilled from lives in
`marketing/design-studio-reel/` (see its `REUSE-PLAYBOOK.md`). **Treat that project as a
worked example / template to fork, never as a style to copy.**

## Master kickoff prompt (paste into a new chat)

> Build a 9:16 vertical brand reel for **<BRAND>**. This is a **new brand with its own look and
> feel — do NOT port the style, palette, type or layout of `marketing/design-studio-reel/`.**
> Reuse only the *process*: read the whole `marketing/prompt-library/` first.
> 1. Fill in `00-brand-intake` for <BRAND> (I'll answer the open questions).
> 2. Follow `02-engineering-constraints` as hard rules — they are what guarantee it renders and
>    looks professional.
> 3. Run the `01-creative-direction` workflow to produce the treatment for <BRAND>'s feel.
> 4. Lay the film on the `03-scene-architecture` skeleton, then reskin every surface.
> 5. Work to the `05-qa-and-delivery` rhythm: QA-still → eyeball → full render → verify from MP4.
> Scaffold the new reel as its own standalone Remotion project under `marketing/<brand>-reel/`,
> kept out of the app build.

## Why decouple process from style

The reel that seeded this library was iterated hard (pulsing viewport removed, real assets
sourced, folded-aluminium panels, Gilroy nameplates). Almost none of *that* transfers to a new
brand — but the *reasons the render worked and looked sharp* transfer completely. Keeping those
two things separate is what gives **quality consistency across brands that look nothing alike**.
