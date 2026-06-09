# Onesign Odysseus — Visualiser Handoff (May 2026)

## Project context

**Onesign Odysseus** is the internal production platform for **Onesign & Digital**, a signage agency in Team Valley, Gateshead. Single-tenant. Next.js 16 (App Router), TypeScript strict, Tailwind 4, Supabase, jsPDF, React Three Fiber, Zustand. Brand accent `#4e7e8c`.

The **Folded Aluminium Panel Visualiser** lives at `app/(portal)/admin/visualiser/` and is the most active feature in the codebase. It lets staff design a folded-aluminium sign, place SVG artwork on it, assign materials per artwork path, preview in 3D, and export production-ready CAM cut files.

## Key files

```
app/(portal)/admin/visualiser/
  VisualiserClient.tsx    # main client component, state orchestration
  ControlsPanel.tsx       # left sidebar — panel dimensions
  SvgDropzone.tsx         # artwork import + Material Groups editor
  FlatPreview.tsx         # 2D flat-development canvas
  Scene3D.tsx             # R3F 3D scene
  ExportBar.tsx           # PDF export + Save (sticky footer)
  store.ts                # Zustand state

lib/visualiser/
  pdf.ts                  # production + reference PDF generators (~2000 LOC)
  pdf-fonts.ts            # Gilroy TTF loader for jsPDF
  svg-import.ts           # SVG flatten + curve subdivision (FLATNESS_TOL = 0.005)
  geometry.ts             # panel development, section clipping, fixings
  types.ts                # PanelParams, MaterialPiece, StandoffPiece, etc.
```

## Material system (current state)

Each imported SVG path is assigned (explicitly or by default) to ONE material kind. Current kinds:

| Material | What it is | Production output |
|---|---|---|
| `cut` (default) | Cut OUT of panel face | Closed contour on Page 1 of production PDF |
| `solid` | Kept as panel material | (visual only — no cut emitted; intended for stencil-style with future bridges) |
| `vinyl` | Flat vinyl appliqué stuck to face | Compound shape on Vinyl cut page |
| `acrylic` | Acrylic slab face-stuck to panel | Compound shape on Acrylic cut page |
| `standoff` | Extruded letter mounted on studs in front of face | Compound shape on Standoff cut page |

Material groups are managed in `SvgDropzone.tsx`'s **Material Groups panel** (button: "+ New material group"). Each group carries its own colour, thickness, and (for standoff) standoff distance.

## Compound-path semantics (just fixed — important)

A letter `R` from Illustrator is a **compound path**: outer outline + inner counter with opposite winding. In SVG, the counter is a HOLE in the compound. We now treat this correctly everywhere:

- **`parentByIndex`** in `VisualiserClient.tsx` builds the nesting tree via centroid containment with strict area inequality.
- **`isNested(i)`** marks every nested path as `kind: 'inherited'` in `effectiveMaterials` — these paths are HOLES in their parent's compound, never separate pieces.
- **`holesByIndex[i]`** gives each outer path its list of nested holes.
- **MaterialPiece** has `{ path, holes? }` — face-stuck materials render with these holes via even-odd fill (vinyl/acrylic/standoff all do this correctly in Scene3D + FlatPreview + PDF material pages).
- **Aperture cuts** (raw panel cut, no keyline): emit ONLY outer outline. Counter falls out with the letter-piece during fabrication — the honest physical reality without bridges. UI surfaces a **counter-survival warning** when this case is detected, with a one-click **Enable keyline (1.5 mm)** button.
- **Keyline mode = push-through**: panel cut uses the outward-offset keyline (simple letter hole, no counter cut on panel). The push-through insert page emits outer apertures + their counter outlines as separate closed contours — the cutter produces two pieces per letter (outer shape + counter shape), and the operator assembles them on a backing board.

## How push-through actually works in production *(from Tom)*

> Letters are mounted to an acrylic / opal backing board in a precise layout. Both the outer letter piece AND the inner counter piece are glued in their correct positions on the backing board. The backing board (with all parts attached) is pressed into the BACK of the face panel from inside. The face panel has simple letter-shaped holes at the keyline outline. The acrylic pieces protrude slightly through those holes, including the counter pieces sitting in their proper positions. When you look at the front, you see the outer letter AND the inner counter, both as illuminated acrylic, with the face panel paint surrounding them.

This means the current keyline + push-through code is *structurally correct* for production:

- Face panel cut = outer letter outline only (via keyline)
- Push-through insert page = outer outline + counter outline as separate closed contours (cutter produces two pieces; both go on the backing board)

