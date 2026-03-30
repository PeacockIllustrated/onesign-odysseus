'use client';

import { useState, useRef, useTransition } from 'react';
import { uploadCoverImage, removeCoverImage } from '@/lib/artwork/actions';
import { Card } from '@/app/(portal)/components/ui';
import { ImagePlus, Trash2, Loader2 } from 'lucide-react';

interface Props {
    jobId: string;
    coverImageUrl: string | null;
}

export function CoverImageUpload({ jobId, coverImageUrl }: Props) {
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            setError('please select an image file');
            return;
        }

        // Max 10MB
        if (file.size > 10 * 1024 * 1024) {
            setError('file must be under 10MB');
            return;
        }

        setError(null);
        const formData = new FormData();
        formData.append('file', file);

        startTransition(async () => {
            const result = await uploadCoverImage(jobId, formData);
            if ('error' in result) {
                setError(result.error);
            }
        });

        // Reset input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleRemove = () => {
        setError(null);
        startTransition(async () => {
            const result = await removeCoverImage(jobId);
            if ('error' in result) {
                setError(result.error);
            }
        });
    };

    return (
        <Card>
            <div className="flex items-center gap-2 mb-3">
                <ImagePlus size={14} className="text-neutral-400" />
                <h3 className="text-sm font-semibold text-neutral-900">cover image</h3>
            </div>

            {error && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5 mb-3">
                    {error}
                </div>
            )}

            {coverImageUrl ? (
                <div className="space-y-2">
                    <div className="border border-neutral-200 rounded overflow-hidden bg-neutral-50">
                        <img
                            src={coverImageUrl}
                            alt="Job cover overview"
                            className="w-full h-auto max-h-48 object-contain"
                        />
                    </div>
                    <div className="flex gap-2">
                        <label className="btn-secondary text-xs inline-flex items-center gap-1 cursor-pointer flex-1 justify-center">
                            {isPending ? (
                                <Loader2 size={12} className="animate-spin" />
                            ) : (
                                <ImagePlus size={12} />
                            )}
                            replace
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleUpload}
                                disabled={isPending}
                                className="hidden"
                            />
                        </label>
                        <button
                            onClick={handleRemove}
                            disabled={isPending}
                            className="btn-secondary text-xs inline-flex items-center gap-1 text-red-600 hover:text-red-700"
                        >
                            <Trash2 size={12} />
                            remove
                        </button>
                    </div>
                </div>
            ) : (
                <label className="block cursor-pointer">
                    <div className="border-2 border-dashed border-neutral-200 rounded-lg p-6 text-center hover:border-neutral-300 transition-colors">
                        {isPending ? (
                            <Loader2 size={20} className="mx-auto text-neutral-400 animate-spin mb-2" />
                        ) : (
                            <ImagePlus size={20} className="mx-auto text-neutral-400 mb-2" />
                        )}
                        <p className="text-xs text-neutral-500">
                            {isPending ? 'uploading...' : 'upload overview image'}
                        </p>
                        <p className="text-xs text-neutral-400 mt-1">
                            panoramic view of the full job
                        </p>
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleUpload}
                        disabled={isPending}
                        className="hidden"
                    />
                </label>
            )}
        </Card>
    );
}
