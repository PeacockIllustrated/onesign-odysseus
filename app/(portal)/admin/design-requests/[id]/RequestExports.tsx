'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, FileText, Loader2, Scissors } from 'lucide-react';
import { Card } from '@/app/(portal)/components/ui';
import { usePanelDerivation } from '@/app/(portal)/admin/visualiser/usePanelDerivation';
import { importSvg } from '@/lib/visualiser/svg-import';
import {
    generateReferencePdfBlob,
    generateProductionPdfBlob,
    pdfFilename,
    type PdfOptions,
} from '@/lib/visualiser/pdf';
import {
    buildDesignPackInput,
    appendProjectingSign,
    type DesignPackPieceData,
} from '@/lib/production-packs/design-pack-input';
import { buildPackFromDesignPieces } from '@/lib/production-packs/from-design';
import { createProductionPackFromContent } from '@/lib/production-packs/actions';
import { projectingSpecLine } from '@/lib/visualiser/projecting';
import type { PanelParams, ImportedSvg } from '@/lib/visualiser/types';

type PanelDerivation = ReturnType<typeof usePanelDerivation>;

const ACCENT = '#4e7e8c';

function download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

/** Parse a flattened SVG to indexed paths; null on bad/empty input. */
function safeImport(svg: string | null): ImportedSvg | null {
    if (!svg) return null;
    try {
        return importSvg(svg);
    } catch {
        return null;
    }
}

export interface RequestExportsProps {
    params: PanelParams;
    svgSource: string | null;
    /** Face-on PNG preview (data URL) captured at submit — used as the pack
     *  overview hero in place of a live 3D capture. */
    thumbnail: string | null;
    designId: string | null;
    reference: string;
}

/**
 * Production exports for a submitted customer design, right on the inbox detail
 * page. It re-derives the stored design with the SAME pipeline the visualiser
 * runs (`usePanelDerivation` over the saved params + flattened SVG), then offers
 * the shop-ready PDFs and a one-click works pack — no need to open the full 3D
 * tool first. The derivation + PDF/canvas code is browser-only, so the deriving
 * inner component is mounted client-side only (skeleton during SSR).
 */
export function RequestExports(props: RequestExportsProps) {
    // Client-only mount gate: the derivation + PDF/canvas code is browser-only,
    // so we render a skeleton on the server and the deriving inner component
    // only after hydration (this is the intended setState-in-effect use —
    // synchronising "we're now on the client").
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMounted(true);
    }, []);
    if (!mounted) {
        return (
            <Card className="p-4">
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-widest text-neutral-500">
                    Production files
                </h3>
                <p className="text-[12px] text-neutral-400">
                    Preparing exports…
                </p>
            </Card>
        );
    }
    return <RequestExportsInner {...props} />;
}

