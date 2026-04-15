'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, X, Loader2 } from 'lucide-react';

interface Props {
    /** Current image URL to preview (null = no image yet) */
    currentUrl: string | null;
    /** Server action: takes FormData with key "file", returns {url} or {error} */
    uploadAction: (formData: FormData) => Promise<{ url: string } | { error: string }>;
    /** Optional server action to clear the image */
    removeAction?: () => Promise<{ ok: true } | { error: string }>;
    /** Small (sub-item) vs large (component) presentation */
    size?: 'sm' | 'md';
    /** Displayed label */
    label?: string;
    /** Hide when read-only (e.g. signed-off item) */
    readOnly?: boolean;
}

export function ThumbnailUpload({
    currentUrl,
    uploadAction,
    removeAction,
    size = 'md',
    label = 'thumbnail',
    readOnly = false,
}: Props) {
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const onPick = () => inputRef.current?.click();

    const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setError(null);

        const fd = new FormData();
        fd.append('file', file);

        startTransition(async () => {
            const res = await uploadAction(fd);
            if ('error' in res) setError(res.error);
            else router.refresh();
            if (inputRef.current) inputRef.current.value = '';
        });
    };

    const onRemove = () => {
        if (!removeAction) return;
        if (!confirm(`Remove ${label}?`)) return;
        setError(null);
        startTransition(async () => {
            const res = await removeAction();
            if ('error' in res) setError(res.error);
            else router.refresh();
        });
    };

    const height = size === 'sm' ? 'h-24' : 'h-48';
    const textSize = size === 'sm' ? 'text-[11px]' : 'text-xs';

    return (
        <div className="space-y-1.5">
            {currentUrl ? (
                <div className="relative group">
                    <img
                        src={currentUrl}
                        alt={label}
                        className={`w-full ${height} object-contain rounded border border-neutral-200 bg-neutral-50`}
                    />
                    {!readOnly && (
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                            <button
                                type="button"
                                onClick={onPick}
                                disabled={pending}
                                className={`${textSize} btn-secondary bg-white inline-flex items-center gap-1 shadow-md`}
                            >
                                <Upload size={12} /> replace
                            </button>
                            {removeAction && (
                                <button
                                    type="button"
                                    onClick={onRemove}
                                    disabled={pending}
                                    className={`${textSize} bg-white text-red-700 border border-red-200 rounded px-2 py-1 inline-flex items-center gap-1 shadow-md hover:bg-red-50`}
                                >
                                    <X size={12} /> remove
                                </button>
                            )}
                        </div>
                    )}
                </div>
            ) : (
                !readOnly && (
                    <button
                        type="button"
                        onClick={onPick}
                        disabled={pending}
                        className={`w-full ${height} border-2 border-dashed border-neutral-200 hover:border-neutral-400 rounded flex items-center justify-center gap-1.5 ${textSize} text-neutral-500 hover:text-neutral-700 disabled:opacity-50`}
                    >
                        {pending ? (
                            <>
                                <Loader2 size={14} className="animate-spin" /> uploading…
                            </>
                        ) : (
                            <>
                                <Upload size={14} /> upload {label}
                            </>
                        )}
                    </button>
                )
            )}
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onFile}
            />
            {error && <p className="text-[11px] text-red-700">{error}</p>}
            {pending && currentUrl && (
                <p className={`${textSize} text-neutral-500 inline-flex items-center gap-1`}>
                    <Loader2 size={10} className="animate-spin" /> working…
                </p>
            )}
        </div>
    );
}
