# Back to the Future — neon sign (production files, 1:1)

Production pack for a LED-neon-flex "Back to the Future" sign, generated with the
Odysseus **Neon length tool** (`/admin/visualiser/neon`) engine. The lettering is
the shop's own typographic treatment — the words set as **outline neon** in the
brand font (Gilroy Bold), with a 10° forward lean — not a copy of the film's
stylised logo. All geometry is at true **1:1** scale (real millimetres).

## Spec at a glance

| | |
|---|---|
| Artwork size (1:1) | **1000 × 320 mm** |
| Style | Outline neon (tube follows each letter outline + counters) |
| Neon runs | **20** |
| Total neon flex | **8,590 mm (8.59 m)** — allow extra for joints / offcuts |
| Transformers / drivers | **1** (rated 10 m each) |
| Mains cable entry | **Bottom** edge |
| Backboard | Rectangle **1120 × 440 mm**, clear acrylic, 60 mm border (0.49 m²) |

### Neon flex by colour (order per colour)

| Colour | Swatch | Runs | Length |
|---|---|---|---|
| Neon red | `#FF2E1C` | 7 | 5.39 m |
| Neon amber | `#FFD21E` | 13 | 3.20 m |

The two colours split by line: **FUTURE** in red, **BACK TO THE** in amber.
Confirm both against your neon-flex swatch book before ordering.

## Files

| File | What it is |
|---|---|
| `back-to-the-future-neon.svg` | 1:1 master artwork (real mm; `width="1000mm"`). Colour = neon run colour. Open in Illustrator or re-upload to the Neon tool. |
| `back-to-the-future-neon-lengths.pdf` | Annotated run-length take-off (3 × A4L): numbered balloon per run + length table, coloured reference, backboard & colour totals. |
| `back-to-the-future-neon-template-1to1.pdf` | **True 1:1 bending template** (map page + 2 × 3 A3 tiles). Print at 100% / no scaling, verify the 100 mm check-bar, trim to the crop marks and overlap to the registration crosses. Lay the neon flex straight onto it. |
| `spec.json` | Machine-readable spec (the numbers above). |

## Reproduce / change the size

The pack is generated from `scripts/neon-bttf/generate.mts`, which drives the real
`lib/visualiser` neon engine (same code path as the app):

```bash
npx tsx scripts/neon-bttf/generate.mts
```

To resize, edit `TARGET_WIDTH_MM` (default `1000`) — or the lean, colours, backboard
padding, cable side and metres-per-transformer constants — at the top of that file
and re-run. Everything (run lengths, transformer count, backboard, template tiling)
recomputes from the new size.

You can also do it in the app: open `/admin/visualiser/neon`, drop
`back-to-the-future-neon.svg` in, set the real width to your target, and download the
annotated PDF.
