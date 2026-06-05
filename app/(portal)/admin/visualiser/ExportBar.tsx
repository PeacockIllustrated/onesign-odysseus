'use client';

import { useEffect, useState, useTransition } from 'react';
import {
    AlertTriangle,
    Check,
    CheckCircle2,
    FileText,
    Loader2,
    Save,
    Scissors,
    Tv,
} from 'lucide-react';
import { useVisualiser, splitPanels } from './store';
import { sceneCapture } from './Scene3D';
import {
    generateReferencePdfBlob,
    generateProductionPdfBlob,
    pdfFilename,
    type PdfOptions,
} from '@/lib/visualiser/pdf';
import { saveDesign } from '@/lib/visualiser/actions';
import { addToBackshop, isDesignOnBackshop } from '@/lib/backshop/actions';
import { projectingSpecLine } from '@/lib/visualiser/projecting';
import { composeLayersSvg } from '@/lib/visualiser/compose';
import { trimImageDataUrl } from '@/lib/visualiser/image';
import {
    PanelParamsSchema,
    type PanelParams,
    type PanelPdfData,
    type FlatPath,
    type SectionedExport,
    type ExportWarning,
    type MaterialPiece,
    type StandoffPiece,
    type PushThroughPiece,
} from '@/lib/visualiser/types';

const ACCENT = '#4e7e8c';
const ACCENT_DARK = '#3a5f6a';

function download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

/** Blob → bare base64 (no data-URL prefix) for sending to a server action. */
function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const res = (reader.result as string) ?? '';
            const comma = res.indexOf(',');
            resolve(comma >= 0 ? res.slice(comma + 1) : res);
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

/**
 * Finished-state checklist — one-glance "am I ready to export?".
 * Reads the param-level validity, the path count, and any warnings to
 * tell the operator what's done and what they should double-check
 * before sending the PDF to the cutter.
 */
function ReadyChecklist({
    geometryOk,
    pathCount,
    warningCount,
}: {
    geometryOk: boolean;
    pathCount: number;
    warningCount: number;
}) {
    const items: Array<{ ok: boolean; warn?: boolean; label: string }> = [
        {
            ok: geometryOk,
            label: geometryOk
                ? 'Geometry valid'
                : 'Geometry invalid — check dimensions',
        },
        {
            ok: pathCount > 0,
            label:
                pathCount > 0
                    ? `${pathCount} artwork path${pathCount === 1 ? '' : 's'} assigned`
                    : 'No artwork uploaded yet',
        },
        {
            ok: warningCount === 0,
            warn: warningCount > 0,
            label:
                warningCount === 0
                    ? 'No advisory warnings'
                    : `${warningCount} advisory warning${warningCount === 1 ? '' : 's'} — review before export`,
        },
    ];
    return (
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-600">
            {items.map((it, i) => {
                const Icon = it.ok
                    ? CheckCircle2
                    : it.warn
                      ? AlertTriangle
                      : AlertTriangle;
                const color = it.ok
                    ? 'text-emerald-600'
                    : it.warn
                      ? 'text-amber-600'
                      : 'text-neutral-400';
                return (
                    <li key={i} className="flex items-center gap-1">
                        <Icon size={12} className={color} aria-hidden />
                        <span>{it.label}</span>
                    </li>
                );
            })}
        </ul>
    );
}

