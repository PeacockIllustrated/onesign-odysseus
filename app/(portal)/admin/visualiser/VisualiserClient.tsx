'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Eye, EyeOff, Sliders, Bookmark } from 'lucide-react';
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
} from '@/lib/visualiser/types';

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
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                on
                    ? 'bg-black text-white'
                    : 'text-neutral-500 hover:bg-neutral-100'
            }`}
        >
            <Icon size={12} />
            {label}
        </button>
    );
}

export function VisualiserClient({
    initialDesigns,
    prefill,
}: {
    initialDesigns: VisualiserDesignRow[];
    prefill: { patch: Partial<PanelParams> & { quoteId: string | null }; quoteItemId: string } | null;
}) {
    const {
        params,
        imported,
        applyPrefill,
        loadDesign,
        designId,
        fixingMode,
        addManualFixing,
        removeManualFixing,
        editingGroupId,
        pendingPaths,
        togglePendingPath,
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
    // Checks whether the path at `i` is nested inside any vinyl/acrylic
    // ancestor — those paths are owned by the ancestor's compound and
    // must not double-render as their own face cut.
    const nestedInsideMaterial = (i: number): boolean => {
        let cursor = parentByIndex[i];
        let depth = 0;
        while (cursor !== null && depth < 256) {
            const m = groupByPath.get(cursor)?.material;
            if (m === 'vinyl' || m === 'acrylic') return true;
            cursor = parentByIndex[cursor];
            depth++;
        }
        return false;
    };

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
            if (own && nestedInsideMaterial(i)) return { kind: 'inherited' };
            if (!own && nestedInsideMaterial(i)) return { kind: 'inherited' };
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

    // Vinyl + acrylic compound pieces (face-stuck materials). Each
    // top-level piece gathers its descendants as evenodd holes so a
    // letter outline with an inner counter renders as a donut.
    const materialPieces = useMemo(() => {
        const vinyl: MaterialPiece[] = [];
        const acrylic: MaterialPiece[] = [];
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
            }
        }
        return { vinyl, acrylic };
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
        }
        return out;
    }, [placedClipByIndex, effectiveMaterials]);

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
    const manualFixings = useMemo(() => {
        if (!development || !placementXf || reference.length === 0)
            return [];
        const r = fixingDiameter / 2;
        const polys = (params.manualFixings ?? []).map((p) => {
            const [x, y] = placementXf.toFlat(p);
            return circlePoly(x, y, r);
        });
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

    const fixingsBySection = useMemo(() => {
        if (!development || !sectionExport) return [];
        return sectionExport.sections.map((s) =>
            clipApertureToSection(development, s, fixings),
        );
    }, [development, sectionExport, fixings]);

    const referenceBySection = useMemo(() => {
        if (!development || !sectionExport) return [];
        return sectionExport.sections.map((s) =>
            clipApertureToSection(development, s, reference),
        );
    }, [development, sectionExport, reference]);

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
                <header className="shrink-0 flex items-center justify-between gap-2 md:gap-3 border-b border-neutral-100 px-2 md:px-3 py-1.5 md:py-2">
                    <nav className="flex gap-1 min-w-0">
                        {(['folded', 'unfold', 'flat'] as const).map((t) => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => setTab(t)}
                                className={`rounded-md px-2 md:px-3 py-1.5 text-[11px] md:text-xs font-medium transition-colors ${
                                    tab === t
                                        ? 'bg-black text-white'
                                        : 'text-neutral-500 hover:bg-neutral-100'
                                }`}
                            >
                                {TAB_LABELS[t]}
                            </button>
                        ))}
                    </nav>
                    <div className="flex items-center gap-2 md:gap-3 min-w-0">
                        {split.wasSplit && (
                            <span className="hidden sm:inline rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">
                                Split · {split.sections.length} panels (centre
                                full)
                            </span>
                        )}
                        <span className="hidden md:inline truncate text-xs text-neutral-400 max-w-[16rem]">
                            {params.name}
                        </span>
                    </div>
                </header>

                <div className="relative flex-1 min-h-0 min-w-0 bg-neutral-50">
                    {(geometryWarning || apertureClipNotice || isEditingGroup) && (
                        <div className="pointer-events-none absolute inset-x-3 top-3 z-10 space-y-2">
                            {isEditingGroup && (
                                <div className="rounded-md border border-orange-300 bg-orange-50/95 px-3 py-2 text-xs text-orange-900 shadow-sm">
                                    Editing material group — click paths
                                    on the canvas to add or remove them
                                    from the selection, then pick a
                                    material in the side panel.
                                </div>
                            )}
                            {geometryWarning && (
                                <div className="rounded-md border border-amber-300 bg-amber-50/95 px-3 py-2 text-xs text-amber-700 shadow-sm">
                                    {geometryWarning}
                                </div>
                            )}
                            {apertureClipNotice && (
                                <div className="rounded-md border border-amber-300 bg-amber-50/95 px-3 py-2 text-xs text-amber-700 shadow-sm">
                                    {apertureClipNotice}
                                </div>
                            )}
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
                            fixings={fixings}
                            reference={reference}
                            vinylPieces={materialPieces.vinyl}
                            acrylicPieces={materialPieces.acrylic}
                            placedPathsByIndex={placedClipByIndex}
                            pathGroupColors={pathGroupColors}
                            pendingPaths={pendingPathsSet}
                            isEditingGroup={isEditingGroup}
                            onPathToggle={
                                isEditingGroup ? togglePendingPath : undefined
                            }
                            panelColor={params.panelColor ?? '#d6d6d6'}
                            fixingMode={fixingMode}
                            onFixingClick={handleFixingClick}
                        />
                    ) : (
                        <Scene3D
                            params={params}
                            development={development}
                            split={split}
                            aperture={aperture}
                            keyline={keyline}
                            autoFixings={autoFixings}
                            manualFixings={manualFixings}
                            reference={reference}
                            vinylPieces={materialPieces.vinyl}
                            acrylicPieces={materialPieces.acrylic}
                            standoffPieces={standoffPieces}
                            placedPathsByIndex={placedClipByIndex}
                            pathGroupColors={pathGroupColors}
                            pendingPaths={pendingPathsSet}
                            isEditingGroup={isEditingGroup}
                            onPathToggle={
                                isEditingGroup ? togglePendingPath : undefined
                            }
                            fold={tab === 'folded' ? 1 : fold}
                            fixingMode={fixingMode}
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
                            fixingsBySection={fixingsBySection}
                            referenceBySection={referenceBySection}
                            warnings={exportWarnings}
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
                    {designs.map((d) => (
                        <li key={d.id}>
                            <button
                                type="button"
                                onClick={() => handleLoad(d)}
                                className={`w-full rounded-md px-2.5 py-2 text-left text-xs transition-colors ${
                                    designId === d.id
                                        ? 'bg-black text-white'
                                        : 'text-neutral-600 hover:bg-neutral-100'
                                }`}
                            >
                                <div className="font-medium truncate">
                                    {d.name}
                                </div>
                                <div
                                    className={
                                        designId === d.id
                                            ? 'text-neutral-300'
                                            : 'text-neutral-400'
                                    }
                                >
                                    {d.params_json.panelWidthMm}×
                                    {d.params_json.panelHeightMm}mm
                                </div>
                            </button>
                        </li>
                    ))}
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
                            className={`flex items-center justify-center gap-1.5 py-3 text-[11px] font-medium transition-colors ${
                                active
                                    ? 'bg-black text-white'
                                    : 'text-neutral-500 active:bg-neutral-100'
                            }`}
                            aria-pressed={active}
                        >
                            <Icon size={14} />
                            {label}
                        </button>
                    );
                })}
            </nav>
        </div>
    );
}
