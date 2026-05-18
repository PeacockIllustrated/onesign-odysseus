'use client';

import { useState, useTransition } from 'react';
import { Download, Save, FileText } from 'lucide-react';
import { useVisualiser } from './store';
import { sceneCapture } from './Scene3D';
import { generateDxf, dxfFilename } from '@/lib/visualiser/dxf';
import { generatePdfBlob, pdfFilename } from '@/lib/visualiser/pdf';
import { saveDesign } from '@/lib/visualiser/actions';
import {
    PanelParamsSchema,
    type PanelDevelopment,
    type PanelSplit,
    type FlatPath,
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
    development,
    split,
    aperture,
    keyline,
}: {
    development: PanelDevelopment;
    split: PanelSplit;
    aperture: FlatPath[];
    keyline: FlatPath[];
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

    const onDxf = () => {
        const dxf = generateDxf({ development, split, params, aperture, keyline });
        download(
            new Blob([dxf], { type: 'application/dxf' }),
            dxfFilename(params),
        );
    };

    const onPdf = () => {
        const thumb = sceneCapture.fn?.() ?? undefined;
        const blob = generatePdfBlob({
            development,
            split,
            params,
            aperture,
            keyline,
            thumbnailDataUrl: thumb || undefined,
        });
        download(blob, pdfFilename(params));
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
        <div className="flex flex-wrap items-center gap-2">
            <button
                type="button"
                onClick={onDxf}
                disabled={!valid.success}
                className="flex items-center gap-1.5 rounded-md bg-black px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40"
            >
                <Download size={15} /> DXF
            </button>
            <button
                type="button"
                onClick={onPdf}
                disabled={!valid.success}
                className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
            >
                <FileText size={15} /> PDF
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
    );
}
