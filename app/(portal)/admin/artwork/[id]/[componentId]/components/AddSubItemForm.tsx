'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { createSubItem } from '@/lib/artwork/sub-item-actions';
import type { ProductionStage } from '@/lib/production/types';

interface Props {
    componentId: string;
    stages: ProductionStage[];
}

const INPUT_CLS =
    'mt-0.5 w-full text-sm border border-neutral-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#4e7e8c]';

export function AddSubItemForm({ componentId, stages }: Props) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const [name, setName] = useState('');
    const [material, setMaterial] = useState('');
    const [stageId, setStageId] = useState('');

    const submit = () => {
        setError(null);
        startTransition(async () => {
            const res = await createSubItem({
                component_id: componentId,
                name: name || undefined,
                material: material || undefined,
                target_stage_id: stageId || undefined,
            });
            if ('error' in res) {
                setError(res.error);
                return;
            }
            setOpen(false);
            setName('');
            setMaterial('');
            setStageId('');
            router.refresh();
        });
    };

    if (!open) {
        return (
            <button
                onClick={() => setOpen(true)}
                className="w-full border-2 border-dashed border-neutral-200 hover:border-neutral-400 rounded-[var(--radius-md)] px-4 py-3 text-sm text-neutral-500 hover:text-neutral-700 inline-flex items-center justify-center gap-1.5"
            >
                <Plus size={14} /> add sub-item
            </button>
        );
    }

    return (
        <div className="border border-neutral-300 rounded-[var(--radius-md)] p-4 bg-neutral-50 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-600">
                new sub-item
            </p>
            <div className="grid grid-cols-2 gap-3">
                <label className="block">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                        name (optional)
                    </span>
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. QUEEN BEE letters"
                        className={INPUT_CLS}
                    />
                </label>
                <label className="block">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                        material (optional)
                    </span>
                    <input
                        value={material}
                        onChange={(e) => setMaterial(e.target.value)}
                        placeholder="e.g. 5mm acrylic"
                        className={INPUT_CLS}
                    />
                </label>
                <label className="block col-span-2">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                        target department
                    </span>
                    <select
                        value={stageId}
                        onChange={(e) => setStageId(e.target.value)}
                        className={INPUT_CLS}
                    >
                        <option value="">— select (can set later) —</option>
                        {stages.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
            {error && <p className="text-xs text-red-700">{error}</p>}
            <div className="flex justify-end gap-2">
                <button onClick={() => setOpen(false)} className="btn-secondary text-xs">
                    cancel
                </button>
                <button
                    onClick={submit}
                    disabled={pending}
                    className="btn-primary text-xs"
                >
                    {pending ? 'adding…' : 'add sub-item'}
                </button>
            </div>
        </div>
    );
}