What's missing is a **first-class "push-through" material group** so the user can opt specific letters/paths into push-through without flipping a global `keylineMm` toggle, AND a 3D visualisation that shows the letters protruding through the panel face with their counter pieces visible.

## Recent commits (latest first)

| SHA | What |
|---|---|
| `a387dee` | Compound-path correctness — counters are holes, not islands. Counter-survival warning + Enable keyline button. |
| `3e95277` | PDF documentation overhaul — brand strap, fixed sheet sizes, legend + revision block, QR codes, Gilroy fonts. |
| `efb4326` | Multi-page production PDF — panel cut + push-through + per-material cut pages + placement template. |
| `9c4dfad` | Visualise solid pieces in panel colour; auto-detect counters (later reversed in `a387dee`). |
| `08b04a4` | UX overhaul applying design critique — unified mode pill, warnings tray, ready checklist, brand teal. |
| `f05ee69` | Reference PDF scaling fix + one page per material. |
| `870d8be` | Keyline IS the panel cut; push-through insert as separate page. |

Branch: `claude/beautiful-bardeen-7af47e`. Worktree: `.claude/worktrees/beautiful-bardeen-7af47e`.

## Next task: first-class push-through material group

**Goal**: Add `'pushthrough'` as a material kind in the Material Groups system. The user picks SVG paths, assigns them to a push-through group, sets thickness + acrylic color + protrusion depth. The visualiser then:

1. **3D scene**: renders those letters as acrylic pieces protruding from the panel face. Counter pieces visible in their proper positions (separate small pieces of the same acrylic). Panel face is cut at the keyline outline (outer letter shape only).
2. **Flat preview**: same compound rendering as today's standoff, but at the panel face (not floating in front).
3. **Production PDF**:
   - Panel-cut page: those letters' OUTER keyline outlines become holes in the face panel (no counter cuts).
   - Push-through insert page: outer letter outlines + counter outlines as separate closed contours (two pieces per letter, the operator mounts both on the backing board).
   - Reference PDF: a new "Push-through" page in the material breakdown.
4. **Per-group keyline offset**: a group-level `keylineOffsetMm` field (default 1.5 mm). Different push-through groups can have different keyline offsets for different press fits. This SUPERSEDES the global `params.keylineMm` for paths in a push-through group; `params.keylineMm` becomes the legacy fallback for ungrouped paths.

## Implementation sketch

### types.ts

```ts
// Extend GroupMaterial enum:
material: z.enum(['cut', 'solid', 'vinyl', 'acrylic', 'standoff', 'pushthrough'])

// New optional fields on MaterialGroup:
keylineOffsetMm?: number  // mm, default 1.5
protrusionMm?: number     // mm, default 5 — how far the insert sticks proud of the panel face

// New piece type:
export interface PushThroughPiece {
    pathIndex: number;
    path: FlatPath;
    holes?: FlatPath[];           // counter pieces — cut separately, mounted to backing
    color: string;                // acrylic colour
    thicknessMm: number;          // typically 5 mm
    keylineOffsetMm: number;      // panel hole shoulder
    protrusionMm: number;         // how proud of the face
}
```

### VisualiserClient.tsx

- Extend `Effective` discriminated union with `{ kind: 'pushthrough', color, thicknessMm, keylineOffsetMm, protrusionMm }`.
- `materialPieces.pushthrough: PushThroughPiece[]` parallel to existing `vinyl`/`acrylic`/`solid` arrays.
- For paths in a push-through group: nested paths become `'inherited'` (still holes in the parent compound — they get carried in the `holes` field, cut as separate pieces on the insert page, mounted to the backing board in production).
- **Panel cut generation for push-through paths**: build a per-path keyline using each group's `keylineOffsetMm`, push into the existing `keyline` array. The panel-cut page picks up keyline-or-aperture-per-section as it already does.
- **Push-through insert page**: receive `pushThroughPiecesBySection` (or just flat — the bbox-page code centres content), emit outer + each hole as separate closed contours.

### Scene3D.tsx

- New `PushThroughPieces` component mirroring `StandoffLettering` but mounted AT the panel face (z ≈ 0 to `protrusionMm`) rather than offset in front. The face has the keyline hole (already cut via `holesLocal`). The push-through piece renders as an extruded compound (outer + counter holes via three.js Shape with `THREE.Path` holes) — counter pieces are visible because the panel hole is at the keyline outline, larger than the letter, so the counter sits *inside the panel hole alongside the outer piece*.

