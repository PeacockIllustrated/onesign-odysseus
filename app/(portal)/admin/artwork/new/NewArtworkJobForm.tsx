'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateArtworkJobInputSchema, CreateArtworkJobInput } from '@/lib/artwork/types';
import { createArtworkJob } from '@/lib/artwork/actions';
import { Loader2 } from 'lucide-react';

export function NewArtworkJobForm() {
    const router = useRouter();
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<CreateArtworkJobInput>({
        resolver: zodResolver(CreateArtworkJobInputSchema),
    });

    const onSubmit = async (data: CreateArtworkJobInput) => {
        setSubmitting(true);
        setError(null);

        try {
            const result = await createArtworkJob(data);

            if ('error' in result) {
                setError(result.error);
                setSubmitting(false);
                return;
            }

            router.push(`/app/admin/artwork/${result.id}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'failed to create artwork job');
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-[var(--radius-sm)] text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* Job Name */}
            <div>
                <label htmlFor="job_name" className="block text-sm font-medium text-neutral-900 mb-1">
                    job name <span className="text-red-500">*</span>
                </label>
                <input
                    {...register('job_name')}
                    id="job_name"
                    type="text"
                    placeholder="e.g. woodland visitor centre - entrance signage"
                    className={`w-full px-3 py-2 text-sm border rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black ${
                        errors.job_name ? 'border-red-300 bg-red-50' : 'border-neutral-200'
                    }`}
                    disabled={submitting}
                />
                {errors.job_name && (
                    <p className="mt-1 text-xs text-red-600">{errors.job_name.message}</p>
                )}
            </div>

            {/* Client Name */}
            <div>
                <label htmlFor="client_name" className="block text-sm font-medium text-neutral-900 mb-1">
                    client name <span className="text-neutral-400 text-xs">(optional)</span>
                </label>
                <input
                    {...register('client_name')}
                    id="client_name"
                    type="text"
                    placeholder="e.g. national trust"
                    className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                    disabled={submitting}
                />
            </div>

            {/* Description */}
            <div>
                <label htmlFor="description" className="block text-sm font-medium text-neutral-900 mb-1">
                    description <span className="text-neutral-400 text-xs">(optional)</span>
                </label>
                <textarea
                    {...register('description')}
                    id="description"
                    rows={3}
                    placeholder="brief description of the signage job..."
                    className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black resize-none"
                    disabled={submitting}
                />
            </div>

            {/* Submit */}
            <div className="flex items-center gap-3 pt-4 border-t border-neutral-200">
                <button
                    type="submit"
                    disabled={submitting}
                    className="btn-primary inline-flex items-center gap-2"
                >
                    {submitting && <Loader2 size={16} className="animate-spin" />}
                    {submitting ? 'creating...' : 'create artwork job'}
                </button>
                <button
                    type="button"
                    onClick={() => router.back()}
                    disabled={submitting}
                    className="btn-secondary"
                >
                    cancel
                </button>
            </div>
        </form>
    );
}