export function ExportBar({
    sectionExport,
    apertureBySection,
    keylineBySection,
    pushThroughKeylineBySection,
    pushThroughIslandsBySection,
    fixingsBySection,
    cableHolesBySection,
    referenceBySection,
    apertureHolesBySection,
    vinylPieces,
    acrylicPieces,
    solidPieces,
    standoffPieces,
    pushThroughPieces,
    backlightPieces,
    vinylPrintDataUrl = null,
    faceRectMm = null,
    warnings = [],
    pathCount = 0,
    companionPdf = null,
    mainIsActive = true,
    projectingSummary = null,
}: {
    sectionExport: SectionedExport;
    apertureBySection: FlatPath[][];
    keylineBySection: FlatPath[][];
    pushThroughKeylineBySection: FlatPath[][];
    pushThroughIslandsBySection: FlatPath[][];
    fixingsBySection: FlatPath[][];
    cableHolesBySection: FlatPath[][];
    referenceBySection: FlatPath[][];
    apertureHolesBySection: FlatPath[][];
    vinylPieces: MaterialPiece[];
    acrylicPieces: MaterialPiece[];
    solidPieces: MaterialPiece[];
    standoffPieces: StandoffPiece[];
    pushThroughPieces: PushThroughPiece[];
    /** Backlit apertures — for the opal-backing + LED pages in the PDFs. */
    backlightPieces: MaterialPiece[];
    /** Full-colour vinyl print PNG (face-sized, masked) + the face rect it
     *  maps onto — for the print-&-cut PDF pages. */
    vinylPrintDataUrl?: string | null;
    faceRectMm?: { x: number; y: number; w: number; h: number } | null;
    warnings?: ExportWarning[];
    /** Total imported artwork paths (used for the ready checklist). */
    pathCount?: number;
    /** The OTHER sign's cached PDF data, for a two-item (fascia+projecting) job. */
    companionPdf?: PanelPdfData | null;
    /** True when the active/primary panel is the main fascia. */
    mainIsActive?: boolean;
    /** One-line projecting-sign + mount summary for the reference overview. */
    projectingSummary?: string | null;
}) {
    const {
        params,
        svgSource,
        imported,
        designId,
        quoteId,
        quoteItemId,
        dirty,
        markSaved,
        activeTab,
        projectingEnabled,
        inactive,
        mount,
    } = useVisualiser();

    // Flatten a panel's artwork layers into a single aperture SVG, falling
    // back to its raw uploaded SVG when there are no layers.
    const flattenSvg = (
        p: { artworkLayers?: PanelParams['artworkLayers']; panelWidthMm: number; panelHeightMm: number },
        raw: string | null,
    ): string | null => {
        const layers = p.artworkLayers ?? [];
        return layers.length
            ? composeLayersSvg(layers, p.panelWidthMm, p.panelHeightMm)
            : raw;
    };

    /**
     * Assemble the full design for persistence regardless of which tab is
     * live: the main panel is the row's params (with the projecting blade
     * nested inside projectingSign), the blade carries its own flattened svg.
     */
    const assembleMain = (): { params: PanelParams; svgSource: string | null } => {
        const { main, projecting } = splitPanels({
            activeTab,
            projectingEnabled,
            params,
            svgSource,
            imported,
            inactive,
        });
        const mainSvg = flattenSvg(main.params, main.svgSource);
        let projectingSign: PanelParams['projectingSign'];
        if (projecting) {
            const bladeCore = { ...projecting.params };
            delete (bladeCore as { projectingSign?: unknown }).projectingSign;
            projectingSign = {
                panel: bladeCore,
                mount,
                svgSource: flattenSvg(projecting.params, projecting.svgSource),
            };
        }
        return {
            params: { ...main.params, projectingSign },
            svgSource: mainSvg,
        };
    };

    // Two-item PDF fields. When the design has a projecting sign, both PDFs
    // cover BOTH items: every page is labelled with the item name and the
    // OTHER sign rides along as `secondary`. The projecting-sign + mount
    // summary (companionNote) sits on the FASCIA's overview.
    const twoItem: Partial<PdfOptions> = companionPdf
        ? {
              itemLabel: mainIsActive ? 'Main fascia' : 'Projecting sign',
              companionNote: mainIsActive
                  ? (projectingSummary ?? undefined)
                  : undefined,
              secondary: {
                  ...companionPdf,
                  itemLabel: mainIsActive ? 'Projecting sign' : 'Main fascia',
                  companionNote: mainIsActive
                      ? undefined
                      : (projectingSummary ?? undefined),
              },
          }
        : {};

    const [savePending, startSaveTransition] = useTransition();
    const [pdfPending, setPdfPending] = useState<'prod' | 'ref' | null>(null);
    const [backshopPending, setBackshopPending] = useState(false);
    const [onBackshop, setOnBackshop] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [exported, setExported] = useState<string | null>(null);

    // Is the current design already on the board? Drives the Add / Update
    // label. Re-checked whenever the loaded design changes.
    useEffect(() => {
        let cancelled = false;
        if (!designId) {
            setOnBackshop(false);
            return;
        }
        isDesignOnBackshop(designId).then((on) => {
            if (!cancelled) setOnBackshop(on);
        });
        return () => {
            cancelled = true;
        };
    }, [designId]);

    const valid = PanelParamsSchema.safeParse(params);

    // Clear the "exported" success chip after a few seconds so it
    // doesn't linger across the operator's next action.
    useEffect(() => {
        if (!exported) return;
        const id = setTimeout(() => setExported(null), 4500);
        return () => clearTimeout(id);
    }, [exported]);

    const onReferencePdf = async () => {
        if (pdfPending) return;
        setPdfPending('ref');
        try {
            const thumb = sceneCapture.fn?.() ?? undefined;
            const blob = await generateReferencePdfBlob({
                sectionExport,
                params,
                designId: designId ?? null,
                apertureBySection,
                keylineBySection,
                pushThroughKeylineBySection,
                pushThroughIslandsBySection,
                fixingsBySection,
                cableHolesBySection,
                referenceBySection,
                vinylPieces,
                acrylicPieces,
                solidPieces,
                standoffPieces,
                pushThroughPieces,
                backlightPieces,
                vinylPrintDataUrl,
                faceRectMm,
                thumbnailDataUrl: thumb || undefined,
                ...twoItem,
            });
            const fname = pdfFilename(params, 'reference');
            download(blob, fname);
            setExported(`Reference PDF · ${fname}`);
        } finally {
            setPdfPending(null);
        }
    };

    // Push this design onto the workshop TV board. We're the only place the
    // reference-PDF geometry + 3D thumbnail exist, so capture both here and
    // ship them to the server with the design id. Saves first if needed
    // (the board snapshots a saved design).
    const onAddToBackshop = async () => {
        if (backshopPending) return;
        setBackshopPending(true);
        setMsg(null);
        try {
            // 1. Ensure the design is saved — we need a concrete id, and the
            //    QR on the stored PDF should point at a real design.
            let id = designId;
            if (!id || dirty) {
                const assembled = assembleMain();
                const saved = await saveDesign({
                    id: designId ?? undefined,
                    params: assembled.params,
                    svgSource: assembled.svgSource,
                    quoteId,
                    quoteItemId,
                });
                if (!saved.ok) {
                    setMsg(saved.error);
                    return;
                }
                id = saved.data.id;
                markSaved(saved.data.id);
            }

            // 2. Thumbnails + reference PDF (same opts as the Reference PDF
            //    button), base64-encoded for the server action. The PDF keeps
            //    the angled orbit shot; the board uses a straight-on face shot
            //    trimmed to the sign, so it crops to a clean wide rectangle
            //    that fills its banner instead of floating in empty space.
            const thumb = sceneCapture.fn?.() ?? undefined;
            const faceThumb = sceneCapture.faceOn?.() ?? thumb;
            const boardThumb = faceThumb
                ? await trimImageDataUrl(faceThumb)
                : undefined;
            const blob = await generateReferencePdfBlob({
                sectionExport,
                params,
                designId: id,
                apertureBySection,
                keylineBySection,
                pushThroughKeylineBySection,
                pushThroughIslandsBySection,
                fixingsBySection,
                cableHolesBySection,
                referenceBySection,
                vinylPieces,
                acrylicPieces,
                solidPieces,
                standoffPieces,
                pushThroughPieces,
                backlightPieces,
                vinylPrintDataUrl,
                faceRectMm,
                thumbnailDataUrl: thumb || undefined,
            });
            const pdfBase64 = await blobToBase64(blob);

            // Each panel pushes as its own board item (separate sheets per
            // panel). When the active panel is the projecting blade, surface
            // its spec on the Build column + add the contextual Wall-fixing
            // (bracket) stage.
            const bladeActive = projectingEnabled && activeTab === 'projecting';
            const projDesc = bladeActive
                ? projectingSpecLine(params, mount)
                : null;
            const description =
                [projDesc, params.materialLabel || null]
                    .filter(Boolean)
                    .join(' — ') || null;

            const res = await addToBackshop({
                designId: id,
                name: params.name,
                description,
                widthMm: params.panelWidthMm,
                heightMm: params.panelHeightMm,
                returnsMm: params.returnDepthMm,
                shadowGapMm: params.shadowGapMm,
                thumbnailDataUrl: boardThumb ?? null,
                pdfBase64,
                // Contextual production stages follow the construction.
                features: {
                    pushThrough: pushThroughPieces.length > 0,
                    vinyl: vinylPieces.length > 0,
                    acrylic: acrylicPieces.length > 0,
                    standoff: standoffPieces.length > 0,
                    illumination:
                        !!params.illumination?.keyline?.enabled ||
                        backlightPieces.length > 0,
                    bracket: bladeActive,
                },
            });
            if (res.ok) {
                setExported(
                    onBackshop
                        ? 'Updated backshop screen'
                        : 'Added to backshop screen',
                );
                setOnBackshop(true);
            } else setMsg(res.error);
        } catch {
            setMsg('Could not add to the backshop screen.');
        } finally {
            setBackshopPending(false);
        }
    };

    const onProductionPdf = async () => {
        if (pdfPending) return;
        setPdfPending('prod');
        try {
            // Production PDF is a multi-page CAM bundle: panel cut +
            // push-through inserts (when keyline) + a 1:1 cut page per
            // material (acrylic / vinyl / standoff) + a final 1:1
            // placement template for the backshop. Pass everything;
            // each helper inside the generator no-ops when its data
            // is empty.
            const blob = await generateProductionPdfBlob({
                sectionExport,
                params,
                designId: designId ?? null,
                apertureBySection,
                keylineBySection,
                pushThroughKeylineBySection,
                pushThroughIslandsBySection,
                fixingsBySection,
                cableHolesBySection,
                referenceBySection,
                apertureHolesBySection,
                vinylPieces,
                acrylicPieces,
                solidPieces,
                standoffPieces,
                pushThroughPieces,
                backlightPieces,
                vinylPrintDataUrl,
                faceRectMm,
                ...twoItem,
            });
            const fname = pdfFilename(params, 'production');
            download(blob, fname);
            setExported(`Production PDF · ${fname}`);
        } finally {
            setPdfPending(null);
        }
    };

    const onSave = () => {
        setMsg(null);
        // Persist the full design: the main panel as the row params (with the
        // projecting blade nested inside), each panel carrying a flattened
        // composite SVG so any consumer that only reads svg_source still
        // renders. Works from either tab.
        const assembled = assembleMain();
        startSaveTransition(async () => {
            const res = await saveDesign({
                id: designId ?? undefined,
                params: assembled.params,
                svgSource: assembled.svgSource,
                quoteId,
                quoteItemId,
            });
            if (res.ok) {
                markSaved(res.data.id);
                setMsg('Saved');
            } else {
                setMsg(res.error);
            }
        });
    };

    const advisoryWarnings = warnings.length;
    const geometryOk = valid.success;

    return (
        <div className="space-y-2.5">
            <ReadyChecklist
                geometryOk={geometryOk}
                pathCount={pathCount}
                warningCount={advisoryWarnings}
            />
            {warnings.length > 0 && (
                <ul
                    className="space-y-1 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2"
                    aria-live="polite"
                >
                    {warnings.map((w, i) => (
                        <li
                            key={i}
                            className="flex items-start gap-1.5 text-[11px] text-amber-800"
                        >
                            <AlertTriangle
                                size={11}
                                className="mt-0.5 shrink-0 text-amber-600"
                                aria-hidden
                            />
                            <span>{w.message}</span>
                        </li>
                    ))}
                </ul>
            )}
            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={onProductionPdf}
                    disabled={!valid.success || !!pdfPending}
                    aria-busy={pdfPending === 'prod'}
                    title="Cut-only PDF — welded perimeters, hairline stroke, sized to the part. Drop into the cutter."
                    className="flex min-h-[44px] items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    style={{
                        background: pdfPending === 'prod' ? ACCENT_DARK : ACCENT,
                    }}
                    onMouseEnter={(e) => {
                        if (!e.currentTarget.disabled)
                            e.currentTarget.style.background = ACCENT_DARK;
                    }}
                    onMouseLeave={(e) => {
                        if (pdfPending !== 'prod')
                            e.currentTarget.style.background = ACCENT;
                    }}
                >
                    {pdfPending === 'prod' ? (
                        <Loader2
                            size={16}
                            className="animate-spin"
                            aria-hidden
                        />
                    ) : (
                        <Scissors size={16} aria-hidden />
                    )}
                    {pdfPending === 'prod'
                        ? 'Building production PDF…'
                        : 'Export production PDF'}
                </button>
                <button
                    type="button"
                    onClick={onReferencePdf}
                    disabled={!valid.success || !!pdfPending}
                    aria-busy={pdfPending === 'ref'}
                    title="Dimensioned shop drawing — spec, legend, fold lines, dimensions. For printing / reference."
                    className="flex min-h-[36px] items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {pdfPending === 'ref' ? (
                        <Loader2
                            size={14}
                            className="animate-spin"
                            aria-hidden
                        />
                    ) : (
                        <FileText size={14} aria-hidden />
                    )}
                    Reference PDF
                </button>
                <button
                    type="button"
                    onClick={onSave}
                    disabled={savePending || !valid.success}
                    aria-busy={savePending}
                    className="flex min-h-[36px] items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {savePending ? (
                        <Loader2
                            size={14}
                            className="animate-spin"
                            aria-hidden
                        />
                    ) : (
                        <Save size={14} aria-hidden />
                    )}
                    {savePending
                        ? 'Saving…'
                        : designId
                          ? 'Update design'
                          : 'Save design'}
                    {dirty && !savePending && (
                        <span
                            className="ml-0.5 h-1.5 w-1.5 rounded-full bg-amber-500"
                            aria-label="Unsaved changes"
                        />
                    )}
                </button>
                <button
                    type="button"
                    onClick={onAddToBackshop}
                    disabled={!valid.success || backshopPending}
                    aria-busy={backshopPending}
                    title="Send this design to the workshop TV board (saves first, with its reference PDF + preview)."
                    className="flex min-h-[36px] items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {backshopPending ? (
                        <Loader2
                            size={14}
                            className="animate-spin"
                            aria-hidden
                        />
                    ) : (
                        <Tv size={14} aria-hidden />
                    )}
                    {backshopPending
                        ? onBackshop
                            ? 'Updating…'
                            : 'Sending…'
                        : onBackshop
                          ? 'Update backshop screen'
                          : 'Add to backshop screen'}
                </button>
                <div className="ml-auto flex items-center gap-2 text-xs text-neutral-500">
                    {exported && (
                        <span
                            role="status"
                            className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200"
                        >
                            <Check size={11} aria-hidden /> {exported}
                        </span>
                    )}
                    {msg && <span>{msg}</span>}
                </div>
                {!valid.success && (
                    <span className="basis-full text-xs text-red-600">
                        {valid.error.issues[0]?.message}
                    </span>
                )}
            </div>
        </div>
    );
}
