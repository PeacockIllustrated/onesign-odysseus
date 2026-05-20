'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useVisualiser } from './store';
import { ControlsPanel } from './ControlsPanel';
import { SvgDropzone } from './SvgDropzone';
import { FlatPreview } from './FlatPreview';
import { ExportBar } from './ExportBar';
import {
    buildDevelopment,
    placeAperture,
    clipApertureToFace,
    placeFixings,
} from '@/lib/visualiser/geometry';
import { splitPanels } from '@/lib/visualiser/split';
import { importSvg, buildKeyline } from '@/lib/visualiser/svg-import';
import {
    PanelParamsSchema,
    DEFAULT_PLACEMENT,
    type VisualiserDesignRow,
    type PanelParams,
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

export function VisualiserClient({
    initialDesigns,
    prefill,
}: {
    initialDesigns: VisualiserDesignRow[];
    prefill: { patch: Partial<PanelParams> & { quoteId: string | null }; quoteItemId: string } | null;
}) {
    const { params, imported, applyPrefill, loadDesign, designId } =
        useVisualiser();
    const [tab, setTab] = useState<Tab>('folded');
    const [designs] = useState(initialDesigns);
    // 1 = folded, 0 = flat. Scrubbed by the unfold slider / replay.
    const [fold, setFold] = useState(1);
    const [unfoldKey, setUnfoldKey] = useState(0);

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
        () => splitPanels(params.panelWidthMm),
        [params.panelWidthMm],
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

    const mode = params.apertureMode ?? 'aperture';
    // Diameter is the source of truth; fall back to legacy radius * 2 for
    // designs saved before the units change.
    const fixingDiameter =
        params.fixingDiameterMm ??
        (params.fixingRadiusMm ? params.fixingRadiusMm * 2 : 10);

    // Aperture-mode cuts (lettering as holes).
    const aperture = useMemo(
        () => (mode === 'aperture' ? placedClip.paths : []),
        [mode, placedClip.paths],
    );

    // Standoff-mode features: lettering outline shown as a reference, with
    // fixing holes placed inside each letter shape.
    const reference = useMemo(
        () => (mode === 'standoff' ? placedClip.paths : []),
        [mode, placedClip.paths],
    );

    const fixingDensity = params.fixingDensity ?? 1;
    const fixings = useMemo(() => {
        if (mode !== 'standoff' || !development || placedClip.paths.length === 0)
            return [];
        const raw = placeFixings(
            placedClip.paths,
            fixingDiameter,
            undefined,
            fixingDensity,
        );
        // Clip — a fixing on the edge of a letter sitting near the face
        // border could otherwise stick out past the face.
        return clipApertureToFace(development, raw).paths;
    }, [mode, development, placedClip.paths, fixingDiameter, fixingDensity]);

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

    return (
        // Three-column workspace. Outer is the page's flex-1 slot, so it
        // takes the height the page reserves. min-h-0 / min-w-0 are the
        // magic words that let the inner flex children scroll instead of
        // pushing the layout off-screen.
        <div className="flex flex-1 min-h-0 min-w-0 gap-3">
            {/* Left: controls (independently scrollable) */}
            <aside className="flex w-[18rem] shrink-0 flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
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
            <section className="flex min-w-0 min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
                <header className="shrink-0 flex items-center justify-between gap-3 border-b border-neutral-100 px-3 py-2">
                    <nav className="flex gap-1">
                        {(['folded', 'unfold', 'flat'] as const).map((t) => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => setTab(t)}
                                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                                    tab === t
                                        ? 'bg-black text-white'
                                        : 'text-neutral-500 hover:bg-neutral-100'
                                }`}
                            >
                                {TAB_LABELS[t]}
                            </button>
                        ))}
                    </nav>
                    <div className="flex items-center gap-3 min-w-0">
                        {split.wasSplit && (
                            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">
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
                    {(geometryWarning || apertureClipNotice) && (
                        <div className="pointer-events-none absolute inset-x-3 top-3 z-10 space-y-2">
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
                        />
                    ) : (
                        <Scene3D
                            params={params}
                            development={development}
                            split={split}
                            aperture={aperture}
                            keyline={keyline}
                            fixings={fixings}
                            reference={reference}
                            fold={tab === 'folded' ? 1 : fold}
                        />
                    )}

                    {tab === 'unfold' && (
                        <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
                            <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-neutral-200 bg-white/95 px-4 py-2 shadow backdrop-blur">
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
                                    className="h-1 w-48 accent-black"
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
                    {development && (
                        <ExportBar
                            development={development}
                            split={split}
                            aperture={aperture}
                            keyline={keyline}
                            fixings={fixings}
                            reference={reference}
                        />
                    )}
                </footer>
            </section>

            {/* Right: saved designs (independently scrollable) */}
            <aside className="flex w-[15rem] shrink-0 flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
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
    );
}
