'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { ThumbnailUpload } from './ThumbnailUpload';
import {
    updateVariant,
    deleteVariant,
    uploadVariantThumbnail,
    removeVariantThumbnail,
} from '@/lib/artwork/visual-approval-actions';
import type { ArtworkVariant } from '@/lib/artwork/variant-types';

interface Props {
    variant: ArtworkVariant;
    readOnly?: boolean;
}

export function VariantCard({ variant, readOnly = false }: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [err, setErr] = useState<string | null>(null);
    const [showSpec, setShowSpec] = useState(false);

    const [name, setName] = useState(variant.name ?? '');
    const [description, setDescription] = useState(variant.description ?? '');
    const [material, setMaterial] = useState(variant.material ?? '');
    const [method, setMethod] = useState(variant.application_method ?? '');
    const [finish, setFinish] = useState(variant.finish ?? '');
    const [widthMm, setWidthMm] = useState(variant.width_mm?.toString() ?? '');
    const [heightMm, setHeightMm] = useState(variant.height_mm?.toString() ?? '');
    const [returnsMm, setReturnsMm] = useState(variant.returns_mm?.toString() ?? '');

    const persist = () => {
        setErr(null);
        startTransition(async () => {
            const res = await updateVariant(variant.id, {
                name: name || null,
                description: description || null,
                material: material || null,
                applicationMethod: method || null,
                finish: finish || null,
                widthMm: widthMm === '' ? null : Number(widthMm),
                heightMm: heightMm === '' ? null : Number(heightMm),
                returnsMm: returnsMm === '' ? null : Number(returnsMm),
            });
            if ('error' in res) setErr(res.error);
            else router.refresh();
        });
    };

    const remove = () => {
        if (!confirm(`Delete variant ${variant.label}?`)) return;
        setErr(null);
        startTransition(async () => {
            const res = await deleteVariant(variant.id);
            if ('error' in res) setErr(res.error);
            else router.refresh();
        });
    };

    const inputCls = 'w-full text-sm border border-neutral-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black';

    return (
        <div className="border border-neutral-200 rounded-lg bg-white p-4 space-y-3 relative">
            {variant.is_chosen && (
                <span className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-700 text-white uppercase tracking-wider">
                    Chosen
                </span>
            )}

            <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-sm font-bold bg-neutral-900 text-white rounded px-2 py-1">
                    {variant.label}
                </span>
                {!readOnly && !variant.is_chosen && (
                    <button
                        type="button"
                        onClick={remove}
                        disabled={pending}
                        className="text-xs text-red-700 hover:underline inline-flex items-center gap-1"
                    >
                        <Trash2 size={12} /> delete
                    </button>
                )}
            </div>

            <ThumbnailUpload
                currentUrl={variant.thumbnail_url ?? null}
                uploadAction={(fd) => uploadVariantThumbnail(variant.id, fd)}
                removeAction={() => removeVariantThumbnail(variant.id)}
                size="md"
                label="variant thumbnail"
                readOnly={readOnly || variant.is_chosen}
            />

            <label className="block">
                <span className="block text-xs font-semibold text-neutral-700 mb-1">Name</span>
                <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={persist}
                    disabled={readOnly || variant.is_chosen}
                    placeholder='e.g. "Gold foil"'
                    className={inputCls}
                />
            </label>

            <label className="block">
                <span className="block text-xs font-semibold text-neutral-700 mb-1">Description</span>
                <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onBlur={persist}
                    disabled={readOnly || variant.is_chosen}
                    rows={2}
                    placeholder="notes the client will see"
                    className={inputCls}
                />
            </label>

            <button
                type="button"
                onClick={() => setShowSpec(!showSpec)}
                className="text-xs font-semibold text-neutral-600 hover:text-black inline-flex items-center gap-1"
            >
                {showSpec ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                spec details (optional)
            </button>

            {showSpec && (
                <div className="space-y-2 pl-3 border-l-2 border-neutral-200">
                    <label className="block">
                        <span className="block text-[11px] font-semibold text-neutral-700 mb-1">Material</span>
                        <input value={material} onChange={(e) => setMaterial(e.target.value)} onBlur={persist} disabled={readOnly || variant.is_chosen} className={inputCls} />
                    </label>
                    <label className="block">
                        <span className="block text-[11px] font-semibold text-neutral-700 mb-1">Method</span>
                        <input value={method} onChange={(e) => setMethod(e.target.value)} onBlur={persist} disabled={readOnly || variant.is_chosen} className={inputCls} />
                    </label>
                    <label className="block">
                        <span className="block text-[11px] font-semibold text-neutral-700 mb-1">Finish</span>
                        <input value={finish} onChange={(e) => setFinish(e.target.value)} onBlur={persist} disabled={readOnly || variant.is_chosen} className={inputCls} />
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                        <label className="block">
                            <span className="block text-[11px] font-semibold text-neutral-700 mb-1">W (mm)</span>
                            <input type="number" value={widthMm} onChange={(e) => setWidthMm(e.target.value)} onBlur={persist} disabled={readOnly || variant.is_chosen} className={inputCls} />
                        </label>
                        <label className="block">
                            <span className="block text-[11px] font-semibold text-neutral-700 mb-1">H (mm)</span>
                            <input type="number" value={heightMm} onChange={(e) => setHeightMm(e.target.value)} onBlur={persist} disabled={readOnly || variant.is_chosen} className={inputCls} />
                        </label>
                        <label className="block">
                            <span className="block text-[11px] font-semibold text-neutral-700 mb-1">R (mm)</span>
                            <input type="number" value={returnsMm} onChange={(e) => setReturnsMm(e.target.value)} onBlur={persist} disabled={readOnly || variant.is_chosen} className={inputCls} />
                        </label>
                    </div>
                </div>
            )}

            {pending && (
                <p className="text-[11px] text-neutral-500 inline-flex items-center gap-1">
                    <Loader2 size={10} className="animate-spin" /> saving…
                </p>
            )}
            {err && <p className="text-[11px] text-red-700">{err}</p>}
        </div>
    );
}
