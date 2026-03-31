'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { completeArtworkAndAdvanceItem } from '@/lib/artwork/actions';

interface Props {
    artworkJobId: string;
    components: Array<{
        id: string;
        name: string;
        target_stage_id: string | null;
        design_signed_off_at: string | null;
    }>;
    stages: Array<{ id: string; name: string; color: string }>;
}

export function ReleaseToProductionButton({ artworkJobId, components, stages }: Props) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [showConfirm, setShowConfirm] = useState(false);

    const allDesignedOff = components.every(c => c.design_signed_off_at);
    const allAssigned = components.every(c => c.target_stage_id);
    const canRelease = components.length > 0 && allDesignedOff && allAssigned;

    const stageMap = new Map(stages.map(s => [s.id, s]));
    const assignedStages = [...new Set(components.map(c => c.target_stage_id).filter(Boolean))]
        .map(id => stageMap.get(id!))
        .filter(Boolean)
        .sort((a, b) => stages.indexOf(a!) - stages.indexOf(b!));

    function handleRelease() {
        startTransition(async () => {
            const result = await completeArtworkAndAdvanceItem(artworkJobId);
            if ('success' in result) {
                router.refresh();
            } else {
                alert(result.error);
            }
            setShowConfirm(false);
        });
    }

    if (!canRelease) {
        const reasons: string[] = [];
        if (components.length === 0) reasons.push('No components');
        if (!allDesignedOff) reasons.push('Not all designs signed off');
        if (!allAssigned) reasons.push('Not all departments assigned');
        return (
            <button disabled className="btn-secondary opacity-50 cursor-not-allowed" title={reasons.join(', ')}>
                Release to Production
            </button>
        );
    }

    if (showConfirm) {
        return (
            <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                    {assignedStages.map(s => (
                        <span key={s!.id} className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: `${s!.color}20`, color: s!.color }}>
                            {s!.name}
                        </span>
                    ))}
                </div>
                <button onClick={handleRelease} disabled={isPending} className="btn-primary text-xs py-1.5 px-3">
                    {isPending ? 'Releasing...' : 'Confirm'}
                </button>
                <button onClick={() => setShowConfirm(false)} className="text-xs text-neutral-500 hover:text-neutral-700">
                    Cancel
                </button>
            </div>
        );
    }

    return (
        <button onClick={() => setShowConfirm(true)} className="btn-primary">
            Release to Production
        </button>
    );
}
