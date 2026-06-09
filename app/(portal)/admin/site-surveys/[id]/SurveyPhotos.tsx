'use client';

import { useRef, useState } from 'react';
import { Camera, Loader2, Trash2, Pencil, Ruler } from 'lucide-react';
import {
    uploadSurveyPhoto,
    deleteSurveyPhoto,
} from '@/lib/site-surveys/actions';
import type { SurveyPhotoWithUrl } from '@/lib/site-surveys/types';
import { fileToDownscaledBase64 } from './image-util';
import { PhotoAnnotator } from './PhotoAnnotator';

export function SurveyPhotos({
    surveyId,
    photos,
    onAdd,
    onUpdate,
    onDelete,
}: {
    surveyId: string;
    photos: SurveyPhotoWithUrl[];
    onAdd: (p: SurveyPhotoWithUrl) => void;
    onUpdate: (p: SurveyPhotoWithUrl) => void;
    onDelete: (id: string) => void;
}) {
    const camRef = useRef<HTMLInputElement>(null);
    const upRef = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<SurveyPhotoWithUrl | null>(null);

    async function handleFiles(files: FileList | null) {
        if (!files || files.length === 0) return;
        setError(null);
        setBusy(true);
        let justTaken: SurveyPhotoWithUrl | null = null;
        try {
            for (const file of Array.from(files)) {
                const { base64, contentType, width, height } =
                    await fileToDownscaledBase64(file);
                const res = await uploadSurveyPhoto({
                    surveyId,
                    itemId: null,
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
                justTaken = res.data;
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'upload failed');
        } finally {
            setBusy(false);
            if (camRef.current) camRef.current.value = '';
            if (upRef.current) upRef.current.value = '';
        }
        // Straight into drawing on the photo you just took.
        if (justTaken && files.length === 1) setEditing(justTaken);
    }

    async function remove(id: string) {
        onDelete(id);
        const res = await deleteSurveyPhoto(id);
        if (!res.ok) setError(res.error);
    }

    return (
        <div className="space-y-3">
            <button
                type="button"
                onClick={() => camRef.current?.click()}
                disabled={busy}
                className="flex w-full items-center justify-center gap-3 rounded-xl bg-[#4e7e8c] px-4 py-5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-[#3a5f6a] disabled:opacity-60"
            >
                {busy ? (
                    <Loader2 size={22} className="animate-spin" />
                ) : (
                    <Camera size={22} />
                )}
                {busy ? 'Uploading…' : 'Take a photo'}
            </button>
            <input
                ref={camRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
            />

            <div className="text-center">
                <button
                    type="button"
                    onClick={() => upRef.current?.click()}
                    disabled={busy}
                    className="text-xs font-medium text-neutral-500 hover:text-[#3a5f6a]"
                >
                    or choose a photo from this device
                </button>
                <input
                    ref={upRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFiles(e.target.files)}
                />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            {photos.length === 0 ? (
                <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500">
                    No photos yet. Tap “Take a photo” above.
                </p>
            ) : (
                <ul className="space-y-2">
                    {photos.map((p) => {
                        const marks = p.annotations_json?.length ?? 0;
                        const size =
                            p.sign_width_mm != null && p.sign_height_mm != null
                                ? `${Math.round(p.sign_width_mm)} × ${Math.round(p.sign_height_mm)} mm`
                                : p.sign_width_mm != null
                                  ? `${Math.round(p.sign_width_mm)} mm wide`
                                  : null;
                        return (
                            <li
                                key={p.id}
                                className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-2 shadow-sm"
                            >
                                <button
                                    type="button"
                                    onClick={() => setEditing(p)}
                                    className="h-16 w-20 shrink-0 overflow-hidden rounded-md bg-neutral-100"
                                >
                                    {p.url ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={p.url}
                                            alt=""
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        <span className="flex h-full items-center justify-center text-[10px] text-neutral-400">
                                            —
                                        </span>
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setEditing(p)}
                                    className="min-w-0 flex-1 text-left"
                                >
                                    <div className="truncate text-sm font-medium text-neutral-800">
                                        {p.caption || 'Untitled photo'}
                                    </div>
                                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-neutral-500">
                                        {size && (
                                            <span className="inline-flex items-center gap-1 font-medium text-[#3a5f6a]">
                                                <Ruler size={12} /> {size}
                                            </span>
                                        )}
                                        <span>
                                            {marks > 0
                                                ? `${marks} mark${marks === 1 ? '' : 's'}`
                                                : 'tap to draw on it'}
                                        </span>
                                    </div>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setEditing(p)}
                                    className="rounded-md border border-neutral-300 p-2 text-neutral-700 hover:border-[#4e7e8c] hover:bg-[#e8f0f3] hover:text-[#3a5f6a]"
                                    title="Draw on it"
                                >
                                    <Pencil size={15} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => remove(p.id)}
                                    className="rounded-md p-2 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                                    title="Delete"
                                >
                                    <Trash2 size={15} />
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}

            {editing && (
                <PhotoAnnotator
                    photo={editing}
                    onClose={() => setEditing(null)}
                    onSaved={(r) =>
                        onUpdate({
                            ...editing,
                            annotations_json: r.annotations,
                            caption: r.caption,
                            sign_width_mm: r.sign_width_mm,
                            sign_height_mm: r.sign_height_mm,
                        })
                    }
                />
            )}
        </div>
    );
}