function RequestExportsInner({
    params,
    svgSource,
    thumbnail,
    designId,
    reference,
}: RequestExportsProps) {
    const router = useRouter();

    const imported = useMemo<ImportedSvg | null>(
        () => safeImport(svgSource),
        [svgSource],
    );
    const d = usePanelDerivation(params, imported, svgSource);

    // Projecting (blade) sign, when the design carries one — a second physical
    // sign that ships its own cut files + pack sections alongside the fascia.
    // The headline use of the public builder is an aperture fascia + a
    // projecting sign together, so fulfilment has to cover both. Derived live;
    // inert (null) when there's no projecting sign.
    const projecting = params.projectingSign ?? null;
    const projParams = projecting?.panel ?? null;
    const projSvg = projecting?.svgSource ?? null;
    const projImported = useMemo<ImportedSvg | null>(
        () => safeImport(projSvg),
        [projSvg],
    );
    const pd = usePanelDerivation(projParams, projImported, projSvg);
    const hasProjecting = !!projParams && !!pd.sectionExport;

    const [busy, setBusy] = useState<'ref' | 'prod' | 'pack' | null>(null);
    const [error, setError] = useState<string | null>(null);

    const ready = !!d.sectionExport;
    const hasArtwork =
        (params.artworkLayers?.length ?? 0) > 0 ||
        (imported?.paths.length ?? 0) > 0;

    // PDF option block for a derivation — the same per-section cut arrays +
    // material pieces the visualiser feeds its generators. Used for the fascia
    // and (as `secondary`) the projecting sign.
    const pdfOptionsFor = (
        deriv: PanelDerivation,
        p: PanelParams,
    ): PdfOptions => ({
        sectionExport: deriv.sectionExport!,
        params: p,
        designId: designId ?? null,
        apertureBySection: deriv.apertureBySection,
        keylineBySection: deriv.keylineBySection,
        pushThroughKeylineBySection: deriv.pushThroughKeylineBySection,
        pushThroughIslandsBySection: deriv.pushThroughIslandsBySection,
        fixingsBySection: deriv.fixingsBySection,
        cableHolesBySection: deriv.cableHolesBySection,
        referenceBySection: deriv.referenceBySection,
        apertureHolesBySection: deriv.apertureHolesBySection,
        vinylPieces: deriv.materialPieces.vinyl,
        acrylicPieces: deriv.materialPieces.acrylic,
        solidPieces: deriv.materialPieces.solid,
        standoffPieces: deriv.standoffPieces,
        pushThroughPieces: deriv.pushThroughPieces,
        backlightPieces: deriv.backlightPieces,
        vinylPrintDataUrl: deriv.vinylPrintDataUrl,
        faceRectMm: deriv.faceRectMm,
    });

    // Two-item fields when there's a projecting sign: both signs land in one
    // PDF, each page labelled, the projecting sign riding along as `secondary`.
    const twoItem = (): Partial<PdfOptions> =>
        hasProjecting && projParams && projecting
            ? {
                  itemLabel: 'Main fascia',
                  companionNote: projectingSpecLine(
                      projParams,
                      projecting.mount,
                  ),
                  secondary: {
                      ...pdfOptionsFor(pd, projParams),
                      itemLabel: 'Projecting sign',
                  },
              }
            : {};

    const pieceDataFor = (
        deriv: PanelDerivation,
        p: PanelParams,
    ): DesignPackPieceData => ({
        params: p,
        sectionExport: deriv.sectionExport!,
        apertureBySection: deriv.apertureBySection,
        apertureHolesBySection: deriv.apertureHolesBySection,
        pushThroughKeylineBySection: deriv.pushThroughKeylineBySection,
        pushThroughIslandsBySection: deriv.pushThroughIslandsBySection,
        fixingsBySection: deriv.fixingsBySection,
        cableHolesBySection: deriv.cableHolesBySection,
        vinylPieces: deriv.materialPieces.vinyl,
        acrylicPieces: deriv.materialPieces.acrylic,
        solidPieces: deriv.materialPieces.solid,
        backlightPieces: deriv.backlightPieces,
        standoffPieces: deriv.standoffPieces,
        pushThroughPieces: deriv.pushThroughPieces,
        extraFacePieces: deriv.extraFacePieces,
        vinylPrintDataUrl: deriv.vinylPrintDataUrl,
    });

    const onReferencePdf = async () => {
        if (busy || !ready) return;
        setBusy('ref');
        setError(null);
        try {
            const blob = await generateReferencePdfBlob({
                ...pdfOptionsFor(d, params),
                thumbnailDataUrl: thumbnail ?? undefined,
                embeddedNests: [],
                ...twoItem(),
            });
            download(blob, pdfFilename(params, 'reference'));
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not build the PDF.');
        } finally {
            setBusy(null);
        }
    };

    const onProductionPdf = async () => {
        if (busy || !ready) return;
        setBusy('prod');
        setError(null);
        try {
            const blob = await generateProductionPdfBlob({
                ...pdfOptionsFor(d, params),
                embeddedNests: [],
                ...twoItem(),
            });
            download(blob, pdfFilename(params, 'production'));
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not build the PDF.');
        } finally {
            setBusy(null);
        }
    };

    const onStartPack = async () => {
        if (busy || !ready) return;
        setBusy('pack');
        setError(null);
        try {
            // The submitted face-on preview stands in for a live in-situ render.
            let input = buildDesignPackInput(pieceDataFor(d, params), {
                insituDataUri: thumbnail ?? null,
                logoDataUri: null,
            });
            // A projecting sign becomes its own pack sections alongside the
            // fascia (built with no in-situ so the overview keeps one render).
            if (hasProjecting && projParams) {
                const proj = buildDesignPackInput(pieceDataFor(pd, projParams), {
                    insituDataUri: null,
                    logoDataUri: null,
                });
                input = appendProjectingSign(input, proj);
            }
            const content = buildPackFromDesignPieces({ ...input, reference });
            const res = await createProductionPackFromContent({
                name: input.name,
                content,
            });
            if (!res.ok) {
                setError(res.error);
                return;
            }
            router.push(`/admin/production-packs/${res.data.id}`);
        } catch (e) {
            setError(
                e instanceof Error ? e.message : 'Could not build the pack.',
            );
        } finally {
            setBusy(null);
        }
    };

    const disabled = !ready || busy !== null;

    return (
        <Card className="p-4">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-widest text-neutral-500">
                Production files
            </h3>
            <p className="mb-3 text-[11px] text-neutral-400">
                Generated from the customer&apos;s submitted design — true 1:1.
                {hasProjecting && (
                    <span className="mt-1 block font-medium text-[#3a5f6a]">
                        Includes the fascia + projecting sign (both items).
                    </span>
                )}
            </p>

            <div className="space-y-2">
                <button
                    type="button"
                    onClick={onReferencePdf}
                    disabled={disabled}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
                >
                    {busy === 'ref' ? (
                        <Loader2 size={16} className="animate-spin" aria-hidden />
                    ) : (
                        <FileText size={16} aria-hidden />
                    )}
                    Reference drawing (PDF)
                </button>

                <button
                    type="button"
                    onClick={onProductionPdf}
                    disabled={disabled}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
                >
                    {busy === 'prod' ? (
                        <Loader2 size={16} className="animate-spin" aria-hidden />
                    ) : (
                        <Scissors size={16} aria-hidden />
                    )}
                    Production cut files (PDF)
                </button>
            </div>

            <div className="my-3 border-t border-neutral-100" />

            <button
                type="button"
                onClick={onStartPack}
                disabled={disabled}
                aria-busy={busy === 'pack'}
                className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-50"
                style={{ background: ACCENT }}
            >
                {busy === 'pack' ? (
                    <Loader2 size={16} className="animate-spin" aria-hidden />
                ) : (
                    <Box size={16} aria-hidden />
                )}
                Start production pack
            </button>
            <p className="mt-1.5 text-center text-[11px] text-neutral-400">
                Builds a per-piece works pack pre-filled with the cut drawings,
                then opens it to edit.
            </p>

            {!ready && (
                <p className="mt-3 flex items-center gap-1.5 text-[11px] text-neutral-400">
                    <Loader2 size={12} className="animate-spin" aria-hidden />
                    Deriving the sign…
                </p>
            )}
            {ready && !hasArtwork && (
                <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                    No artwork on this design — files cover the bare tray only.
                </p>
            )}
            {error && (
                <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                    {error}
                </p>
            )}
        </Card>
    );
}