**Important detail**: the counter PIECE is a separate small acrylic shape, not a hole in the outer piece. In three.js, the outer piece is an extruded outer shape (no holes). The counter piece is a separate extruded outer shape (the counter outline). Both extruded at the same depth, at the same z-offset, in the same colour. Visually: you see two pieces of acrylic in the panel hole, in their proper positions, indistinguishable from a single letter shape because there's no gap between them — they fit the original letter geometry exactly.

### FlatPreview.tsx

- Render push-through pieces with outer outline + counter outlines filled in the same colour. Same visual as vinyl/acrylic but with the keyline ring around them showing the panel cut.

### lib/visualiser/pdf.ts

- New `pushThroughPieces` field in `PdfOptions`.
- Production PDF: page 1 panel cut already uses keyline-when-present, so push-through paths' keylines slot in naturally as long as we build them. Push-through insert page replaces / coexists with the existing one — emit outer + each hole as separate closed contours.
- Reference PDF: add `'pushthrough'` to `MaterialPageSpec['kind']`, build a page with outer + counter outlines filled in the acrylic colour, ghosted other materials around them.

### SvgDropzone.tsx (the side panel)

- Add `'pushthrough'` button to the 5-button material picker (currently Cut / Solid / Vinyl / Acrylic / Stood off). Probably bump to a 6th column or restructure as 2 rows.
- New inline controls when material === 'pushthrough': Colour, Thickness (mm), Keyline offset (mm), Protrusion (mm).
- Tooltip: "Letters press-fit through holes in the panel face from behind. Inner counters cut as separate pieces, both mounted to a backing board. Counter shows in the panel hole alongside the outer letter."

## Conventions to follow

- **No emoji in commits or code** unless asked.
- **Comments**: only the WHY, not the WHAT. Existing comments are dense and load-bearing — don't strip them; do add ones for non-obvious decisions.
- **Server actions** return `Result<T>` (see `lib/result.ts`).
- **Tests**: `npx vitest run lib/visualiser` should pass before commit. There are currently 58 tests covering geometry / split / keyline / fixings / sectioned-export / path-flatten.
- **Typecheck**: `npx tsc --noEmit` must be clean.
- **Branch / PR**: work continues on `claude/beautiful-bardeen-7af47e`.

## How to verify

Visualiser is at `/admin/visualiser` (requires admin auth). Best test SVG: a multi-letter sign with counters (R, O, A, e). Toggle materials per-group, watch the 3D scene + flat preview update, then export the production PDF and verify each page renders the right cuts.

---

## Prompt for the new chat

```
I'm continuing work on the Onesign Odysseus visualiser at app/(portal)/admin/visualiser/. Read HANDOFF.md at the worktree root for full context — but in short:

We just finished a major correctness fix around SVG compound paths (commit a387dee). Nested paths are now properly treated as compound-shape holes, and the production PDF emits the right things for each material kind: outer-only for raw panel cuts, outer + counter contours on the push-through insert page so the operator gets two separate pieces per letter to mount on a backing board.

Next task: add a first-class 'pushthrough' material kind to the Material Groups system. User picks SVG paths, assigns them to a push-through group, sets thickness + acrylic colour + keyline offset + protrusion depth.

The implementation sketch is in HANDOFF.md — types.ts (extend GroupMaterial enum, add PushThroughPiece type with keylineOffsetMm + protrusionMm), VisualiserClient.tsx (Effective kind, materialPieces.pushthrough, per-path keyline build), Scene3D.tsx (PushThroughPieces component — outer + counter pieces extruded at panel face, both visible inside the keyline hole, NOT a compound-with-hole-through-insert), FlatPreview.tsx, lib/visualiser/pdf.ts (production + reference pages), SvgDropzone.tsx (UI for the 6th material option).

Crucial production detail: push-through letters are NOT one compound piece with a hole. They're two SEPARATE small acrylic pieces (outer letter + inner counter), mounted to a backing board in the correct positions, pressed into the back of the panel. The face panel has simple keyline holes. The counter is visible through the panel hole because it's a real piece of acrylic sitting next to the outer piece on the backing board.

Branch is claude/beautiful-bardeen-7af47e. Run npx tsc --noEmit and npx vitest run lib/visualiser before each commit. Commit messages follow the existing pattern (Co-Authored-By: Claude Opus 4.7 (1M context)).

Start by reading types.ts, VisualiserClient.tsx (especially the materialPieces useMemo and effectiveMaterials), and the Scene3D StandoffLettering component — that's the closest existing analog for the 3D rendering.
```
