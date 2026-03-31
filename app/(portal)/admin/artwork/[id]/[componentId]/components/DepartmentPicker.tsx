'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setComponentTargetStage } from '@/lib/artwork/actions';

interface Props {
    componentId: string;
    currentStageId: string | null;
    stages: Array<{ id: string; name: string; slug: string; color: string }>;
}

export function DepartmentPicker({ componentId, currentStageId, stages }: Props) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    // Filter out non-production stages
    const departmentStages = stages.filter(s =>
        s.slug !== 'order-book' && s.slug !== 'artwork-approval' && s.slug !== 'goods-out'
    );

    function handleChange(stageId: string) {
        startTransition(async () => {
            await setComponentTargetStage(componentId, stageId || null);
            router.refresh();
        });
    }

    const currentStage = stages.find(s => s.id === currentStageId);

    return (
        <div>
            <label className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2 block">
                Production Department
            </label>
            <select
                value={currentStageId || ''}
                onChange={e => handleChange(e.target.value)}
                disabled={isPending}
                className="w-full text-sm border border-neutral-200 rounded-[var(--radius-sm)] px-3 py-2 focus:outline-none focus:ring-1 focus:ring-black disabled:opacity-50"
            >
                <option value="">-- Not assigned --</option>
                {departmentStages.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                ))}
            </select>
            {currentStage && (
                <div className="mt-2 flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: currentStage.color }} />
                    <span className="text-xs text-neutral-600">{currentStage.name}</span>
                </div>
            )}
        </div>
    );
}
