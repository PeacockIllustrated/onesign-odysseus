'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { completeArtworkAndAdvanceItem } from '@/lib/artwork/actions';
import { computeReleaseGaps } from '@/lib/artwork/utils';

interface SubItem {
    label: string;
    name: string | null;
    design_signed_off_at: string | null;
    production_signed_off_at: string | null;
    target_stage_id: string | null;
}

interface Component {
    id: string;
    name: string;
    sub_items?: SubItem[] | null;
}

interface Props {
    artworkJobId: string;
    components: Component[];
    stages: Array<{ id: string; name: string; color: string }>;
}

/**
 * The release gate is computed by the same pure function the server uses
 * (computeReleaseGaps). Previously this button checked component-level
 * target_stage_id + design_signed_off_at, while the server was validating
 * per-sub-item fields — they could disagree, so the button could enable
 * a release the server then rejected. Since migration 039 sub-items are
 * the spec-bearing rows, both sides read sub-items now.
 */
export function ReleaseToProductionButton({ artworkJobId, components, stages }: Props) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [showConfirm, setShowConfirm] = useState(false);

    // Normalise so we can hand the pure function exactly what it expects.
    const normalised = components.map((c) => ({
        name: c.name,
        sub_items: (c.sub_items ?? []).map((si) => ({
            label: si.label,
            name: si.name,
            design_signed_off_at: si.design_signed_off_at,
            production_signed_off_at: si.production_signed_off_at,
            target_stage_id: si.target_stage_id,
        })),
    }));

    const { gaps, targetStageIds } = computeReleaseGaps(normalised);
    const canRelease = components.length > 0 && gaps.length === 0;

    const stageMap = new Map(stages.map((s) => [s.id, s]));
    const assignedStages = targetStageIds
        .map((id) => stageMap.get(id))
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
        // Surface the precise gap list on hover. Cap at a reasonable length
        // so the tooltip stays readable; full list is also available server-side.
        const tooltip =
            components.length === 0
                ? 'No components on this artwork job'
                : gaps.slice(0, 6).join(' • ') + (gaps.length > 6 ? ` … +${gaps.length - 6} more` : '');
        return (
            <button
                disabled
                className="btn-secondary opacity-50 cursor-not-allowed"
                title={tooltip}
            >
                Release to Production
            </button>
        );
    }

    if (showConfirm) {
        return (
            <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                    {assignedStages.map((s) => (
                        <span
                            key={s!.id}
                            className="text-[10px] px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: `${s!.color}20`, color: s!.color }}
                        >
                            {s!.name}
                        </span>
                    ))}
                </div>
                <button
                    onClick={handleRelease}
                    disabled={isPending}
                    className="btn-primary text-xs py-1.5 px-3"
                >
                    {isPending ? 'Releasing...' : 'Confirm'}
                </button>
                <button
                    onClick={() => setShowConfirm(false)}
                    className="text-xs text-neutral-500 hover:text-neutral-700"
                >
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
