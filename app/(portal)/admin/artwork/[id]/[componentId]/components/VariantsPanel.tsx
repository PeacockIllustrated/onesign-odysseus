'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Loader2, Upload } from 'lucide-react';
import {
    addVariantToComponent,
    uploadVariantThumbnail,
} from '@/lib/artwork/visual-approval-actions';
import type { ArtworkVariant } from '@/lib/artwork/variant-types';
import { VariantCard } from './VariantCard';

interface Props {
    componentId: string;
    variants: ArtworkVariant[];
    readOnly?: boolean;
}

/**
 * Multi-file drop: one variant per image, auto-labelled, thumbnails attached
 * in a single action. Cuts visual-pack assembly from "add → pick file → wait
 * → add → pick file → wait" to "drop 4 images, done".
 */
export function VariantsPanel({ componentId, variants, readOnly = false }: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [err, setErr] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const addBlank = () => {
        setErr(null);
        startTransition(async () => {
            const res = await addVariantToComponent({ componentId });
            if ('error' in res) setErr(res.error);
            else router.refresh();
        });
    };

    const handleFiles = (files: FileList | File[]) => {
        setErr(null);
        const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
        if (list.length === 0) {
            setErr('please drop image files');
            return;
        }
        // Sequentially create + upload so auto-labels land in drop order
        // (A, B, C, D…). Parallel is faster but nextLabel() races.
        startTransition(async () => {
            setProgress({ done: 0, total: list.length });
            for (let i = 0; i < list.length; i++) {
                const file = list[i];
                const created = await addVariantToComponent({
                    componentId,
                    // Seed with filename (without extension) so the client sees
                    // something meaningful before staff rename.
                    name: file.name.replace(/\.[^.]+$/, '').slice(0, 120),
                });
                if ('error' in created) {
                    setErr(created.error);
                    setProgress(null);
                    return;
                }
                const fd = new FormData();
                fd.append('file', file);
                const uploaded = await uploadVariantThumbnail(created.id, fd);
                if ('error' in uploaded) {
                    setErr(`variant created but image upload failed: ${uploaded.error}`);
                    setProgress({ done: i + 1, total: list.length });
                    // Keep going — one failed upload shouldn't block the rest
                    continue;
                }
                setProgress({ done: i + 1, total: list.length });
            }
            setProgress(null);
            router.refresh();
        });
    };

    const onDragOver = (e: React.DragEvent) => {
        if (readOnly) return;
        e.preventDefault();
        e.stopPropagation();
        setDragOver(true);
    };
    const onDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
    };
    const onDrop = (e: React.DragEvent) => {
        if (readOnly) return;
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFiles(e.dataTransfer.files);
        }
    };

    return (
        <section className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <h3 className="text-sm font-bold text-neutral-900">Variants</h3>
                    <p className="text-xs text-neutral-500">
                        one design option per variant — drop images to create several at once
                    </p>
                </div>
                {!readOnly && (
                    <div className="flex items-center gap-2">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                                if (e.target.files) handleFiles(e.target.files);
                                e.target.value = '';
                            }}
                        />
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={pending}
                            className="btn-primary text-xs inline-flex items-center gap-1"
                            title="Pick several images to create a variant for each"
                        >
                            {pending ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                            upload images
                        </button>
                        <button
                            type="button"
                            onClick={addBlank}
                            disabled={pending}
                            className="btn-secondary text-xs inline-flex items-center gap-1"
                            title="Add a blank variant (for typing specs without an image yet)"
                        >
                            <Plus size={12} />
                            blank variant
                        </button>
                    </div>
                )}
            </div>

            {/* Drop zone — doubles as the "no variants yet" placeholder */}
            {!readOnly && (
                <div
                    onDragOver={onDragOver}
                    onDragEnter={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    className={`border-2 border-dashed rounded-lg px-4 py-5 text-center transition-colors ${
                        dragOver
                            ? 'border-[#4e7e8c] bg-[#e8f0f3] text-[#3a5f6a]'
                            : 'border-neutral-300 bg-neutral-50 text-neutral-500'
                    }`}
                >
                    <Upload size={16} className="inline-block mb-1" />
                    <p className="text-xs">
                        drag &amp; drop artwork images here — one variant is created per image, auto-labelled A, B, C…
                    </p>
                    {progress && (
                        <p className="text-[11px] text-neutral-600 mt-2">
                            uploading {progress.done} of {progress.total}…
                        </p>
                    )}
                </div>
            )}

            {variants.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {variants.map((v) => (
                        <VariantCard key={v.id} variant={v} readOnly={readOnly} />
                    ))}
                </div>
            )}

            {err && <p className="text-xs text-red-700">{err}</p>}
        </section>
    );
}
