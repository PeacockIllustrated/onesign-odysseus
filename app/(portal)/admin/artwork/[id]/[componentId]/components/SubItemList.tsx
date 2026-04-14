'use client';

import { SubItemCard } from './SubItemCard';
import { AddSubItemForm } from './AddSubItemForm';
import type { ArtworkSubItem } from '@/lib/artwork/types';
import type { ProductionStage } from '@/lib/production/types';

interface Props {
    componentId: string;
    subItems: ArtworkSubItem[];
    stages: ProductionStage[];
    jobCompleted: boolean;
}

export function SubItemList({ componentId, subItems, stages, jobCompleted }: Props) {
    const sorted = subItems.slice().sort((a, b) => a.sort_order - b.sort_order);

    return (
        <div className="space-y-3">
            {sorted.length === 0 ? (
                <div className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    This component has no sub-items yet. Add one to begin entering design spec.
                </div>
            ) : (
                sorted.map((si) => (
                    <SubItemCard
                        key={si.id}
                        subItem={si}
                        stages={stages}
                        jobCompleted={jobCompleted}
                    />
                ))
            )}
            {!jobCompleted && <AddSubItemForm componentId={componentId} stages={stages} />}
        </div>
    );
}
