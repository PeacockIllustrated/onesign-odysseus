'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addComponent } from '@/lib/artwork/actions';
import { ComponentType } from '@/lib/artwork/types';
import { Modal } from '@/app/(portal)/components/ui';
import { Plus, Loader2 } from 'lucide-react';

const componentTypes: { value: ComponentType; label: string }[] = [
    { value: 'panel', label: 'panel' },
    { value: 'vinyl', label: 'vinyl' },
    { value: 'acrylic', label: 'acrylic' },
    { value: 'push_through', label: 'push-through' },
    { value: 'dibond', label: 'dibond' },
    { value: 'aperture_cut', label: 'aperture cut panel' },
    { value: 'foamex', label: 'foamex' },
    { value: 'other', label: 'other' },
];

export function AddComponentForm({ jobId }: { jobId: string }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const [type, setType] = useState<ComponentType>('panel');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            const result = await addComponent(jobId, { name, component_type: type });

            if ('error' in result) {
                setError(result.error);
                setSubmitting(false);
                return;
            }

            setOpen(false);
            setName('');
            setType('panel');
            setSubmitting(false);
            router.refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'failed to add component');
            setSubmitting(false);
        }
    };

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="btn-primary inline-flex items-center gap-1 text-sm"
            >
                <Plus size={16} />
                add component
            </button>

            <Modal open={open} onClose={() => setOpen(false)} title="add component">
                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-[var(--radius-sm)] text-sm text-red-700">
                            {error}
                        </div>
                    )}

                    <div>
                        <label htmlFor="component_name" className="block text-sm font-medium text-neutral-900 mb-1">
                            component name <span className="text-red-500">*</span>
                        </label>
                        <input
                            id="component_name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. 1/2 panel, Vinyl Left, Push-through logo"
                            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                            disabled={submitting}
                            required
                        />
                    </div>

                    <div>
                        <label htmlFor="component_type" className="block text-sm font-medium text-neutral-900 mb-1">
                            type
                        </label>
                        <select
                            id="component_type"
                            value={type}
                            onChange={(e) => setType(e.target.value as ComponentType)}
                            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                            disabled={submitting}
                        >
                            {componentTypes.map((ct) => (
                                <option key={ct.value} value={ct.value}>
                                    {ct.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-3 pt-4 border-t border-neutral-200">
                        <button
                            type="submit"
                            disabled={submitting || !name.trim()}
                            className="btn-primary inline-flex items-center gap-2"
                        >
                            {submitting && <Loader2 size={16} className="animate-spin" />}
                            {submitting ? 'adding...' : 'add component'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            disabled={submitting}
                            className="btn-secondary"
                        >
                            cancel
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
