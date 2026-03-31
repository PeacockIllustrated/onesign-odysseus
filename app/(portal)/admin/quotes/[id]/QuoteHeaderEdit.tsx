'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Edit2, X, Loader2, Save } from 'lucide-react';
import { updateQuoteAction } from '@/lib/quoter/actions';
import { Quote } from '@/lib/quoter/types';

interface QuoteHeaderEditProps {
    quote: Quote;
}

export function QuoteHeaderEdit({ quote }: QuoteHeaderEditProps) {
    const router = useRouter();
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { register, handleSubmit } = useForm({
        defaultValues: {
            customer_name: quote.customer_name || '',
            customer_email: quote.customer_email || '',
            customer_phone: quote.customer_phone || '',
            project_name: quote.project_name || '',
            customer_reference: quote.customer_reference || '',
            notes_internal: quote.notes_internal || '',
            notes_client: quote.notes_client || '',
        }
    });

    const onSubmit = async (data: any) => {
        setIsSaving(true);
        setError(null);
        try {
            const result = await updateQuoteAction({ id: quote.id, ...data });
            if ('error' in result) {
                setError(result.error);
            } else {
                setIsEditing(false);
                router.refresh();
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update');
        } finally {
            setIsSaving(false);
        }
    };

    if (isEditing) {
        return (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 p-4 bg-neutral-50 rounded-[var(--radius-sm)] border border-neutral-200 mb-6">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-neutral-900">Edit Quote Details</h3>
                    <button type="button" onClick={() => setIsEditing(false)} className="text-neutral-500 hover:text-neutral-900">
                        <X size={16} />
                    </button>
                </div>

                {/* Row 1: Contact */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Customer Name</label>
                        <input {...register('customer_name')} className="w-full px-3 py-2 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-black" />
                    </div>
                    <div>
                        <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Email</label>
                        <input type="email" {...register('customer_email')} className="w-full px-3 py-2 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-black" />
                    </div>
                    <div>
                        <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Phone</label>
                        <input {...register('customer_phone')} className="w-full px-3 py-2 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-black" />
                    </div>
                </div>

                {/* Row 2: Project fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Project Name</label>
                        <input {...register('project_name')} placeholder="e.g. HQ Signage Refresh" className="w-full px-3 py-2 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-black" />
                    </div>
                    <div>
                        <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Customer Reference</label>
                        <input {...register('customer_reference')} placeholder="e.g. PO-12345 or their ref" className="w-full px-3 py-2 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-black" />
                    </div>
                </div>

                {/* Notes */}
                <div>
                    <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Client Notes <span className="normal-case text-neutral-400">(visible on PDF)</span></label>
                    <textarea {...register('notes_client')} rows={3} className="w-full px-3 py-2 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-black" placeholder="Notes to include on the client-facing PDF..." />
                </div>
                <div>
                    <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Internal Notes <span className="normal-case text-neutral-400">(not on PDF)</span></label>
                    <textarea {...register('notes_internal')} rows={2} className="w-full px-3 py-2 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-black" placeholder="Internal notes only..." />
                </div>

                {error && <p className="text-xs text-red-600">{error}</p>}

                <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={() => setIsEditing(false)} className="px-3 py-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900">
                        Cancel
                    </button>
                    <button type="submit" disabled={isSaving} className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-black text-white rounded hover:bg-neutral-800 disabled:opacity-50">
                        {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                        Save Changes
                    </button>
                </div>
            </form>
        );
    }

    return (
        <button onClick={() => setIsEditing(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-600 bg-neutral-100 hover:bg-neutral-200 rounded-[var(--radius-sm)] transition-colors">
            <Edit2 size={12} />
            Edit Details
        </button>
    );
}
