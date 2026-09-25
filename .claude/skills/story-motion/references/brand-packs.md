# Brand packs

A brand pack is a small skill that sits on top of story-motion and makes every film for one client
look like it belongs to the same family. Build one when a client will want more than one piece.

## What goes in a pack

```
<brand>-motion/
├── SKILL.md                    # when to use + the brand rules below; says "use with story-motion"
└── assets/
    ├── <brand>-style.js        # STYLES.<brand> (palette roles + render mode) and CAST specs
    ├── <brand>-mark.js         # the logo as Path2D + drawBody() for mascots, kit drawing
    ├── crew.html               # the character bible (line-up, construction, expressions, rules)
    └── reference-piece.html    # the best finished film: the thing to lift from
```

The SKILL.md should state:
1. **Palette and style** — which render mode, which roles map to which brand colours, what never
   takes a brand colour (e.g. the customer character keeps a colour no staff member uses).
2. **The cast** — who's a brand character (staff, product, mascot) and who's a generic character
   (customers, public), and the rules for each (see characters.md → custom bodies).
3. **Kit per role** — one prop each, so the team reads at thumbnail size.
4. **The reference piece** and what to lift from it.
5. **Delivery preferences** — formats, where links go, review habits, anything the client asked for
   more than once.
6. **Craft notes specific to this client** that aren't general (e.g. "the fascia is always fitted
   before the letters").

## Building the cast from a mark

1. Get the logo as SVG; isolate the icon (the part that can be a body) — clip if the file includes a
   wordmark. Note its bounds in its own units.
2. Decide where colour lives (a cut-out, a counter, a background shape) — that's the role colour.
3. Make a crew sheet: 4–6 roles × kit, plus 6–8 eye placements side by side. Let the client pick;
   record the choice and the rejected options in the sheet so nobody re-litigates it.
4. Expressions sheet: neutral, happy, focused (half lids), surprised, wink, "job done".
5. Only then animate.

## Worked example: Onesign

`onesign-motion` is the Onesign & Digital pack: paper-and-ink house style, the "1nesign crew"
(staff are the Onesign mark — an O with a 1 cut out — with the 1 lit in each role's colour and an
eye either side of the stem), customers as paper characters, and a 40s reference film of a sign
being made. Look at it for how a pack is written.
