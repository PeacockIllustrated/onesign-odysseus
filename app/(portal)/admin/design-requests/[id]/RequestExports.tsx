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
    type DesignPackPieceData,
} from '@/lib/production-packs/design-pack-input';
import { buildPackFromDesignPieces } from '@/lib/production-packs/from-design';
import { createProductionPackFromContent } from '@/lib/production-packs/actions';
import type { PanelParams, ImportedSvg } from '@/lib/visualiser/types';

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

    const imported = useMemo<ImportedSvg | null>(() => {
        if (!svgSource) return null;
        try {
            return importSvg(svgSource);
        } catch {
            return null;
        }
    }, [svgSource]);

    const d = usePanelDerivation(params, imported, svgSource);

    const [busy, setBusy] = useState<'ref' | 'prod' | 'pack' | null>(null);
    const [error, setError] = useState<string | null>(null);

    const ready = !!d.sectionExport;
    const hasArtwork =
        (params.artworkLayers?.length ?? 0) > 0 ||
        (imported?.paths.length ?? 0) > 0;

    // The shared PDF option block — the same per-section cut arrays + material
    // pieces the visualiser feeds its PDF generators, pulled off this derivation.
    const pdfBase = (): PdfOptions => ({
        sectionExport: d.sectionExport!,
        params,
        designId: designId ?? null,
        apertureBySection: d.apertureBySection,
        keylineBySection: d.keylineBySection,
        pushThroughKeylineBySection: d.pushThroughKeylineBySection,
        pushThroughIslandsBySection: d.pushThroughIslandsBySection,
        fixingsBySection: d.fixingsBySection,
        cableHolesBySection: d.cableHolesBySection,
        referenceBySection: d.referenceBySection,
        apertureHolesBySection: d.apertureHolesBySection,
        vinylPieces: d.materialPieces.vinyl,
        acrylicPieces: d.materialPieces.acrylic,
        solidPieces: d.materialPieces.solid,
        standoffPieces: d.standoffPieces,
        pushThroughPieces: d.pushThroughPieces,
        backlightPieces: d.backlightPieces,
        vinylPrintDataUrl: d.vinylPrintDataUrl,
        faceRectMm: d.faceRectMm,
    });

    const onReferencePdf = async () => {
        if (busy || !ready) return;
        setBusy('ref');
        setError(null);
        try {
            const blob = await generateReferencePdfBlob({
                ...pdfBase(),
                thumbnailDataUrl: thumbnail ?? undefined,
                embeddedNests: [],
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
                ...pdfBase(),
                embeddedNests: [],
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
            const data: DesignPackPieceData = {
                params,
                sectionExport: d.sectionExport!,
                apertureBySection: d.apertureBySection,
                apertureHolesBySection: d.apertureHolesBySection,
                pushThroughKeylineBySection: d.pushThroughKeylineBySection,
                pushThroughIslandsBySection: d.pushThroughIslandsBySection,
                fixingsBySection: d.fixingsBySection,
                cableHolesBySection: d.cableHolesBySection,
                vinylPieces: d.materialPieces.vinyl,
                acrylicPieces: d.materialPieces.acrylic,
                solidPieces: d.materialPieces.solid,
                backlightPieces: d.backlightPieces,
                standoffPieces: d.standoffPieces,
                pushThroughPieces: d.pushThroughPieces,
                extraFacePieces: d.extraFacePieces,
                vinylPrintDataUrl: d.vinylPrintDataUrl,
            };
            // The submitted face-on preview stands in for a live in-situ render.
            const input = buildDesignPackInput(data, {
                insituDataUri: thumbnail ?? null,
                logoDataUri: null,
            });
            const content = buildPackFromDesignPieces({
                ...input,
                reference,
            });
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
