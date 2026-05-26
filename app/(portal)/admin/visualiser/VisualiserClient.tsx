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

    // Aperture-mode cuts (lettering as holes). Paths with a material
    // override drop out of the cut — they're rendered as vinyl or
    // acrylic instead.
    const aperture = useMemo(() => {
        if (mode !== 'aperture') return [];
        const out: typeof placedClip.paths = [];
        for (let i = 0; i < placedClipByIndex.length; i++) {
            const p = placedClipByIndex[i];
            if (!p) continue;
            if (groupByPath.has(i)) continue; // overridden → not cut
            out.push(p);
        }
        return out;
    }, [mode, placedClipByIndex, groupByPath]);

    // Mixed-material pieces — only meaningful in aperture mode. Each
    // entry pairs a placed+clipped path with the material picked for it.
    // 'solid' paths are excluded from BOTH the cut and the render — they
    // just leave the panel material untouched (used for inner letter
    // counters that the SVG exports as separate closed paths).
    const materialPieces = useMemo(() => {
        if (mode !== 'aperture')
            return { vinyl: [] as MaterialPiece[], acrylic: [] as MaterialPiece[] };
        const vinyl: MaterialPiece[] = [];
        const acrylic: MaterialPiece[] = [];
        for (let i = 0; i < placedClipByIndex.length; i++) {
            const path = placedClipByIndex[i];
            const entry = groupByPath.get(i);
            if (!path || !entry) continue;
            if (entry.material === 'solid') continue; // no render
            const piece: MaterialPiece = {
                pathIndex: i,
                path,
                color: entry.color,
                thicknessMm: entry.thicknessMm,
            };
            if (entry.material === 'vinyl') vinyl.push(piece);
            else if (entry.material === 'acrylic') acrylic.push(piece);
        }
        return { vinyl, acrylic };
    }, [mode, placedClipByIndex, groupByPath]);

    // Standoff-mode features: lettering outline shown as a reference, with
    // fixing holes placed inside each letter shape.
    const reference = useMemo(
        () => (mode === 'standoff' ? placedClip.paths : []),
        [mode, placedClip.paths],
    );

    const fixingDensity = params.fixingDensity ?? 1;

    // Auto-placed fixings inside the lettering shapes (algorithmic). These
    // re-compute when density / diameter / artwork changes.
    const autoFixings = useMemo(() => {
        if (mode !== 'standoff' || !development || placedClip.paths.length === 0)
            return [];
        const raw = placeFixings(
            placedClip.paths,
            fixingDiameter,
            undefined,
            fixingDensity,
        );
        return clipApertureToFace(development, raw).paths;
    }, [mode, development, placedClip.paths, fixingDiameter, fixingDensity]);

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
    // for rendering / export. Each entry retains its store index so the
    // delete handler can target it by index.
    const manualFixings = useMemo(() => {
        if (mode !== 'standoff' || !development || !placementXf) return [];
        const r = fixingDiameter / 2;
        const polys = (params.manualFixings ?? []).map((p) => {
            const [x, y] = placementXf.toFlat(p);
            return circlePoly(x, y, r);
        });
        return clipApertureToFace(development, polys).paths;
    }, [mode, development, placementXf, fixingDiameter, params.manualFixings]);

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
            if (reference.length > 0 && !insideLettering(p)) return;
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
                            {isEditingGroup && tab === 'flat' && (
                                <div className="rounded-md border border-orange-300 bg-orange-50/95 px-3 py-2 text-xs text-orange-900 shadow-sm">
                                    Editing material group — click paths
                                    on the flat preview to add or remove
                                    them from the selection, then pick a
                                    material in the side panel.
                                </div>
                            )}
                            {isEditingGroup && tab !== 'flat' && (
                                <div className="rounded-md border border-orange-300 bg-orange-50/95 px-3 py-2 text-xs text-orange-900 shadow-sm">
                                    Editing material group — switch to
                                    the flat preview to click paths into
                                    the selection.
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
                            placedPathsByIndex={
                                mode === 'aperture'
                                    ? placedClipByIndex
                                    : null
                            }
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
