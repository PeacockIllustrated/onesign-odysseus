'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateDesignPackInputSchema, CreateDesignPackInput } from '@/lib/design-packs/types';
import { createDesignPack } from '@/lib/design-packs/actions';
import { Loader2 } from 'lucide-react';

export function CreateDesignPackForm() {
    const router = useRouter();
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<CreateDesignPackInput>({
        resolver: zodResolver(CreateDesignPackInputSchema),
    });

    const onSubmit = async (data: CreateDesignPackInput) => {
        setSubmitting(true);
        setError(null);

        try {
            const result = await createDesignPack(data);

            if ('error' in result) {
                setError(result.error);
                setSubmitting(false);
                return;
            }

            // Success - redirect to the new design pack
            router.push(`/app/admin/design-packs/${result.id}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'failed to create design pack');
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Error Message */}
            {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-[var(--radius-sm)] text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* Project Name */}
            <div>
                <label htmlFor="project_name" className="block text-sm font-medium text-neutral-900 mb-1">
                    project name <span className="text-red-500">*</span>
                </label>
                <input
                    {...register('project_name')}
                    id="project_name"
                    type="text"
                    placeholder="e.g. woodland visitor centre"
                    className={`w-full px-3 py-2 text-sm border rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black ${
                        errors.project_name ? 'border-red-300 bg-red-50' : 'border-neutral-200'
                    }`}
                    disabled={submitting}
                />
                {errors.project_name && (
                    <p className="mt-1 text-xs text-red-600">{errors.project_name.message}</p>
                )}
            </div>

            {/* Client Name */}
            <div>
                <label htmlFor="client_name" className="block text-sm font-medium text-neutral-900 mb-1">
                    client name <span className="text-red-500">*</span>
                </label>
                <input
                    {...register('client_name')}
                    id="client_name"
                    type="text"
                    placeholder="e.g. national trust"
                    className={`w-full px-3 py-2 text-sm border rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black ${
                        errors.client_name ? 'border-red-300 bg-red-50' : 'border-neutral-200'
                    }`}
                    disabled={submitting}
                />
                {errors.client_name && (
                    <p className="mt-1 text-xs text-red-600">{errors.client_name.message}</p>
                )}
            </div>

            {/* Client Email (Optional) */}
            <div>
                <label htmlFor="client_email" className="block text-sm font-medium text-neutral-900 mb-1">
                    client email <span className="text-neutral-400 text-xs">(optional)</span>
                </label>
                <input
                    {...register('client_email')}
                    id="client_email"
                    type="email"
                    placeholder="e.g. contact@client.com"
                    className={`w-full px-3 py-2 text-sm border rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black ${
                        errors.client_email ? 'border-red-300 bg-red-50' : 'border-neutral-200'
                    }`}
                    disabled={submitting}
                />
                {errors.client_email && (
                    <p className="mt-1 text-xs text-red-600">{errors.client_email.message}</p>
                )}
                <p className="mt-1 text-xs text-neutral-500">
                    used for PDF export and follow-up communications
                </p>
            </div>

            {/* Submit Buttons */}
            <div className="flex items-center gap-3 pt-4 border-t border-neutral-200">
                <button
                    type="submit"
                    disabled={submitting}
                    className="btn-primary inline-flex items-center gap-2"
                >
                    {submitting && <Loader2 size={16} className="animate-spin" />}
                    {submitting ? 'creating...' : 'create design pack'}
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
