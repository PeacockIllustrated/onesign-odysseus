'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import {
    AlertTriangle,
    Bookmark,
    ChevronDown,
    ChevronRight,
    Crosshair,
    Eye,
    EyeOff,
    Layers,
    Lightbulb,
    Sliders,
    SlidersHorizontal,
    Upload,
    X,
} from 'lucide-react';
import { useVisualiser } from './store';
import { ControlsPanel } from './ControlsPanel';
import { SvgDropzone } from './SvgDropzone';
import { FlatPreview } from './FlatPreview';
import { ExportBar } from './ExportBar';
import { usePanelDerivation } from './usePanelDerivation';
import { buildDevelopment, validateExport } from '@/lib/visualiser/geometry';
import { splitPanels } from '@/lib/visualiser/split';
import { resolveMount, projectingSpecLine } from '@/lib/visualiser/projecting';
import { importSvg } from '@/lib/visualiser/svg-import';
import { composeLayersSvg } from '@/lib/visualiser/compose';
import {
    PanelParamsSchema,
    GROUP_HIGHLIGHT_PALETTE,
    type VisualiserDesignRow,
    type PanelParams,
    type ExportWarning,
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

/**
 * A single labelled visibility row in the Display panel — a full-width
 * target with the layer name on the left and an eye / eye-off state on
 * the right. Reads top-to-bottom as a layers list, scales past the
 * three-pill cluster the viewport used to carry.
 */
function DisplayRow({
    label,
    on,
    setOn,
}: {
    label: string;
    on: boolean;
    setOn: (v: boolean) => void;
}) {
    return (
        <button
            type="button"
            onClick={() => setOn(!on)}
            aria-pressed={on}
            className="flex min-h-[30px] w-full items-center justify-between gap-3 rounded-md px-2 py-1 text-left transition-colors hover:bg-neutral-100"
        >
            <span
                className={`text-[11px] font-medium ${
                    on ? 'text-neutral-700' : 'text-neutral-400'
                }`}
            >
                {label}
            </span>
            {on ? (
                <Eye size={13} aria-hidden style={{ color: ACCENT }} />
            ) : (
                <EyeOff size={13} aria-hidden className="text-neutral-300" />
            )}
        </button>
    );
}

export function VisualiserClient({
    initialDesigns = [],
    prefill = null,
    initialLoadId = null,
    variant = 'admin',
    publicFooter = null,
}: {
    initialDesigns?: VisualiserDesignRow[];
    prefill?: { patch: Partial<PanelParams> & { quoteId: string | null }; quoteItemId: string } | null;
    /**
     * Design ID from `?id=<...>` in the URL (set by QR codes on the
     * exported PDFs). When set and the id exists in `initialDesigns`,
     * that design is loaded on mount so the operator lands on the
     * exact design the QR refers to.
     */
    initialLoadId?: string | null;
    /**
     * 'admin' (default) is the full staff tool: saved-designs rail + the
     * ExportBar (PDFs / save / backshop). 'public' is the customer-facing
     * /design studio — same engine and capabilities, but the staff rails are
     * hidden and `publicFooter` (the "Send to Onesign" action) replaces the
     * ExportBar. Tour anchors (`data-tour="..."`) are present in both variants;
     * they're inert until the public Tour targets them. (Named `variant` to
     * avoid clashing with the derived aperture `mode` below.)
     */
    variant?: 'admin' | 'public';
    /** Footer rendered in place of the ExportBar when variant === 'public'. */
    publicFooter?: ReactNode;
}) {
    const isPublic = variant === 'public';
    const {
        params,
        svgSource,
        imported: storeImported,
        selectedLayerId,
        selectLayer,
        updateArtworkLayer,
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
        projectingEnabled,
        activeTab,
        inactive,
        mount,
    } = useVisualiser();
    const [tab, setTab] = useState<Tab>('folded');
    const [mobilePane, setMobilePane] = useState<MobilePane>('preview');
    const [designs] = useState(initialDesigns);
    // 1 = folded, 0 = flat. Scrubbed by the unfold slider / replay.
    const [fold, setFold] = useState(1);
    const [unfoldKey, setUnfoldKey] = useState(0);
    // 0 = assembled, 1 = fully exploded. Drives the Z-explode of the layer
    // stack on the folded (3D) tab. Pure view state — never saved.
    const [explodeT, setExplodeT] = useState(0);
    // View-layer toggles. Defaults keep the production-realistic look on
    // first paint; the operator turns layers off for clarity when needed.
    const [showStandoffLetters, setShowStandoffLetters] = useState(true);
    const [showStandoffLocators, setShowStandoffLocators] = useState(true);
    // Fixing-hole positions marked on the panel face (stood-off lettering) —
    // an installer aid, off by default.
    const [showFaceFixings, setShowFaceFixings] = useState(false);
    const [showOutlines, setShowOutlines] = useState(true);
    // Annotation layers — view-only visibility toggles surfaced in the
    // Display panel. Defaults keep every annotation on (the working
    // look); the operator mutes layers for a clean render or to
    // declutter the lit preview.
    const [showGroupColours, setShowGroupColours] = useState(true);
    const [showKeyline, setShowKeyline] = useState(true);
    const [showReference, setShowReference] = useState(true);
    const [showDimensions, setShowDimensions] = useState(false);
    const [displayOpen, setDisplayOpen] = useState(false);
    // Illumination preview — off by default (daylight, no glow). When
    // on, the scene goes dark and any configured illumination
    // (keyline halo, etc.) lights up. Pure view state, not saved.
    const [illuminationView, setIlluminationView] = useState(false);
    // Saved-designs rail collapse (desktop only) — mirrors the portal
    // sidebar so the operator can reclaim canvas width when they're not
    // loading designs. On mobile the rail is a full pane via the tab bar.
    const [designsOpen, setDesignsOpen] = useState(true);
    // Honour the OS "reduce motion" preference — the exploded view snaps
    // straight to its target instead of easing when this is set.
    const [reducedMotion, setReducedMotion] = useState(false);
    useEffect(() => {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        const sync = () => setReducedMotion(mq.matches);
        sync();
        mq.addEventListener('change', sync);
        return () => mq.removeEventListener('change', sync);
    }, []);

    // The exploded view only applies to the assembled (folded) tab; reset it
    // when navigating away so re-entering always starts assembled.
    useEffect(() => {
        if (tab !== 'folded') setExplodeT(0);
    }, [tab]);

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

    // Path-picking works on whichever view the operator is on — we no longer
    // force a hop to the flat tab when group-edit begins (it was disorienting,
    // and 3D path-picking works fine). Material grouping is still easiest on
    // the flat layout, but switching there is now the operator's choice.

    const valid = PanelParamsSchema.safeParse(params);

    // The full pure-geometry pipeline for the panel being edited comes from
    // the SAME hook that derives the projecting sign below — one source of
    // truth for development, placed artwork, material pieces, keyline /
    // push-through, section export and the render bundle / PDF data. The
    // fascia and the projecting blade can no longer silently desync (they
    // ran as two hand-mirrored copies before). Interactive + display-only
    // overlays (selection, group-highlight colours, view-layer toggles,
    // dimension editing) are NOT part of this hook — they layer on top of
    // these pure outputs further down.
    const activeDeriv = usePanelDerivation(params, storeImported, svgSource);
    const {
        development,
        imported,
        isComposite,
        faceRectMm,
        vinylPrintDataUrl,
        placedClip,
        placedClipByIndex,
        groupByPath,
        aperture,
        materialPieces,
        pushThroughPieces,
        standoffPieces,
        backlightPieces,
        extraFacePieces,
        reference,
        autoFixings,
        placementXf,
        manualFixings,
        fixings,
        cableHoles,
        cableHoleDiameter,
        fixingDiameter,
        mode,
        keyline,
        keylineClip,
        pushThroughKeyline,
        pushThroughIslands,
        sectionExport,
        apertureBySection,
        keylineBySection,
        pushThroughKeylineBySection,
        pushThroughIslandsBySection,
        fixingsBySection,
        cableHolesBySection,
        referenceBySection,
        apertureHoles,
        apertureHolesBySection,
    } = activeDeriv;

    // Panel split for the active fascia. Recomputed here (cheap, pure) for
    // the render + validateExport sites that need a non-null PanelSplit —
    // the hook types its own `split` nullable because it also serves the
    // null-params projecting slot. Mirrors how the projecting sign keeps its
    // own `secondarySplit`; both call splitPanels with identical args, so the
    // hook's internal split (used for the export bundle) can't diverge.
    const split = useMemo(
        () =>
            splitPanels(
                params.panelWidthMm,
                undefined,
                params.centrePanelOverrideMm ?? undefined,
            ),
        [params.panelWidthMm, params.centrePanelOverrideMm],
    );

    // Artwork layers stay local — the interactive layer markers + drag
    // handler below read them straight from params (the hook consumes them
    // internally to build `imported`).
    const artworkLayers = params.artworkLayers ?? [];

    // Secondary (the other) panel geometry for the 3D composite. A projecting
    // sign is just a tray — width / height / returns — so we only need its
    // development + split, no artwork pipeline. Rendered perpendicular to the
    // fascia in Scene3D.
    const secondaryParams = projectingEnabled && inactive ? inactive.params : null;
    const secondaryStoreImported =
        projectingEnabled && inactive ? inactive.imported : null;
    // Full geometry pipeline for the OTHER (non-active) panel, run live every
    // render. This is what lets a LOADED design show its projecting sign
    // immediately — its real material-group design + PDF data are derived here
    // rather than only being captured when its tab is first selected. Returns
    // inert (null bundle/pdfData) when there's no projecting sign.
    const secondaryDeriv = usePanelDerivation(
        secondaryParams,
        secondaryStoreImported,
        projectingEnabled && inactive ? inactive.svgSource : null,
    );
    const secondaryDevelopment = useMemo(
        () => (secondaryParams ? buildDevelopment(secondaryParams) : null),
        [secondaryParams],
    );
    const secondarySplit = useMemo(
        () =>
            secondaryParams
                ? splitPanels(
                      secondaryParams.panelWidthMm,
                      undefined,
                      secondaryParams.centrePanelOverrideMm ?? undefined,
                  )
                : null,
        [secondaryParams],
    );
    // The secondary (projecting) sign's design as a composed SVG, so its
    // artwork shows in the composite even while you're editing the main panel.
    const secondaryArtworkSvg = useMemo(() => {
        if (!secondaryParams || !inactive) return null;
        const layers = secondaryParams.artworkLayers ?? [];
        if (layers.length)
            return composeLayersSvg(
                layers,
                secondaryParams.panelWidthMm,
                secondaryParams.panelHeightMm,
            );
        return inactive.svgSource;
    }, [secondaryParams, inactive]);

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

    // Draggable handles for each artwork layer — placed at the layer's
    // centre in flat-development coords so the operator can grab and
    // move a layer directly on the flat preview.
    const layerMarkers = useMemo(() => {
        if (!isComposite || !placementXf) return [];
        return artworkLayers.map((l) => {
            const cx = l.xMm + (l.wMm * l.scale) / 2;
            const cy = l.yMm + (l.hMm * l.scale) / 2;
            const [xDev, yDev] = placementXf.toFlat([cx, cy]);
            return {
                id: l.id,
                label: l.label ?? 'Layer',
                xDev,
                yDev,
                selected: l.id === selectedLayerId,
            };
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isComposite, placementXf, JSON.stringify(artworkLayers), selectedLayerId]);

    // Drop a layer so its centre lands at a flat-dev point (drag target).
    const handleLayerMoveTo = (id: string, devPoint: [number, number]) => {
        if (!placementXf) return;
        const layer = artworkLayers.find((l) => l.id === id);
        if (!layer) return;
        const [fx, fy] = placementXf.toLocal(devPoint);
        updateArtworkLayer(id, {
            xMm: fx - (layer.wMm * layer.scale) / 2,
            yMm: fy - (layer.hMm * layer.scale) / 2,
        });
    };

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

    // The full-design bundle for the OTHER sign (the one not being edited),
    // derived live (see secondaryDeriv) so it's present immediately on load —
    // no need to select its tab first to populate a cache.
    const secondaryBundle = projectingEnabled ? secondaryDeriv.bundle : null;

    const geometryWarning =
        development &&
        development.segments.some((s) => s.wMm <= 0 || s.hMm <= 0)
            ? 'Return depth is smaller than half the material thickness — the flat size goes negative. Increase the return or reduce thickness.'
            : null;

    // The full PDF export data for the OTHER sign (derived live, see
    // secondaryDeriv) + a one-line summary of the projecting sign (used on the
    // reference overview). The active panel's own export builds straight from
    // the activeDeriv section data passed to ExportBar.
    const mainIsActive = activeTab === 'main';
    const companionPdf = projectingEnabled ? secondaryDeriv.pdfData : null;
    const projectingParams = mainIsActive ? secondaryParams : params;
    const projectingSummary =
        projectingEnabled && projectingParams
            ? `${projectingSpecLine(projectingParams, mount)} · mounted ${Math.round(
                  resolveMount(mount).offsetXMm,
              )}mm across, ${Math.round(resolveMount(mount).offsetYMm)}mm down`
            : null;

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

    // Single advisory list feeding BOTH the canvas tray and the export
    // ready-checklist, so the two can never disagree on the count.
    // Order = severity-ish: geometry (blocks a sane flat) → export
    // checks (clip / material / fold / seam from validateExport) →
    // counter-survival (carries the inline "Enable keyline" fix).
    const advisories = useMemo<ExportWarning[]>(() => {
        const out: ExportWarning[] = [];
        if (geometryWarning)
            out.push({ kind: 'geometry', message: geometryWarning });
        if (development) {
            out.push(
                ...validateExport({
                    params,
                    split,
                    development,
                    aperture,
                    fixings,
                    apertureClipped:
                        placedClip.anyOutside || keylineClip.anyOutside,
                }),
            );
        }
        if (counterSurvivalWarning)
            out.push({
                kind: 'counter_survival',
                message: counterSurvivalWarning,
            });
        return out;
    }, [
        geometryWarning,
        development,
        params,
        split,
        aperture,
        fixings,
        placedClip.anyOutside,
        keylineClip.anyOutside,
        counterSurvivalWarning,
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

    // Edits from the in-scene dimension widgets propagate straight to
    // the panel params — change the width label, the panel resizes;
    // edit the single Return value, every return depth follows;
    // adding a shadow gap brings the lips into being.
    const handleDimensionChange = (
        field: 'width' | 'height' | 'return' | 'shadowGap',
        valueMm: number,
    ) => {
        if (!Number.isFinite(valueMm) || valueMm < 0) return;
        if (field === 'width' && valueMm > 0)
            setParam('panelWidthMm', valueMm);
        else if (field === 'height' && valueMm > 0)
            setParam('panelHeightMm', valueMm);
        else if (field === 'return') setParam('returnDepthMm', valueMm);
        else if (field === 'shadowGap') setParam('shadowGapMm', valueMm);
    };

    // Lit-view support. The "Lit" toggle only darkens the scene; the
    // halo itself is the keyline emissive, which is off by default
    // (designs ship un-illuminated). Without this, clicking Lit on a
    // fresh design shows a near-black panel that reads as broken — so
    // when the lit view is active and no glow is on we surface a
    // one-click enable (mirroring the counter-survival fix idiom).
    const keylineGlowOn = !!params.illumination?.keyline?.enabled;
    const hasPushThrough = pushThroughPieces.length > 0;
    const enableKeylineGlow = () => {
        const kl = params.illumination?.keyline ?? {
            enabled: false,
            color: '#ffffff',
            intensity: 1,
        };
        setParam('illumination', {
            ...params.illumination,
            keyline: { ...kl, enabled: true },
        });
    };

    // Annotation gating — the Display panel toggles these view layers.
    // Muting a layer just stops passing its data to the previews; the
    // underlying geometry / export is untouched (these are view-only).
    const dispGroupColors = showGroupColours ? pathGroupColors : null;
    const dispKeyline = showKeyline ? keyline : [];
    const dispReference = showReference ? reference : [];
    // Which Display rows are relevant in the current tab. Outlines +
    // stand-off layers only mean something in 3D; group colours,
    // keyline, reference + dimensions apply to both 3D and flat.
    const standoffPresent = mode === 'standoff' || standoffPieces.length > 0;

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
                    data-tour="controls"
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
                    <div data-tour="upload">
                        <SvgDropzone />
                    </div>
                </div>
            </aside>

                {/* Centre: preview */}
                <section
                    className={`${paneShow('preview')} min-w-0 min-h-0 md:flex-1 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm`}
                >
                <header className="shrink-0 flex items-center justify-between gap-2 md:gap-3 border-b border-neutral-100 px-2 md:px-3 py-2">
                    <nav data-tour="views" className="flex gap-1 min-w-0" role="tablist" aria-label="Preview view">
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
                        {/* Illumination preview switch — darkens the
                            scene and lights up any configured
                            illumination. 3D tabs only (a 2D technical
                            drawing has no lighting to show). */}
                        {tab !== 'flat' && (
                            <button
                                type="button"
                                data-tour="illumination"
                                onClick={() =>
                                    setIlluminationView((v) => !v)
                                }
                                aria-pressed={illuminationView}
                                title="Toggle the lit / dark preview"
                                className={`flex min-h-[32px] items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                    illuminationView
                                        ? 'text-white shadow-sm'
                                        : 'border border-neutral-300 text-neutral-600 hover:bg-neutral-100'
                                }`}
                                style={
                                    illuminationView
                                        ? { background: '#1a1f23' }
                                        : undefined
                                }
                            >
                                <Lightbulb
                                    size={13}
                                    aria-hidden
                                    style={{
                                        color: illuminationView
                                            ? '#fde68a'
                                            : undefined,
                                    }}
                                />
                                <span className="hidden sm:inline">
                                    {illuminationView
                                        ? 'Lit'
                                        : 'Illumination'}
                                </span>
                            </button>
                        )}
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
                    {advisories.length > 0 && (
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
                                        {advisories.length} advisory warning
                                        {advisories.length === 1 ? '' : 's'}
                                    </span>
                                    <ChevronDown
                                        size={14}
                                        aria-hidden
                                        className="ml-auto text-amber-600 transition-transform group-open:rotate-180"
                                    />
                                </summary>
                                <ul className="space-y-1.5 border-t border-amber-200 px-3 py-2 text-[11px] text-amber-800">
                                    {advisories.map((w, i) => (
                                        <li
                                            key={i}
                                            className="flex flex-col gap-1.5"
                                        >
                                            <span>{w.message}</span>
                                            {w.kind === 'counter_survival' && (
                                                <div>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            // 1.5 mm keyline
                                                            // gives a tidy
                                                            // press-fit
                                                            // shoulder for a
                                                            // typical 3 mm
                                                            // acrylic insert.
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
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </details>
                        </div>
                    )}

                    {/* Lit-view nudge — the dark scene with no glow on
                        reads as broken, so explain it and offer the
                        one-click enable (or point at what's missing
                        when there's nothing to light yet). Suppressed when
                        backlit apertures are present — those glow on their
                        own, so the scene isn't actually dark. */}
                    {illuminationView &&
                        tab !== 'flat' &&
                        !keylineGlowOn &&
                        backlightPieces.length === 0 && (
                            <div className="pointer-events-none absolute inset-x-3 top-1/2 z-10 flex -translate-y-1/2 justify-center">
                                <div className="pointer-events-auto max-w-xs rounded-lg border border-white/15 bg-[#1a1f23]/90 px-4 py-3 text-center shadow-lg backdrop-blur">
                                    <p className="flex items-center justify-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                                        <Lightbulb size={12} aria-hidden /> Lit
                                        preview
                                    </p>
                                    {hasPushThrough ? (
                                        <>
                                            <p className="mt-1 text-[11px] text-neutral-300">
                                                No illumination is switched on
                                                yet, so the scene stays dark.
                                            </p>
                                            <button
                                                type="button"
                                                onClick={enableKeylineGlow}
                                                className="mt-2 inline-flex min-h-[32px] items-center gap-1 rounded-md px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition-colors"
                                                style={{ background: ACCENT }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.background =
                                                        ACCENT_DARK;
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.background =
                                                        ACCENT;
                                                }}
                                            >
                                                <Lightbulb
                                                    size={12}
                                                    aria-hidden
                                                />
                                                Enable keyline glow
                                            </button>
                                        </>
                                    ) : (
                                        <p className="mt-1 text-[11px] text-neutral-300">
                                            Nothing to light yet — add a
                                            push-through group under Path
                                            materials, then switch the keyline
                                            halo on here.
                                        </p>
                                    )}
                                </div>
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
                                    <li>
                                        {isPublic
                                            ? 'Send it to our team for a quote'
                                            : 'Export the production PDF'}
                                    </li>
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
                            keyline={dispKeyline}
                            pushThroughKeyline={pushThroughKeyline}
                            pushThroughIslands={pushThroughIslands}
                            pushThroughPieces={pushThroughPieces}
                            fixings={fixings}
                            reference={dispReference}
                            vinylPieces={materialPieces.vinyl}
                            acrylicPieces={materialPieces.acrylic}
                            solidPieces={materialPieces.solid}
                            backlightPieces={backlightPieces}
                            vinylPrintDataUrl={vinylPrintDataUrl}
                            placedPathsByIndex={placedClipByIndex}
                            pathGroupColors={dispGroupColors}
                            pendingPaths={pendingPathsSet}
                            isEditingGroup={isEditingGroup}
                            onPathToggle={handlePathPick}
                            panelColor={params.panelColor ?? '#d6d6d6'}
                            fixingMode={fixingMode}
                            cableMode={cableMode}
                            cableHoles={cableHoles}
                            onFixingClick={handleFixingClick}
                            layerMarkers={layerMarkers}
                            onLayerSelect={selectLayer}
                            onLayerMoveTo={handleLayerMoveTo}
                        />
                    ) : (
                        <Scene3D
                            params={params}
                            development={development}
                            split={split}
                            aperture={aperture}
                            keyline={dispKeyline}
                            pushThroughKeyline={pushThroughKeyline}
                            pushThroughIslands={pushThroughIslands}
                            autoFixings={autoFixings}
                            manualFixings={manualFixings}
                            reference={dispReference}
                            vinylPieces={materialPieces.vinyl}
                            acrylicPieces={materialPieces.acrylic}
                            solidPieces={materialPieces.solid}
                            standoffPieces={standoffPieces}
                            pushThroughPieces={pushThroughPieces}
                            backlightPieces={backlightPieces}
                            vinylPrintDataUrl={vinylPrintDataUrl}
                            placedPathsByIndex={placedClipByIndex}
                            pathGroupColors={dispGroupColors}
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
                            showFaceFixings={showFaceFixings}
                            illuminationView={illuminationView}
                            illumination={params.illumination}
                            showDimensions={showDimensions}
                            onDimensionChange={handleDimensionChange}
                            secondaryPanel={
                                secondaryParams &&
                                secondaryDevelopment &&
                                secondarySplit
                                    ? {
                                          params: secondaryParams,
                                          development: secondaryDevelopment,
                                          split: secondarySplit,
                                          artworkSvg: secondaryArtworkSvg,
                                          bundle: secondaryBundle,
                                          // active tab 'main' ⇒ the stashed
                                          // panel is the projecting sign.
                                          isBlade: activeTab === 'main',
                                      }
                                    : null
                            }
                            mount={resolveMount(mount)}
                            explodeT={tab === 'folded' ? explodeT : 0}
                            reducedMotion={reducedMotion}
                        />
                    )}

                    {/* Display panel — the single home for "what's shown
                        in the viewport". Collapses to one button so it
                        never competes with the sign; expands to a layers
                        list. Available on every preview tab; rows that
                        only mean something in 3D (outlines, stand-off)
                        are hidden on the flat tab. */}
                    {development && (
                        <div
                            data-tour="display"
                            className="pointer-events-none absolute right-2 md:right-3 bottom-3 md:bottom-4 z-10 flex max-w-[12rem] flex-col items-end gap-2"
                        >
                            {displayOpen && (
                                <div className="pointer-events-auto w-44 rounded-lg border border-neutral-200 bg-white/95 p-2 shadow-lg backdrop-blur">
                                    <div className="flex items-center justify-between px-1 pb-1">
                                        <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                                            Display
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setDisplayOpen(false)
                                            }
                                            aria-label="Collapse display options"
                                            className="flex min-h-[24px] min-w-[24px] items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                                        >
                                            <ChevronDown
                                                size={14}
                                                aria-hidden
                                            />
                                        </button>
                                    </div>
                                    <div className="space-y-0.5">
                                        {tab !== 'flat' && (
                                            <DisplayRow
                                                label="Outlines"
                                                on={showOutlines}
                                                setOn={setShowOutlines}
                                            />
                                        )}
                                        <DisplayRow
                                            label="Group colours"
                                            on={showGroupColours}
                                            setOn={setShowGroupColours}
                                        />
                                        <DisplayRow
                                            label="Keyline lines"
                                            on={showKeyline}
                                            setOn={setShowKeyline}
                                        />
                                        <DisplayRow
                                            label="Reference"
                                            on={showReference}
                                            setOn={setShowReference}
                                        />
                                        {tab !== 'flat' && (
                                            <DisplayRow
                                                label="Dimensions"
                                                on={showDimensions}
                                                setOn={setShowDimensions}
                                            />
                                        )}
                                    </div>
                                    {tab !== 'flat' && standoffPresent && (
                                        <>
                                            <div className="my-1 border-t border-neutral-100" />
                                            <span className="block px-1 pb-0.5 text-[9px] font-semibold uppercase tracking-wide text-neutral-400">
                                                Stand-off
                                            </span>
                                            <div className="space-y-0.5">
                                                <DisplayRow
                                                    label="Letters"
                                                    on={showStandoffLetters}
                                                    setOn={
                                                        setShowStandoffLetters
                                                    }
                                                />
                                                <DisplayRow
                                                    label="Fixings"
                                                    on={showStandoffLocators}
                                                    setOn={
                                                        setShowStandoffLocators
                                                    }
                                                />
                                                <DisplayRow
                                                    label="Marks on face"
                                                    on={showFaceFixings}
                                                    setOn={setShowFaceFixings}
                                                />
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={() => setDisplayOpen((o) => !o)}
                                aria-pressed={displayOpen}
                                aria-label="Display options"
                                title="Show / hide viewport layers"
                                className={`pointer-events-auto flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium shadow backdrop-blur transition-colors ${
                                    displayOpen
                                        ? 'border-transparent text-white'
                                        : 'border-neutral-200 bg-white/95 text-neutral-600 hover:bg-neutral-100'
                                }`}
                                style={
                                    displayOpen
                                        ? { background: ACCENT }
                                        : undefined
                                }
                            >
                                <SlidersHorizontal
                                    size={14}
                                    aria-hidden
                                    style={
                                        displayOpen
                                            ? undefined
                                            : { color: ACCENT }
                                    }
                                />
                                <span className="hidden sm:inline">
                                    Display
                                </span>
                            </button>
                        </div>
                    )}

                    {tab === 'folded' && (
                        <div className="pointer-events-none absolute inset-x-2 bottom-3 flex justify-center md:inset-x-0 md:bottom-4">
                            <div className="pointer-events-auto flex max-w-full items-center gap-2 md:gap-3 rounded-full border border-neutral-200 bg-white/95 px-3 md:px-4 py-2 shadow backdrop-blur">
                                <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">
                                    Assembled
                                </span>
                                <input
                                    type="range"
                                    min={0}
                                    max={100}
                                    value={Math.round(explodeT * 100)}
                                    onChange={(e) =>
                                        setExplodeT(
                                            Number(e.target.value) / 100,
                                        )
                                    }
                                    className="h-2 w-32 md:w-48"
                                    style={{ accentColor: ACCENT }}
                                    aria-label="Explode amount"
                                />
                                <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">
                                    Exploded
                                </span>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setExplodeT((v) => (v > 0.5 ? 0 : 1))
                                    }
                                    className="ml-1 rounded-full px-3 py-1 text-[11px] font-medium text-white"
                                    style={{ background: ACCENT }}
                                >
                                    {explodeT > 0.5 ? 'Collapse' : 'Explode'}
                                </button>
                            </div>
                        </div>
                    )}

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
                                    className="ml-1 rounded-full bg-[var(--accent)] px-3 py-1 text-[11px] font-medium text-white hover:bg-[var(--accent-hover)]"
                                >
                                    Replay
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <footer
                    data-tour="send"
                    className="shrink-0 border-t border-neutral-100 px-3 py-2.5"
                >
                    {isPublic ? (
                        publicFooter
                    ) : development && sectionExport ? (
                        <ExportBar
                            sectionExport={sectionExport}
                            apertureBySection={apertureBySection}
                            keylineBySection={keylineBySection}
                            pushThroughKeylineBySection={
                                pushThroughKeylineBySection
                            }
                            pushThroughIslandsBySection={
                                pushThroughIslandsBySection
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
                            backlightPieces={backlightPieces}
                            extraFacePieces={extraFacePieces}
                            vinylPrintDataUrl={vinylPrintDataUrl}
                            faceRectMm={faceRectMm}
                            warnings={advisories}
                            pathCount={imported?.paths.length ?? 0}
                            companionPdf={companionPdf}
                            mainIsActive={mainIsActive}
                            projectingSummary={projectingSummary}
                        />
                    ) : null}
                </footer>
            </section>

                {/* Right: saved designs (independently scrollable;
                    collapsible to a thin rail on desktop). Staff-only — the
                    public studio has no saved-designs library. */}
                {!isPublic && (
                <aside
                    className={`${paneShow('designs')} ${
                        designsOpen ? 'md:w-[15rem]' : 'md:w-11'
                    } md:shrink-0 md:flex-none overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm transition-[width] duration-200`}
                >
                {/* Collapsed desktop rail — a single button to reopen. */}
                {!designsOpen && (
                    <button
                        type="button"
                        onClick={() => setDesignsOpen(true)}
                        title="Show saved designs"
                        aria-label="Show saved designs"
                        className="hidden md:flex h-full w-full flex-col items-center gap-2 py-3 text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700"
                    >
                        <Bookmark size={16} aria-hidden />
                        <span
                            className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400"
                            style={{ writingMode: 'vertical-rl' }}
                        >
                            Saved designs
                        </span>
                        {designs.length > 0 && (
                            <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-neutral-500">
                                {designs.length}
                            </span>
                        )}
                    </button>
                )}
                <div
                    className={`${
                        designsOpen ? 'flex flex-col' : 'flex md:hidden flex-col'
                    } h-full min-h-0`}
                >
                <div className="shrink-0 flex items-center justify-between gap-1 border-b border-neutral-100 px-3 py-2.5">
                    <h2 className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                        Saved designs
                    </h2>
                    <button
                        type="button"
                        onClick={() => setDesignsOpen(false)}
                        title="Collapse saved designs"
                        aria-label="Collapse saved designs"
                        className="hidden md:flex min-h-[24px] min-w-[24px] items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                    >
                        <ChevronRight size={14} aria-hidden />
                    </button>
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
                </div>
                </aside>
                )}
            </div>

            {/* Mobile tab bar — switches which pane is visible on phones. The
                designs pane is staff-only, so the public studio shows two. */}
            <nav
                className={`md:hidden shrink-0 grid ${
                    isPublic ? 'grid-cols-2' : 'grid-cols-3'
                } overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm`}
            >
                {(
                    [
                        ['preview', 'Preview', Eye],
                        ['settings', 'Panel', Sliders],
                        ['designs', 'Designs', Bookmark],
                    ] as const
                )
                    .filter(([pane]) => !isPublic || pane !== 'designs')
                    .map(([pane, label, Icon]) => {
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
