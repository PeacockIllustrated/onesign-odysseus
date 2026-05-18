'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useVisualiser } from './store';
import { ControlsPanel } from './ControlsPanel';
import { SvgDropzone } from './SvgDropzone';
import { FlatPreview } from './FlatPreview';
import { ExportBar } from './ExportBar';
import { buildDevelopment, placeAperture } from '@/lib/visualiser/geometry';
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

type Tab = '3d' | 'flat';

export function VisualiserClient({
    initialDesigns,
    prefill,
}: {
    initialDesigns: VisualiserDesignRow[];
    prefill: { patch: Partial<PanelParams> & { quoteId: string | null }; quoteItemId: string } | null;
}) {
    const { params, imported, applyPrefill, loadDesign, designId } =
        useVisualiser();
    const [tab, setTab] = useState<Tab>('3d');
    const [designs] = useState(initialDesigns);

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

    const aperture = useMemo(() => {
        if (!development || !imported) return [];
        return placeAperture(development, imported.paths, imported.bbox, placement);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [development, imported, JSON.stringify(placement)]);

    const keyline = useMemo(() => {
        if (params.keylineMm <= 0 || aperture.length === 0) return [];
        return buildKeyline(aperture, params.keylineMm);
    }, [aperture, params.keylineMm]);

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
        <div className="flex flex-1 gap-4 min-h-0">
            {/* Left: controls */}
            <div className="w-72 shrink-0 overflow-y-auto rounded-lg border border-neutral-200 bg-white p-4">
                <ControlsPanel />
                <div className="my-4 border-t border-neutral-100" />
                <SvgDropzone />
            </div>

            {/* Centre: preview */}
            <div className="flex min-w-0 flex-1 flex-col rounded-lg border border-neutral-200 bg-white overflow-hidden">
                <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2">
                    <div className="flex gap-1">
                        {(['3d', 'flat'] as const).map((t) => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => setTab(t)}
                                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                                    tab === t
                                        ? 'bg-black text-white'
                                        : 'text-neutral-500 hover:bg-neutral-100'
                                }`}
                            >
                                {t === '3d' ? '3D folded' : 'Flat development'}
                            </button>
                        ))}
                    </div>
                    {split.wasSplit && (
                        <span className="text-xs font-medium text-green-700">
                            Split into {split.sections.length} panels (centre
                            full)
                        </span>
                    )}
                </div>

                <div className="relative flex-1 min-h-0">
                    {!valid.success ? (
                        <div className="flex h-full items-center justify-center p-6 text-center text-sm text-red-600">
                            {valid.error.issues[0]?.message ??
                                'Invalid parameters'}
                        </div>
                    ) : !development ? null : tab === '3d' ? (
                        <Scene3D
                            params={params}
                            development={development}
                            split={split}
                            aperture={aperture}
                            keyline={keyline}
                        />
                    ) : (
                        <FlatPreview
                            development={development}
                            split={split}
                            aperture={aperture}
                            keyline={keyline}
                        />
                    )}
                    {geometryWarning && (
                        <div className="absolute inset-x-3 bottom-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                            {geometryWarning}
                        </div>
                    )}
                </div>

                <div className="border-t border-neutral-100 px-3 py-2.5">
                    {development && (
                        <ExportBar
                            development={development}
                            split={split}
                            aperture={aperture}
                            keyline={keyline}
                        />
                    )}
                </div>
            </div>

            {/* Right: saved designs */}
            <div className="w-60 shrink-0 overflow-y-auto rounded-lg border border-neutral-200 bg-white p-4">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Saved designs
                </h2>
                <ul className="mt-3 space-y-1">
                    {designs.length === 0 && (
                        <li className="text-xs text-neutral-400">
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
            </div>
        </div>
    );
}
