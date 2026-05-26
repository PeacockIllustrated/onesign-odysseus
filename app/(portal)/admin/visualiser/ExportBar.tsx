'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, FileText, Save, Scissors } from 'lucide-react';
import { useVisualiser } from './store';
import { sceneCapture } from './Scene3D';
import {
    generateReferencePdfBlob,
    generateProductionPdfBlob,
    pdfFilename,
} from '@/lib/visualiser/pdf';
import { saveDesign } from '@/lib/visualiser/actions';
import {
    PanelParamsSchema,
    type FlatPath,
    type SectionedExport,
    type ExportWarning,
    type MaterialPiece,
    type StandoffPiece,
} from '@/lib/visualiser/types';

function download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

export function ExportBar({
    sectionExport,
    apertureBySection,
    keylineBySection,
    fixingsBySection,
    referenceBySection,
    vinylPieces,
    acrylicPieces,
    standoffPieces,
    warnings = [],
}: {
    sectionExport: SectionedExport;
    apertureBySection: FlatPath[][];
    keylineBySection: FlatPath[][];
    fixingsBySection: FlatPath[][];
    referenceBySection: FlatPath[][];
    vinylPieces: MaterialPiece[];
    acrylicPieces: MaterialPiece[];
    standoffPieces: StandoffPiece[];
    warnings?: ExportWarning[];
}) {
    const {
        params,
        svgSource,
        designId,
        quoteId,
        quoteItemId,
        dirty,
        markSaved,
    } = useVisualiser();
    const [pending, startTransition] = useTransition();
    const [msg, setMsg] = useState<string | null>(null);

    const valid = PanelParamsSchema.safeParse(params);

    const onReferencePdf = () => {
        const thumb = sceneCapture.fn?.() ?? undefined;
        const blob = generateReferencePdfBlob({
            sectionExport,
            params,
            apertureBySection,
            keylineBySection,
            fixingsBySection,
            referenceBySection,
            vinylPieces,
            acrylicPieces,
            standoffPieces,
            thumbnailDataUrl: thumb || undefined,
        });
        download(blob, pdfFilename(params, 'reference'));
    };

    const onProductionPdf = () => {
        const blob = generateProductionPdfBlob({
            sectionExport,
            params,
            apertureBySection,
            // Keyline + reference outlines + 3D thumbnail are reference-only.
            // Production PDF gets cut geometry only — apertures and fixings.
            fixingsBySection,
        });
        download(blob, pdfFilename(params, 'production'));
    };

    const onSave = () => {
        setMsg(null);
        startTransition(async () => {
            const res = await saveDesign({
                id: designId ?? undefined,
                params,
                svgSource,
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

    return (
        <div className="space-y-2">
            {warnings.length > 0 && (
                <ul className="space-y-1 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2">
                    {warnings.map((w, i) => (
                        <li
                            key={i}
                            className="flex items-start gap-1.5 text-[11px] text-amber-800"
                        >
                            <AlertTriangle
                                size={11}
                                className="mt-0.5 shrink-0 text-amber-600"
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
                    disabled={!valid.success}
                    title="Cut-only PDF — welded perimeters, hairline stroke, sized to the part. Drop into the cutter."
                    className="flex items-center gap-1.5 rounded-md bg-black px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40"
                >
                    <Scissors size={15} /> PDF — Production
                </button>
                <button
                    type="button"
                    onClick={onReferencePdf}
                    disabled={!valid.success}
                    title="Dimensioned shop drawing — spec, legend, fold lines, dimensions. For printing / reference."
                    className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
                >
                    <FileText size={15} /> PDF — Reference
                </button>
                <button
                    type="button"
                    onClick={onSave}
                    disabled={pending || !valid.success}
                    className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
                >
                    <Save size={15} />
                    {pending ? 'Saving…' : designId ? 'Update' : 'Save'}
                    {dirty && !pending && (
                        <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-amber-500" />
                    )}
                </button>
                {!valid.success && (
                    <span className="text-xs text-red-600">
                        {valid.error.issues[0]?.message}
                    </span>
                )}
                {msg && <span className="text-xs text-neutral-500">{msg}</span>}
            </div>
        </div>
    );
}
