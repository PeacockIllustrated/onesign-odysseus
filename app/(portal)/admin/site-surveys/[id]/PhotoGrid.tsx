'use client';

import { useRef, useState } from 'react';
import { Camera, Loader2, Trash2, Pencil } from 'lucide-react';
import {
    uploadSurveyPhoto,
    deleteSurveyPhoto,
} from '@/lib/site-surveys/actions';
import type { SurveyPhotoWithUrl } from '@/lib/site-surveys/types';
import { fileToDownscaledBase64 } from './image-util';
import { PhotoAnnotator } from './PhotoAnnotator';

export function PhotoGrid({
    surveyId,
    itemId,
    photos,
    onAdd,
    onUpdate,
    onDelete,
    canUpload = true,
    hint,
}: {
    surveyId: string;
    itemId: string | null;
    photos: SurveyPhotoWithUrl[];
    onAdd: (photo: SurveyPhotoWithUrl) => void;
    onUpdate: (photo: SurveyPhotoWithUrl) => void;
    onDelete: (id: string) => void;
    canUpload?: boolean;
    hint?: string;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<SurveyPhotoWithUrl | null>(null);

    async function handleFiles(files: FileList | null) {
        if (!files || files.length === 0) return;
        setError(null);
        setBusy(true);
        try {
            for (const file of Array.from(files)) {
                const { base64, contentType, width, height } =
                    await fileToDownscaledBase64(file);
                const res = await uploadSurveyPhoto({
                    surveyId,
                    itemId,
                    base64,
                    contentType,
                    width,
                    height,
                });
                if (!res.ok) {
                    setError(res.error);
                    break;
                }
                onAdd(res.data);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'upload failed');
        } finally {
            setBusy(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    }

    async function handleDelete(id: string) {
        onDelete(id); // optimistic
        const res = await deleteSurveyPhoto(id);
        if (!res.ok) setError(res.error);
    }

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
                <label
                    className={`inline-flex items-center gap-2 rounded border border-neutral-300 px-3 py-2 text-sm font-medium ${
                        canUpload && !busy
                            ? 'cursor-pointer hover:bg-neutral-50'
                            : 'cursor-not-allowed opacity-50'
                    }`}
                >
                    {busy ? (
                        <Loader2 size={16} className="animate-spin" />
                    ) : (
                        <Camera size={16} />
                    )}
                    {busy ? 'uploading…' : 'add photo'}
                    <input
                        ref={inputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        disabled={!canUpload || busy}
                        onChange={(e) => handleFiles(e.target.files)}
                        className="hidden"
                    />
                </label>
                {hint && !canUpload && (
                    <span className="text-xs text-neutral-500">{hint}</span>
                )}
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            {photos.length > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {photos.map((p) => {
                        const marks = p.annotations_json?.length ?? 0;
                        return (
                            <div
                                key={p.id}
                                className="group relative overflow-hidden rounded-md border border-neutral-200 bg-neutral-50"
                            >
                                <button
                                    type="button"
                                    onClick={() => setEditing(p)}
                                    className="block aspect-[4/3] w-full"
                                    title="Annotate"
                                >
                                    {p.url ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={p.url}
                                            alt={p.caption ?? 'survey photo'}
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        <div className="flex h-full items-center justify-center text-xs text-neutral-400">
                                            unavailable
                                        </div>
                                    )}
                                </button>

                                {marks > 0 && (
                                    <span className="absolute left-1.5 top-1.5 rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                        {marks} mark{marks === 1 ? '' : 's'}
                                    </span>
                                )}

                                <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                    <button
                                        type="button"
                                        onClick={() => setEditing(p)}
                                        className="rounded bg-black/60 p-1 text-white hover:bg-black/80"
                                        title="Annotate"
                                    >
                                        <Pencil size={13} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleDelete(p.id)}
                                        className="rounded bg-black/60 p-1 text-white hover:bg-red-600"
                                        title="Delete"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>

                                {p.caption && (
                                    <div className="truncate bg-white px-2 py-1 text-[11px] text-neutral-600">
                                        {p.caption}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {editing && (
                <PhotoAnnotator
                    photo={editing}
                    onClose={() => setEditing(null)}
                    onSaved={(annotations, caption) =>
                        onUpdate({
                            ...editing,
                            annotations_json: annotations,
                            caption: caption.trim() === '' ? null : caption.trim(),
                        })
                    }
                />
            )}
        </div>
    );
}
