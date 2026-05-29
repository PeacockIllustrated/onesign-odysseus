'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
    AlertTriangle,
    Bookmark,
    ChevronDown,
    Crosshair,
    Eye,
    EyeOff,
    Layers,
    Sliders,
    Upload,
    X,
} from 'lucide-react';
import { useVisualiser } from './store';
import { ControlsPanel } from './ControlsPanel';
import { SvgDropzone } from './SvgDropzone';
import { FlatPreview } from './FlatPreview';
import { ExportBar } from './ExportBar';
import {
    buildDevelopment,
    placeAperture,
    placementTransform,
    clipApertureToFace,
    placeFixings,
    buildSectionedExport,
    clipApertureToSection,
    validateExport,
    circlePoly,
} from '@/lib/visualiser/geometry';
import { splitPanels } from '@/lib/visualiser/split';
import { importSvg, buildKeyline } from '@/lib/visualiser/svg-import';
import {
    PanelParamsSchema,
    DEFAULT_PLACEMENT,
    GROUP_HIGHLIGHT_PALETTE,
    type VisualiserDesignRow,
    type PanelParams,
    type MaterialPiece,
    type StandoffPiece,
    type PushThroughPiece,
} from '@/lib/visualiser/types';

const ACCENT = '#4e7e8c';
const ACCENT_DARK = '#3a5f6a';

const Scene3D = dynamic(() => import('./Scene3D'), {
    ssr: false,
    loading: () => (
        <div className="flex h-full items-center justify-center bg-white text-sm text-neutral-400">
            Loading 3D preview…
        </div>
    ),
});

type Tab = 'folded' | 'unfold' | 'flat';

const TAB_LABELS: Record<Tab, string> = {
    folded: '3D folded',
    unfold: '3D unfold',
    flat: 'Flat development',
};

/** Which pane is showing on a phone-sized screen. Desktop ignores this. */
type MobilePane = 'preview' | 'settings' | 'designs';

function ViewToggle({
    on,
    setOn,
    label,
}: {
    on: boolean;
    setOn: (v: boolean) => void;
    label: string;
}) {
    const Icon = on ? Eye : EyeOff;
    return (
        <button
            type="button"
            onClick={() => setOn(!on)}
            aria-pressed={on}
            className={`flex min-h-[28px] items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                on ? 'text-white' : 'text-neutral-500 hover:bg-neutral-100'
            }`}
            style={on ? { background: ACCENT } : undefined}
        >
            <Icon size={12} aria-hidden />
            {label}
        </button>
    );
}

