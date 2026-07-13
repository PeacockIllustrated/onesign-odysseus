# scripts/neon-bttf

One-off generator for the **Back to the Future neon** production pack in
`docs/production/back-to-the-future-neon/`.

```bash
npx tsx scripts/neon-bttf/generate.mts
```

`generate.mts` builds the 1:1 artwork (Gilroy-Bold outlines via `opentype.js`) and
drives the real neon engine in `lib/visualiser/*` — the same `importSvg` →
`measureNeon` → `generateNeonPdfBlob` path the `/admin/visualiser/neon` tool uses —
to write the master SVG, the annotated run-length PDF, and a true 1:1 tiled bending
template. It runs the browser-only engine headless via a `happy-dom` `DOMParser`
shim and a `/fonts/*.ttf` `fetch` shim (so the PDF embeds the brand font).

Design constants (finished width, lean, colours, backboard padding, cable side,
metres-per-transformer) live at the top of the file. Change one and re-run to
regenerate the whole pack.