export function VisualiserClient({
    initialDesigns,
    prefill,
    initialLoadId,
}: {
    initialDesigns: VisualiserDesignRow[];
    prefill: { patch: Partial<PanelParams> & { quoteId: string | null }; quoteItemId: string } | null;
    /**
     * Design ID from `?id=<...>` in the URL (set by QR codes on the
     * exported PDFs). When set and the id exists in `initialDesigns`,
     * that design is loaded on mount so the operator lands on the
     * exact design the QR refers to.
     */
    initialLoadId: string | null;
}) {
    const {
        params,
        imported,
        applyPrefill,
        loadDesign,
        designId,
        fixingMode,
        setFixingMode,
        addManualFixing,
        removeManualFixing,
        cableMode,
        setCableMode,
        addCableHole,
        removeCableHole,
        editingGroupId,
        pendingPaths,
        togglePendingPath,
        startGroupEditFromPath,
        cancelGroupEdit,
        setParam,
    } = useVisualiser();
    const [tab, setTab] = useState<Tab>('folded');
    const [mobilePane, setMobilePane] = useState<MobilePane>('preview');
    const [designs] = useState(initialDesigns);
    // 1 = folded, 0 = flat. Scrubbed by the unfold slider / replay.
    const [fold, setFold] = useState(1);
    const [unfoldKey, setUnfoldKey] = useState(0);
    // View-layer toggles. Defaults keep the production-realistic look on
    // first paint; the operator turns layers off for clarity when needed.
    const [showStandoffLetters, setShowStandoffLetters] = useState(true);
    const [showStandoffLocators, setShowStandoffLocators] = useState(true);
    const [showOutlines, setShowOutlines] = useState(true);

    // Auto-play the unfold (folded → flat) when the tab opens or on replay.
    useEffect(() => {
        if (tab !== 'unfold') return;
        let raf = 0;
        const dur = 1400;
        const t0 = performance.now();
        const tick = (now: number) => {
            const t = Math.min(1, (now - t0) / dur);
            const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
            setFold(1 - eased);
            if (t < 1) raf = requestAnimationFrame(tick);
        };
        setFold(1);
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [tab, unfoldKey]);

    // One-shot quote pre-fill.
    useEffect(() => {
        if (prefill) {
            const { quoteId, ...patch } = prefill.patch;
            applyPrefill(patch, quoteId, prefill.quoteItemId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // One-shot auto-load from ?id= (QR codes on exported PDFs land here).
    // Mirrors handleLoad — re-imports the SVG so artwork is back in the
    // editor too, not just the parameters.
    useEffect(() => {
        if (!initialLoadId) return;
        const row = initialDesigns.find((d) => d.id === initialLoadId);
        if (!row) return;
        let imp = null;
        if (row.svg_source) {
            try {
                imp = importSvg(row.svg_source);
            } catch {
                imp = null;
            }
        }
        loadDesign(row, imp);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Global Escape handler — closes whichever modal state is active.
    // Group edit takes priority over fixing mode so the operator can
    // hold Esc and walk out of any nested workflow cleanly.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            if (editingGroupId !== null) {
                cancelGroupEdit();
            } else if (fixingMode !== 'off') {
                setFixingMode('off');
            } else if (cableMode !== 'off') {
                setCableMode('off');
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [
        editingGroupId,
        fixingMode,
        cableMode,
        cancelGroupEdit,
        setFixingMode,
        setCableMode,
    ]);

    const valid = PanelParamsSchema.safeParse(params);

    const development = useMemo(() => {
        if (!valid.success) return null;
        return buildDevelopment(params);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(params), valid.success]);

    const split = useMemo(
        () =>
            splitPanels(
                params.panelWidthMm,
                undefined,
                params.centrePanelOverrideMm ?? undefined,
            ),
        [params.panelWidthMm, params.centrePanelOverrideMm],
    );

    const placement = params.aperturePlacement ?? DEFAULT_PLACEMENT;

    // The placed + clipped lettering outline. In aperture mode this is what
    // gets cut. In standoff mode it becomes a non-cut REFERENCE and we put
    // small fixing holes inside it on the panel instead.
    const placedClip = useMemo(() => {
        if (!development || !imported)
            return { paths: [], wasClipped: false, anyOutside: false };
        const placed = placeAperture(
            development,
            imported.paths,
            imported.bbox,
            placement,
        );
        return clipApertureToFace(development, placed);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [development, imported, JSON.stringify(placement)]);

    // Same placement + clipping, but tracked per original imported path so
    // material assignments (cut / vinyl / acrylic) can be applied by
    // original index — preserves the user's mental model of "click that
    // shape, paint it vinyl" even when paths get clipped to face bounds.
    const placedClipByIndex = useMemo<Array<import('@/lib/visualiser/types').FlatPath | null>>(() => {
        if (!development || !imported) return [];
        const imp = imported;
        return imp.paths.map((path) => {
            const placed = placeAperture(
                development,
                [path],
                imp.bbox,
                placement,
            );
            const clipped = clipApertureToFace(development, placed);
            return clipped.paths[0] ?? null;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [development, imported, JSON.stringify(placement)]);

    // Lookup: original imported-path index → owning material group (if
    // any). One path can only belong to one group at a time; we just
    // index forwards so the lookup is O(1) at render.
    const groupByPath = useMemo(() => {
        const map = new Map<
            number,
            NonNullable<PanelParams['materialGroups']>[number]
        >();
        for (const g of params.materialGroups ?? []) {
            for (const i of g.pathIndices) map.set(i, g);
        }
        return map;
    }, [params.materialGroups]);

    // Containment map — for each imported path, the index of the
    // SMALLEST closed path that contains its centroid (or null). Drives
    // donut behaviour: a path nested inside another renders as an
    // even-odd hole in the parent's material, regardless of its own
    // assignment. Matches the SVG fill-rule semantics the operator
    // expects from their artwork.
    const parentByIndex = useMemo(() => {
        const result: Array<number | null> = [];
        const polyArea = (pts: Array<[number, number]>): number => {
            let a = 0;
            for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
                a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
            }
            return Math.abs(a) / 2;
        };
        const containsPoint = (
            ring: Array<[number, number]>,
            p: [number, number],
        ): boolean => {
            let inside = false;
            for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
                const xi = ring[i][0];
                const yi = ring[i][1];
                const xj = ring[j][0];
                const yj = ring[j][1];
                if (
                    yi > p[1] !== yj > p[1] &&
                    p[0] <
                        ((xj - xi) * (p[1] - yi)) / (yj - yi || 1e-12) + xi
                ) {
                    inside = !inside;
                }
            }
            return inside;
        };
        // Pre-compute areas + centroids once — saves an O(n²)*pts
        // recomputation when scanning candidate parents.
        const areas: number[] = [];
        const centroids: Array<[number, number] | null> = [];
        for (const p of placedClipByIndex) {
            if (!p || !p.closed || p.points.length < 3) {
                areas.push(0);
                centroids.push(null);
                continue;
            }
            areas.push(polyArea(p.points));
            let cx = 0;
            let cy = 0;
            for (const [x, y] of p.points) {
                cx += x;
                cy += y;
            }
            centroids.push([cx / p.points.length, cy / p.points.length]);
        }
        for (let i = 0; i < placedClipByIndex.length; i++) {
            const c = centroids[i];
            if (!c) {
                result.push(null);
                continue;
            }
            const myArea = areas[i];
            let parent: number | null = null;
            let parentArea = Infinity;
            for (let j = 0; j < placedClipByIndex.length; j++) {
                if (i === j) continue;
                const other = placedClipByIndex[j];
                if (!other || !other.closed || other.points.length < 3)
                    continue;
                // Strict area inequality — a parent must be larger than
                // its child. Stops two overlapping paths from picking
                // each other as parent and creating a cycle (which made
                // the walker functions loop forever and hung the app).
                if (areas[j] <= myArea) continue;
                if (!containsPoint(other.points, c)) continue;
                if (areas[j] < parentArea) {
                    parent = j;
                    parentArea = areas[j];
                }
            }
            result.push(parent);
        }
        return result;
    }, [placedClipByIndex]);

    // Returns true iff `i` is in the subtree of `root` — used to gather
    // every descendant of a vinyl / acrylic outer so they can be drawn
    // as evenodd holes in that outer's compound shape. Depth cap is a
    // belt for the bracing in parent-map computation: parents are area-
    // strict so cycles shouldn't happen, but if one ever slips through
    // the helper still terminates.
    const isDescendantOf = (i: number, root: number): boolean => {
        let cursor = parentByIndex[i];
        let depth = 0;
        while (cursor !== null && depth < 256) {
            if (cursor === root) return true;
            cursor = parentByIndex[cursor];
            depth++;
        }
        return false;
    };
    // A path is "nested" iff any other path contains it. Per SVG
    // compound-path semantics, nested paths are HOLES in their parent's
    // compound shape — never separate pieces on their own. This
    // applies regardless of the parent's material kind:
    //   - inside a cut letter → counter (lost in production unless
    //     keyline+push-through is enabled)
    //   - inside a vinyl/acrylic/standoff outer → compound hole in the
    //     material piece (visible as hole through the material)
    // Either way the nested path is owned by the ancestor's compound
    // and must not be rendered or emitted as its own thing.
    const isNested = (i: number): boolean =>
        parentByIndex[i] !== null && parentByIndex[i] !== undefined;

    // Set of paths in the active edit selection (multi-select).
    const pendingPathsSet = useMemo(
        () => new Set(pendingPaths),
        [pendingPaths],
    );

    // Per-imported-path highlight colour. Each group gets a deterministic
    // palette colour by position in materialGroups, so the operator can
    // tell groups apart at a glance on the flat canvas.
    const pathGroupColors = useMemo(() => {
        if (!imported) return null;
        const groups = params.materialGroups ?? [];
        const positionById = new Map<string, number>();
        groups.forEach((g, i) => positionById.set(g.id, i));
        return imported.paths.map((_, i) => {
            const g = groupByPath.get(i);
            if (!g) return null;
            const pos = positionById.get(g.id) ?? 0;
            return GROUP_HIGHLIGHT_PALETTE[
                pos % GROUP_HIGHLIGHT_PALETTE.length
            ];
        });
    }, [imported, params.materialGroups, groupByPath]);

    const isEditingGroup = editingGroupId !== null;

    const mode = params.apertureMode ?? 'aperture';
    // Diameter is the source of truth; fall back to legacy radius * 2 for
    // designs saved before the units change.
    const fixingDiameter =
        params.fixingDiameterMm ??
        (params.fixingRadiusMm ? params.fixingRadiusMm * 2 : 10);

    // Effective material for every imported path: the path's own group
    // assignment wins; otherwise the default-for-ungrouped is driven by
    // `apertureMode` (the operator's "what most of this sign is made of"
    // hint). Nested paths are owned by their material ancestor —
    // they're rendered as evenodd holes in the ancestor's compound, so
    // they're treated as 'inherited' and contribute nothing on their own.
    type Effective =
        | { kind: 'cut' }
        | { kind: 'solid' }
        | { kind: 'vinyl'; color: string }
        | { kind: 'acrylic'; color: string; thicknessMm: number }
        | {
              kind: 'standoff';
              color: string;
              thicknessMm: number;
              standoffDistanceMm: number;
          }
        | {
              kind: 'pushthrough';
              color: string;
              thicknessMm: number;
              keylineOffsetMm: number;
              protrusionMm: number;
          }
        | { kind: 'inherited' };

    const defaultUngroupedKind: 'cut' | 'standoff' =
        mode === 'standoff' ? 'standoff' : 'cut';

    const globalLetterThickness = params.letterThicknessMm ?? 5;
    const globalStandoffDistance = params.standoffDistanceMm ?? 25;
    const globalLetterColor = params.letterColor ?? '#1a1f23';

    const effectiveMaterials = useMemo<Effective[]>(() => {
        return placedClipByIndex.map((_, i) => {
            const own = groupByPath.get(i);
            // Nested paths are holes in their ancestor's compound, not
            // their own render. Treat as inherited regardless of any
            // group assignment they happen to carry.
            // Any nested path is a compound-shape hole of its parent,
            // never a separate piece. Same rule SVG already uses with
            // fill-rule="evenodd"; we extend it to ALL material types
            // (cut included) so a letter's counter never gets cut as
            // its own contour in the production PDF.
            if (isNested(i)) return { kind: 'inherited' };
            if (own) {
                if (own.material === 'cut') return { kind: 'cut' };
                if (own.material === 'solid') return { kind: 'solid' };
                if (own.material === 'vinyl')
                    return { kind: 'vinyl', color: own.color };
                if (own.material === 'acrylic')
                    return {
                        kind: 'acrylic',
                        color: own.color,
                        thicknessMm: own.thicknessMm ?? 5,
                    };
                if (own.material === 'standoff')
                    return {
                        kind: 'standoff',
                        color: own.color,
                        thicknessMm: own.thicknessMm ?? globalLetterThickness,
                        standoffDistanceMm:
                            own.standoffDistanceMm ?? globalStandoffDistance,
                    };
                if (own.material === 'pushthrough')
                    return {
                        kind: 'pushthrough',
                        color: own.color,
                        thicknessMm: own.thicknessMm ?? 5,
                        // Per-group offset supersedes the global
                        // keylineMm for paths in this group; the
                        // group's own value falls back to a tidy
                        // 1.5 mm press-fit shoulder if missing.
                        keylineOffsetMm: own.keylineOffsetMm ?? 1.5,
                        protrusionMm: own.protrusionMm ?? 5,
                    };
            }
            // Ungrouped — fall back to the apertureMode default.
            if (defaultUngroupedKind === 'standoff') {
                return {
                    kind: 'standoff',
                    color: globalLetterColor,
                    thicknessMm: globalLetterThickness,
                    standoffDistanceMm: globalStandoffDistance,
                };
            }
            return { kind: 'cut' };
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        placedClipByIndex,
        groupByPath,
        parentByIndex,
        defaultUngroupedKind,
        globalLetterColor,
        globalLetterThickness,
        globalStandoffDistance,
    ]);

    // Build the holes array (placed-and-clipped descendants of `i`) once
    // per path — vinyl, acrylic, and standoff pieces all need this so
    // their compound renders punch through nested counters.
    const holesByIndex = useMemo(() => {
        return placedClipByIndex.map((path, i) => {
            if (!path) return [] as typeof placedClip.paths;
            const out: typeof placedClip.paths = [];
            for (let j = 0; j < placedClipByIndex.length; j++) {
                if (j === i) continue;
                const hp = placedClipByIndex[j];
                if (!hp || !hp.closed) continue;
                if (isDescendantOf(j, i)) out.push(hp);
            }
            return out;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [placedClipByIndex, parentByIndex]);

    // Aperture = paths with effective material 'cut' (own or via default).
    const aperture = useMemo(() => {
        const out: typeof placedClip.paths = [];
        for (let i = 0; i < placedClipByIndex.length; i++) {
            const p = placedClipByIndex[i];
            if (!p) continue;
            if (effectiveMaterials[i]?.kind !== 'cut') continue;
            out.push(p);
        }
        return out;
    }, [placedClipByIndex, effectiveMaterials]);

    // Vinyl / acrylic / solid compound pieces (face-stuck materials).
    // Each top-level piece gathers its descendants as evenodd holes so
    // a letter outline with an inner counter renders as a donut.
    //
    // Solid pieces specifically use the panel colour (or the group's
    // override). They visualise as filled panel-coloured shapes —
    // exactly what makes a floating inner counter of an O / e / g
    // read as a real piece of panel material rather than a cut.
    const materialPieces = useMemo(() => {
        const vinyl: MaterialPiece[] = [];
        const acrylic: MaterialPiece[] = [];
        const solid: MaterialPiece[] = [];
        const panelColor = params.panelColor ?? '#d6d6d6';
        for (let i = 0; i < placedClipByIndex.length; i++) {
            const path = placedClipByIndex[i];
            if (!path) continue;
            const eff = effectiveMaterials[i];
            if (!eff) continue;
            if (eff.kind === 'vinyl') {
                vinyl.push({
                    pathIndex: i,
                    path,
                    holes: holesByIndex[i],
                    color: eff.color,
                });
            } else if (eff.kind === 'acrylic') {
                acrylic.push({
                    pathIndex: i,
                    path,
                    holes: holesByIndex[i],
                    color: eff.color,
                    thicknessMm: eff.thicknessMm,
                });
            } else if (eff.kind === 'solid') {
                // Group's stored colour wins (e.g. user picks a
                // contrast solid). For freshly auto-detected counters
                // the store seeds the colour to the panel colour, so
                // by default solid pieces blend with the panel.
                const groupEntry = groupByPath.get(i);
                solid.push({
                    pathIndex: i,
                    path,
                    holes: holesByIndex[i],
                    color: groupEntry?.color ?? panelColor,
                });
            }
        }
        return { vinyl, acrylic, solid };
    }, [
        placedClipByIndex,
        effectiveMaterials,
        holesByIndex,
        groupByPath,
        params.panelColor,
    ]);

    // Push-through pieces — acrylic letters pressed through panel
    // holes from behind. Each piece carries its own thickness, colour,
    // keyline-offset and protrusion so a sign can mix push-through
    // groups with different press fits. Counter pieces ride along in
    // `holes` so the 3D renderer and PDF can emit them as separate
    // small acrylic pieces (NOT compound-with-hole — production
    // reality is two pieces glued to a backing board).
    const pushThroughPieces = useMemo<PushThroughPiece[]>(() => {
        const out: PushThroughPiece[] = [];
        for (let i = 0; i < placedClipByIndex.length; i++) {
            const path = placedClipByIndex[i];
            if (!path) continue;
            const eff = effectiveMaterials[i];
            if (eff?.kind !== 'pushthrough') continue;
            out.push({
                pathIndex: i,
                path,
                holes: holesByIndex[i],
                color: eff.color,
                thicknessMm: eff.thicknessMm,
                keylineOffsetMm: eff.keylineOffsetMm,
                protrusionMm: eff.protrusionMm,
            });
        }
        return out;
    }, [placedClipByIndex, effectiveMaterials, holesByIndex]);

    // Standoff pieces — extruded 3D letters mounted with studs at
    // standoffDistanceMm. Each piece carries its own settings so a
    // sign can have, say, 5 mm acrylic letters at 25 mm offset AND
    // 10 mm letters at 40 mm offset side-by-side.
    const standoffPieces = useMemo<StandoffPiece[]>(() => {
        const out: StandoffPiece[] = [];
        for (let i = 0; i < placedClipByIndex.length; i++) {
            const path = placedClipByIndex[i];
            if (!path) continue;
            const eff = effectiveMaterials[i];
            if (eff?.kind !== 'standoff') continue;
            out.push({
                pathIndex: i,
                path,
                holes: holesByIndex[i],
                color: eff.color,
                thicknessMm: eff.thicknessMm,
                standoffDistanceMm: eff.standoffDistanceMm,
            });
        }
        return out;
    }, [placedClipByIndex, effectiveMaterials, holesByIndex]);

    // Standoff fixing-hole layout still operates on a flat list of
    // path outlines — preserved for back-compat with the old "all
    // ungrouped paths in standoff mode" workflow. Includes any path
    // whose effective kind is 'standoff' (groups + default-ungrouped).
    const reference = useMemo(() => {
        const out: typeof placedClip.paths = [];
        for (let i = 0; i < placedClipByIndex.length; i++) {
            const p = placedClipByIndex[i];
            if (!p) continue;
            if (effectiveMaterials[i]?.kind !== 'standoff') continue;
            out.push(p);
            // Compound-path counters (the holes inside O / R / e etc.)
            // must travel with the outer outline so the fixing-placement
            // algorithm + insideLettering check see the actual letter
            // material (a donut), not the bounding outline alone. Without
            // these, placeFixings happily drops a stud in the counter
            // region — geometrically inside the outer, but actually
            // outside the letter material.
            for (const h of holesByIndex[i] ?? []) {
                if (h && h.closed) out.push(h);
            }
        }
        return out;
    }, [placedClipByIndex, effectiveMaterials, holesByIndex]);

    const fixingDensity = params.fixingDensity ?? 1;

    // Auto-placed fixings inside the standoff lettering shapes. Driven by
    // the live set of standoff paths (groups + default-standoff), NOT by
    // the quick default — so a sign with default = Cut and one standoff
    // group still gets fixings placed inside that group's letters.
    const autoFixings = useMemo(() => {
        if (!development || reference.length === 0) return [];
        const raw = placeFixings(
            reference,
            fixingDiameter,
            undefined,
            fixingDensity,
        );
        return clipApertureToFace(development, raw).paths;
    }, [development, reference, fixingDiameter, fixingDensity]);

    // Transform between the SVG's own coord frame and the flat-dev
    // frame — manual fixings are stored in the SVG frame so they follow
    // the lettering when alignment / scale / nudge changes.
    const placementXf = useMemo(() => {
        if (!development || !imported) return null;
        return placementTransform(development, imported.bbox, placement);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [development, imported, JSON.stringify(placement)]);

    // Manual fixings — user clicks on the canvases to drop pins exactly
    // where they're needed. Persisted in SVG-local coords so they follow
    // the lettering across placement edits; converted to flat-dev coords
    // for rendering / export. Rendered whenever there's at least one
    // standoff path on the sign (group or default), independent of the
    // quick default mode.
    //
    // Stale-fixings filter: a fixing placed back when a letter was
    // standoff will still be in the store after the letter switches
    // material (push-through, vinyl, etc.). The fixing now belongs to
    // nobody — rendering it leaves a phantom stud floating outside the
    // current standoff lettering. Filter to keep only the fixings whose
    // centre is still inside the current standoff set. The store row
    // stays untouched, so the fixing reappears the moment the letter
    // is regrouped to standoff again.
    const manualFixings = useMemo(() => {
        if (!development || !placementXf || reference.length === 0)
            return [];
        const r = fixingDiameter / 2;
        const isInside = (pt: [number, number]): boolean => {
            let n = 0;
            for (const ref of reference) {
                const ring = ref.points;
                let inside = false;
                for (
                    let i = 0, j = ring.length - 1;
                    i < ring.length;
                    j = i++
                ) {
                    const xi = ring[i][0];
                    const yi = ring[i][1];
                    const xj = ring[j][0];
                    const yj = ring[j][1];
                    if (
                        yi > pt[1] !== yj > pt[1] &&
                        pt[0] <
                            ((xj - xi) * (pt[1] - yi)) / (yj - yi || 1e-12) +
                                xi
                    ) {
                        inside = !inside;
                    }
                }
                if (inside) n++;
            }
            return n % 2 === 1;
        };
        const polys: ReturnType<typeof circlePoly>[] = [];
        for (const p of params.manualFixings ?? []) {
            const flatPt = placementXf.toFlat(p);
            if (!isInside(flatPt)) continue;
            polys.push(circlePoly(flatPt[0], flatPt[1], r));
        }
        return clipApertureToFace(development, polys).paths;
    }, [
        development,
        placementXf,
        reference,
        fixingDiameter,
        params.manualFixings,
    ]);

    const fixings = useMemo(
        () => [...autoFixings, ...manualFixings],
        [autoFixings, manualFixings],
    );

    const cableHoleDiameter = params.cableHoleDiameterMm ?? 10;

    // Cable holes — manually positioned holes cut in the panel face to
    // feed LED cables into illuminated letters. Stored SVG-local so
    // they track the lettering; converted to flat-dev circle polys and
    // clipped to the face for render + export. Available whenever
    // there's artwork (any illuminated-letter type), independent of
    // material — unlike standoff fixings these aren't tied to the
    // reference set, the operator just drops them where the cable runs.
    const cableHoles = useMemo(() => {
        if (!development || !placementXf) return [];
        const r = cableHoleDiameter / 2;
        const polys = (params.cableHoles ?? []).map((p) => {
            const [x, y] = placementXf.toFlat(p);
            return circlePoly(x, y, r);
        });
        return clipApertureToFace(development, polys).paths;
    }, [development, placementXf, cableHoleDiameter, params.cableHoles]);

    // Even-odd inside test across the reference rings — counters of O /
    // A / B correctly exclude. Used by the place handler to reject
    // clicks on the panel background.
    const insideLettering = (p: [number, number]): boolean => {
        let n = 0;
        for (const r of reference) {
            const ring = r.points;
            let inside = false;
            let j = ring.length - 1;
            for (let i = 0; i < ring.length; i++) {
                const xi = ring[i][0];
                const yi = ring[i][1];
                const xj = ring[j][0];
                const yj = ring[j][1];
                if (
                    yi > p[1] !== yj > p[1] &&
                    p[0] <
                        ((xj - xi) * (p[1] - yi)) / (yj - yi || 1e-12) + xi
                ) {
                    inside = !inside;
                }
                j = i;
            }
            if (inside) n++;
        }
        return n % 2 === 1;
    };

    // Single canvas-click dispatcher — routes to whichever placement
    // workflow is active. fixing and cable modes are mutually exclusive
    // (the store enforces it), so at most one branch fires.
    const handleFixingClick = (p: [number, number]) => {
        if (fixingMode === 'place') {
            if (!placementXf) return;
            // Fixings only make sense inside a standoff letter — reject
            // clicks on a sign with no standoff paths AND clicks that
            // land outside every standoff outline.
            if (reference.length === 0) return;
            if (!insideLettering(p)) return;
            addManualFixing(placementXf.toLocal(p));
            return;
        }
        if (fixingMode === 'delete') {
            if (!placementXf) return;
            const stored = params.manualFixings ?? [];
            if (stored.length === 0) return;
            // Forgiveness window: clicking anywhere inside the visible
            // fixing circle deletes it. Slightly larger than the radius
            // so a near-miss still counts.
            const tol = Math.max(fixingDiameter / 2, 6) * 1.4;
            let bestIdx = -1;
            let bestDist = tol;
            for (let i = 0; i < stored.length; i++) {
                const [fx, fy] = placementXf.toFlat(stored[i]);
                const d = Math.hypot(fx - p[0], fy - p[1]);
                if (d < bestDist) {
                    bestDist = d;
                    bestIdx = i;
                }
            }
            if (bestIdx >= 0) removeManualFixing(bestIdx);
            return;
        }
        if (cableMode === 'place') {
            if (!placementXf) return;
            // Cable holes can sit anywhere on the face — no inside-
            // lettering constraint. The canvas already rejects clicks
            // outside the face bounds before reaching here.
            addCableHole(placementXf.toLocal(p));
            return;
        }
        if (cableMode === 'delete') {
            if (!placementXf) return;
            const stored = params.cableHoles ?? [];
            if (stored.length === 0) return;
            const tol = Math.max(cableHoleDiameter / 2, 6) * 1.4;
            let bestIdx = -1;
            let bestDist = tol;
            for (let i = 0; i < stored.length; i++) {
                const [fx, fy] = placementXf.toFlat(stored[i]);
                const d = Math.hypot(fx - p[0], fy - p[1]);
                if (d < bestDist) {
                    bestDist = d;
                    bestIdx = i;
                }
            }
            if (bestIdx >= 0) removeCableHole(bestIdx);
        }
    };

    // Build the keyline from the cut aperture so it tracks the visible
    // artwork, then clip it too. Standoff mode has no keyline.
    const keylineClip = useMemo(() => {
        if (!development || params.keylineMm <= 0 || aperture.length === 0)
            return { paths: [], wasClipped: false, anyOutside: false };
        const raw = buildKeyline(aperture, params.keylineMm);
        return clipApertureToFace(development, raw);
    }, [development, aperture, params.keylineMm]);
    const keyline = keylineClip.paths;

    // Per-pushthrough-path keyline — outward offset of each push-
    // through outer outline using THAT group's keylineOffsetMm. This
    // is what actually becomes the letter-shaped hole in the panel
    // face for press-fit assembly. Built per-piece so different
    // push-through groups can carry different press fits.
    const pushThroughKeyline = useMemo<typeof placedClip.paths>(() => {
        if (!development || pushThroughPieces.length === 0) return [];
        const out: typeof placedClip.paths = [];
        for (const piece of pushThroughPieces) {
            if (piece.keylineOffsetMm <= 0) {
                // Operator zeroed the offset — the press fit is the
                // outline itself. Fine for laser-tight tolerances.
                out.push(piece.path);
                continue;
            }
            const raw = buildKeyline([piece.path], piece.keylineOffsetMm);
            const clipped = clipApertureToFace(development, raw).paths;
            out.push(...clipped);
        }
        return out;
    }, [development, pushThroughPieces]);

    const apertureClipNotice =
        placedClip.anyOutside || keylineClip.anyOutside
            ? 'Some artwork (or its keyline) extended past the face and was clipped at the edge — reposition or reduce the size so every cut stays inside the face.'
            : null;

    const geometryWarning =
        development &&
        development.segments.some((s) => s.wMm <= 0 || s.hMm <= 0)
            ? 'Return depth is smaller than half the material thickness — the flat size goes negative. Increase the return or reduce thickness.'
            : null;


    // Per-section export geometry. Single-panel signs get one section that
    // collapses back to today's behaviour; split signs get N sections laid
    // out side-by-side on the same export sheet, each with only the
    // returns that sit on the outer perimeter of the assembled sign.
    const sectionExport = useMemo(
        () =>
            development ? buildSectionedExport(params, split) : null,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [development, JSON.stringify(params), split],
    );

    const apertureBySection = useMemo(() => {
        if (!development || !sectionExport) return [];
        return sectionExport.sections.map((s) =>
            clipApertureToSection(development, s, aperture),
        );
    }, [development, sectionExport, aperture]);

    const keylineBySection = useMemo(() => {
        if (!development || !sectionExport) return [];
        return sectionExport.sections.map((s) =>
            clipApertureToSection(development, s, keyline),
        );
    }, [development, sectionExport, keyline]);

    // Per-section push-through keylines — these are real panel holes,
    // alongside the aperture cuts. Routed through the same clipper so
    // sections that don't contain a particular letter don't double-
    // up on it.
    const pushThroughKeylineBySection = useMemo(() => {
        if (!development || !sectionExport) return [];
        return sectionExport.sections.map((s) =>
            clipApertureToSection(development, s, pushThroughKeyline),
        );
    }, [development, sectionExport, pushThroughKeyline]);

    const fixingsBySection = useMemo(() => {
        if (!development || !sectionExport) return [];
        return sectionExport.sections.map((s) =>
            clipApertureToSection(development, s, fixings),
        );
    }, [development, sectionExport, fixings]);

    const cableHolesBySection = useMemo(() => {
        if (!development || !sectionExport) return [];
        return sectionExport.sections.map((s) =>
            clipApertureToSection(development, s, cableHoles),
        );
    }, [development, sectionExport, cableHoles]);

    const referenceBySection = useMemo(() => {
        if (!development || !sectionExport) return [];
        return sectionExport.sections.map((s) =>
            clipApertureToSection(development, s, reference),
        );
    }, [development, sectionExport, reference]);

    // Inner counters of aperture letters — the holes inside an R, an
    // O, an A, etc. — collected as a flat list. These are NEVER cut
    // from the panel (no bridges, no mechanical support) but they DO
    // appear on the push-through insert page in keyline mode, where
    // the acrylic insert is a proper compound shape with the counter
    // as a hole through it. Result: the counter on the insert lets
    // panel/lightbox show through, giving the letter its proper
    // optical shape without trying to do the impossible at the cutter.
    const apertureHoles = useMemo(() => {
        const out: typeof placedClip.paths = [];
        for (let i = 0; i < placedClipByIndex.length; i++) {
            if (effectiveMaterials[i]?.kind !== 'cut') continue;
            const holes = holesByIndex[i] ?? [];
            for (const h of holes) {
                if (h && h.closed && h.points.length >= 3) out.push(h);
            }
        }
        return out;
    }, [placedClipByIndex, effectiveMaterials, holesByIndex]);

    const apertureHolesBySection = useMemo(() => {
        if (!development || !sectionExport) return [];
        return sectionExport.sections.map((s) =>
            clipApertureToSection(development, s, apertureHoles),
        );
    }, [development, sectionExport, apertureHoles]);

    // When aperture letters have inner counters (R / O / A / e etc.)
    // AND the operator hasn't enabled a keyline, the counter cannot
    // survive panel-only cutting — no bridges hold it in place, so
    // the counter falls away with the letter-piece as it's cut loose.
    // The honest answer is to either enable a keyline (push-through
    // acrylic insert then carries the counter as a compound hole) or
    // accept that the panel will have a simple letter-shaped hole.
    // This warning surfaces the choice with a one-click "Enable
    // keyline" fix in the canvas overlay.
    const counterSurvivalWarning =
        apertureHoles.length > 0 && params.keylineMm <= 0
            ? `${apertureHoles.length} letter counter${
                  apertureHoles.length === 1 ? '' : 's'
              } detected. They won't survive a panel-only cut — the counter falls out with the letter-piece during fabrication. Enable a keyline to switch to push-through (counters become holes in the acrylic insert).`
            : null;

    const exportWarnings = useMemo(() => {
        if (!development) return [];
        return validateExport({
            params,
            split,
            development,
            aperture,
            fixings,
            apertureClipped:
                placedClip.anyOutside || keylineClip.anyOutside,
        });
    }, [
        development,
        params,
        split,
        aperture,
        fixings,
        placedClip.anyOutside,
        keylineClip.anyOutside,
    ]);

    // Unified path-click dispatcher for the previews. In edit mode a
    // click toggles the path in/out of the working selection; outside
    // edit mode it auto-enters the path's group's edit (or starts a
    // new group with that path selected).
    //
    // Disabled entirely while ANY placement workflow is active (fixings
    // or cable holes) so a click that lands on a letter places the
    // hole/fixing rather than hijacking it into group selection. With
    // this undefined the path hit overlays stop listening, so clicks
    // fall through to the canvas placement handler.
    const handlePathPick =
        fixingMode === 'off' && cableMode === 'off'
            ? (i: number) => {
                  if (isEditingGroup) togglePendingPath(i);
                  else startGroupEditFromPath(i);
              }
            : undefined;

    const handleLoad = async (row: VisualiserDesignRow) => {
        let imp = null;
        if (row.svg_source) {
            try {
                imp = importSvg(row.svg_source);
            } catch {
                imp = null;
            }
        }
        loadDesign(row, imp);
    };

    // Pane visibility classes. On desktop (md+) every pane is always
    // visible at its fixed/flex size; on mobile only one pane shows at a
    // time, switched via the bottom tab bar.
    const paneShow = (pane: MobilePane) =>
        mobilePane === pane
            ? 'flex flex-1 flex-col'
            : 'hidden md:flex md:flex-col';

    return (
        <div className="flex flex-col flex-1 min-h-0 min-w-0 gap-2 md:gap-3">
            {/* Three-column workspace on desktop; single-pane on mobile. */}
            <div className="flex flex-1 min-h-0 min-w-0 flex-col md:flex-row gap-2 md:gap-3">
                {/* Left: controls (Panel + Artwork) — "Settings" on mobile */}
                <aside
                    className={`${paneShow('settings')} md:w-[18rem] md:shrink-0 md:flex-none overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm`}
                >
                <div className="shrink-0 border-b border-neutral-100 px-4 py-2.5">
                    <h2 className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                        Panel
                    </h2>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
                    <ControlsPanel />
                    <div className="my-4 border-t border-neutral-100" />
                    <SvgDropzone />
                </div>
            </aside>

                {/* Centre: preview */}
                <section
                    className={`${paneShow('preview')} min-w-0 min-h-0 md:flex-1 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm`}
                >
                <header className="shrink-0 flex items-center justify-between gap-2 md:gap-3 border-b border-neutral-100 px-2 md:px-3 py-2">
                    <nav className="flex gap-1 min-w-0" role="tablist" aria-label="Preview view">
                        {(['folded', 'unfold', 'flat'] as const).map((t) => {
                            const active = tab === t;
                            return (
                                <button
                                    key={t}
                                    type="button"
                                    role="tab"
                                    aria-selected={active}
                                    onClick={() => setTab(t)}
                                    className={`min-h-[36px] rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                                        active
                                            ? 'text-white shadow-sm'
                                            : 'text-neutral-600 hover:bg-neutral-100'
                                    }`}
                                    style={
                                        active
                                            ? { background: ACCENT }
                                            : undefined
                                    }
                                >
                                    {TAB_LABELS[t]}
                                </button>
                            );
                        })}
                    </nav>
                    <div className="flex items-center gap-2 md:gap-3 min-w-0">
                        {split.wasSplit && (
                            <span className="hidden sm:inline rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">
                                Split · {split.sections.length} panels
                            </span>
                        )}
                        <span className="hidden md:inline truncate text-xs text-neutral-400 max-w-[16rem]">
                            {params.name}
                        </span>
                    </div>
                </header>

                <div className="relative flex-1 min-h-0 min-w-0 bg-neutral-50">
                    {/* Single unified mode pill — top-centre of the
                        canvas. Covers BOTH group-edit and fixing modes
                        so the operator has one consistent place to look
                        for "you are currently doing X" and one Cancel
                        button to exit it. Esc also exits. */}
                    {(isEditingGroup ||
                        fixingMode !== 'off' ||
                        cableMode !== 'off') && (
                        <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-3">
                            <div
                                className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full border bg-white px-3 py-1.5 shadow-md"
                                style={{ borderColor: ACCENT }}
                                role="status"
                                aria-live="polite"
                            >
                                {isEditingGroup ? (
                                    <Layers
                                        size={14}
                                        aria-hidden
                                        style={{ color: ACCENT }}
                                    />
                                ) : (
                                    <Crosshair
                                        size={14}
                                        aria-hidden
                                        style={{
                                            color:
                                                fixingMode === 'delete' ||
                                                cableMode === 'delete'
                                                    ? '#dc2626'
                                                    : ACCENT,
                                        }}
                                    />
                                )}
                                <span className="text-[11px] font-medium text-neutral-700">
                                    {isEditingGroup
                                        ? `Editing material group · ${pendingPaths.length} path${pendingPaths.length === 1 ? '' : 's'} selected · click paths to toggle`
                                        : fixingMode === 'place'
                                          ? 'Placing fixings · click the lettering on either canvas'
                                          : fixingMode === 'delete'
                                            ? 'Deleting fixings · click a manual fixing to remove'
                                            : cableMode === 'place'
                                              ? 'Placing cable holes · click anywhere on the panel face'
                                              : 'Deleting cable holes · click a cable hole to remove'}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (isEditingGroup) cancelGroupEdit();
                                        else if (fixingMode !== 'off')
                                            setFixingMode('off');
                                        else setCableMode('off');
                                    }}
                                    className="ml-1 flex min-h-[28px] items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-600 hover:bg-neutral-200"
                                >
                                    <X size={12} aria-hidden /> Cancel
                                    <span className="ml-1 hidden md:inline rounded bg-white px-1 text-[9px] uppercase tracking-wide text-neutral-400">
                                        Esc
                                    </span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Unified warnings tray — replaces the three
                        separately-floating banners. One row that the
                        operator can fold out. aria-live so a screen
                        reader user gets told when geometry breaks.
                        The counter-survival entry carries an inline
                        "Enable keyline" action that switches the sign
                        to push-through assembly. */}
                    {(geometryWarning ||
                        apertureClipNotice ||
                        counterSurvivalWarning) && (
                        <div className="pointer-events-none absolute inset-x-3 top-14 z-10">
                            <details
                                className="pointer-events-auto group rounded-md border border-amber-300 bg-amber-50/95 shadow-sm"
                                open
                            >
                                <summary
                                    className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-medium text-amber-800 [&::-webkit-details-marker]:hidden"
                                    aria-live="polite"
                                >
                                    <AlertTriangle
                                        size={14}
                                        aria-hidden
                                        className="text-amber-600"
                                    />
                                    <span>
                                        {
                                            [
                                                geometryWarning,
                                                apertureClipNotice,
                                                counterSurvivalWarning,
                                            ].filter(Boolean).length
                                        }{' '}
                                        advisory warning
                                        {[
                                            geometryWarning,
                                            apertureClipNotice,
                                            counterSurvivalWarning,
                                        ].filter(Boolean).length === 1
                                            ? ''
                                            : 's'}
                                    </span>
                                    <ChevronDown
                                        size={14}
                                        aria-hidden
                                        className="ml-auto text-amber-600 transition-transform group-open:rotate-180"
                                    />
                                </summary>
                                <ul className="space-y-1.5 border-t border-amber-200 px-3 py-2 text-[11px] text-amber-800">
                                    {geometryWarning && (
                                        <li>{geometryWarning}</li>
                                    )}
                                    {apertureClipNotice && (
                                        <li>{apertureClipNotice}</li>
                                    )}
                                    {counterSurvivalWarning && (
                                        <li className="flex flex-col gap-1.5">
                                            <span>
                                                {counterSurvivalWarning}
                                            </span>
                                            <div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        // 1.5 mm
                                                        // keyline gives
                                                        // a tidy
                                                        // press-fit
                                                        // shoulder for
                                                        // a typical
                                                        // 3 mm acrylic
                                                        // insert.
                                                        setParam(
                                                            'keylineMm',
                                                            1.5,
                                                        );
                                                    }}
                                                    className="inline-flex min-h-[28px] items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm transition-colors"
                                                    style={{
                                                        background: ACCENT,
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.background =
                                                            ACCENT_DARK;
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.background =
                                                            ACCENT;
                                                    }}
                                                >
                                                    Enable keyline (1.5 mm)
                                                </button>
                                            </div>
                                        </li>
                                    )}
                                </ul>
                            </details>
                        </div>
                    )}

                    {/* Empty-state walkthrough — only shown on the
                        preview tabs when the operator hasn't uploaded
                        artwork yet. The 3D preview still renders the
                        blank panel underneath so they immediately see
                        the geometry their dimensions produce. */}
                    {!imported && (
                        <div className="pointer-events-none absolute inset-x-3 bottom-20 z-10 flex justify-center md:bottom-24">
                            <div className="pointer-events-auto max-w-md rounded-lg border bg-white/95 px-4 py-3 shadow-md backdrop-blur">
                                <h3
                                    className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide"
                                    style={{ color: ACCENT_DARK }}
                                >
                                    <Upload size={12} aria-hidden /> Get
                                    started
                                </h3>
                                <ol className="mt-1.5 space-y-0.5 text-[11px] text-neutral-600 list-decimal pl-4">
                                    <li>Set the panel dimensions on the left</li>
                                    <li>Upload an SVG of your artwork</li>
                                    <li>
                                        Group paths into materials (vinyl,
                                        acrylic, standoff…)
                                    </li>
                                    <li>Export the production PDF</li>
                                </ol>
                            </div>
                        </div>
                    )}

                    {!valid.success ? (
                        <div className="flex h-full items-center justify-center p-6 text-center text-sm text-red-600">
                            {valid.error.issues[0]?.message ??
                                'Invalid parameters'}
                        </div>
                    ) : !development ? null : tab === 'flat' ? (
                        <FlatPreview
                            development={development}
                            split={split}
                            aperture={aperture}
                            keyline={keyline}
                            pushThroughKeyline={pushThroughKeyline}
                            pushThroughPieces={pushThroughPieces}
                            fixings={fixings}
                            reference={reference}
                            vinylPieces={materialPieces.vinyl}
                            acrylicPieces={materialPieces.acrylic}
                            solidPieces={materialPieces.solid}
                            placedPathsByIndex={placedClipByIndex}
                            pathGroupColors={pathGroupColors}
                            pendingPaths={pendingPathsSet}
                            isEditingGroup={isEditingGroup}
                            onPathToggle={handlePathPick}
                            panelColor={params.panelColor ?? '#d6d6d6'}
                            fixingMode={fixingMode}
                            cableMode={cableMode}
                            cableHoles={cableHoles}
                            onFixingClick={handleFixingClick}
                        />
                    ) : (
                        <Scene3D
                            params={params}
                            development={development}
                            split={split}
                            aperture={aperture}
                            keyline={keyline}
                            pushThroughKeyline={pushThroughKeyline}
                            autoFixings={autoFixings}
                            manualFixings={manualFixings}
                            reference={reference}
                            vinylPieces={materialPieces.vinyl}
                            acrylicPieces={materialPieces.acrylic}
                            solidPieces={materialPieces.solid}
                            standoffPieces={standoffPieces}
                            pushThroughPieces={pushThroughPieces}
                            placedPathsByIndex={placedClipByIndex}
                            pathGroupColors={pathGroupColors}
                            pendingPaths={pendingPathsSet}
                            isEditingGroup={isEditingGroup}
                            onPathToggle={handlePathPick}
                            fold={tab === 'folded' ? 1 : fold}
                            fixingMode={fixingMode}
                            cableMode={cableMode}
                            cableHoles={cableHoles}
                            onFixingClick={handleFixingClick}
                            showOutlines={showOutlines}
                            showStandoffLetters={showStandoffLetters}
                            showStandoffLocators={showStandoffLocators}
                        />
                    )}

                    {tab !== 'flat' && (() => {
                        const showLettersToggle =
                            mode === 'standoff' && reference.length > 0;
                        const showLocatorsToggle =
                            mode === 'standoff' && fixings.length > 0;
                        const showOutlinesToggle = true;
                        if (
                            !showLettersToggle &&
                            !showLocatorsToggle &&
                            !showOutlinesToggle
                        )
                            return null;
                        return (
                            <div className="pointer-events-none absolute right-2 md:right-3 bottom-3 md:bottom-4 z-10">
                                <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-neutral-200 bg-white/95 px-1 py-1 shadow backdrop-blur">
                                    {showLettersToggle && (
                                        <ViewToggle
                                            on={showStandoffLetters}
                                            setOn={setShowStandoffLetters}
                                            label="Letters"
                                        />
                                    )}
                                    {showLocatorsToggle && (
                                        <ViewToggle
                                            on={showStandoffLocators}
                                            setOn={setShowStandoffLocators}
                                            label="Locators"
                                        />
                                    )}
                                    {showOutlinesToggle && (
                                        <ViewToggle
                                            on={showOutlines}
                                            setOn={setShowOutlines}
                                            label="Outlines"
                                        />
                                    )}
                                </div>
                            </div>
                        );
                    })()}

                    {tab === 'unfold' && (
                        <div className="pointer-events-none absolute inset-x-2 bottom-3 flex justify-center md:inset-x-0 md:bottom-4">
                            <div className="pointer-events-auto flex max-w-full items-center gap-2 md:gap-3 rounded-full border border-neutral-200 bg-white/95 px-3 md:px-4 py-2 shadow backdrop-blur">
                                <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">
                                    Flat
                                </span>
                                <input
                                    type="range"
                                    min={0}
                                    max={100}
                                    value={Math.round(fold * 100)}
                                    onChange={(e) =>
                                        setFold(Number(e.target.value) / 100)
                                    }
                                    className="h-2 w-32 md:w-48 accent-black"
                                    aria-label="Fold amount"
                                />
                                <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">
                                    Folded
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setUnfoldKey((k) => k + 1)}
                                    className="ml-1 rounded-full bg-black px-3 py-1 text-[11px] font-medium text-white hover:bg-neutral-800"
                                >
                                    Replay
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <footer className="shrink-0 border-t border-neutral-100 px-3 py-2.5">
                    {development && sectionExport && (
                        <ExportBar
                            sectionExport={sectionExport}
                            apertureBySection={apertureBySection}
                            keylineBySection={keylineBySection}
                            pushThroughKeylineBySection={
                                pushThroughKeylineBySection
                            }
                            fixingsBySection={fixingsBySection}
                            cableHolesBySection={cableHolesBySection}
                            apertureHolesBySection={apertureHolesBySection}
                            referenceBySection={referenceBySection}
                            vinylPieces={materialPieces.vinyl}
                            acrylicPieces={materialPieces.acrylic}
                            solidPieces={materialPieces.solid}
                            standoffPieces={standoffPieces}
                            pushThroughPieces={pushThroughPieces}
                            warnings={exportWarnings}
                            pathCount={imported?.paths.length ?? 0}
                        />
                    )}
                </footer>
            </section>

                {/* Right: saved designs (independently scrollable) */}
                <aside
                    className={`${paneShow('designs')} md:w-[15rem] md:shrink-0 md:flex-none overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm`}
                >
                <div className="shrink-0 border-b border-neutral-100 px-4 py-2.5">
                    <h2 className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                        Saved designs
                    </h2>
                </div>
                <ul className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
                    {designs.length === 0 && (
                        <li className="px-2 py-3 text-xs text-neutral-400">
                            No saved designs yet.
                        </li>
                    )}
                    {designs.map((d) => {
                        const active = designId === d.id;
                        return (
                            <li key={d.id}>
                                <button
                                    type="button"
                                    onClick={() => handleLoad(d)}
                                    className={`w-full rounded-md px-2.5 py-2 text-left text-xs transition-colors ${
                                        active
                                            ? 'text-white'
                                            : 'text-neutral-600 hover:bg-neutral-100'
                                    }`}
                                    style={
                                        active ? { background: ACCENT } : undefined
                                    }
                                >
                                    <div className="font-medium truncate">
                                        {d.name}
                                    </div>
                                    <div
                                        className={
                                            active
                                                ? 'text-white/70'
                                                : 'text-neutral-400'
                                        }
                                    >
                                        {d.params_json.panelWidthMm}×
                                        {d.params_json.panelHeightMm}mm
                                    </div>
                                </button>
                            </li>
                        );
                    })}
                </ul>
                </aside>
            </div>

            {/* Mobile tab bar — switches which pane is visible on phones. */}
            <nav className="md:hidden shrink-0 grid grid-cols-3 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
                {(
                    [
                        ['preview', 'Preview', Eye],
                        ['settings', 'Panel', Sliders],
                        ['designs', 'Designs', Bookmark],
                    ] as const
                ).map(([pane, label, Icon]) => {
                    const active = mobilePane === pane;
                    return (
                        <button
                            key={pane}
                            type="button"
                            onClick={() => setMobilePane(pane)}
                            className={`flex min-h-[44px] items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors ${
                                active
                                    ? 'text-white'
                                    : 'text-neutral-500 active:bg-neutral-100'
                            }`}
                            style={
                                active ? { background: ACCENT } : undefined
                            }
                            aria-pressed={active}
                        >
                            <Icon size={14} aria-hidden />
                            {label}
                        </button>
                    );
                })}
            </nav>
        </div>
    );
}
