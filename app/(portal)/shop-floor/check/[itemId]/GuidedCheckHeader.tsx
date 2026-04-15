'use client';

import { ChevronLeft } from 'lucide-react';
import type { ShopFloorCheckContext, ShopFloorSubItem } from '@/lib/production/shop-floor-actions';
import type { StepName } from './GuidedCheckClient';

interface Props {
    ctx: ShopFloorCheckContext;
    subItem: ShopFloorSubItem;
    subIdx: number;
    totalSubItems: number;
    step: StepName;
    onBack: () => void;
}

const STEP_ORDER: StepName[] = ['look', 'measure', 'confirm'];
const STEP_LABEL: Record<StepName, string> = {
    look: '1 · LOOK',
    measure: '2 · MEASURE',
    confirm: '3 · CONFIRM',
};

export function GuidedCheckHeader({ ctx, subItem, subIdx, totalSubItems, step, onBack }: Props) {
    const currentStepIdx = STEP_ORDER.indexOf(step);

    return (
        <header className="sticky top-0 z-20 bg-[#1a1f23] text-white">
            <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
                <button
                    onClick={onBack}
                    className="flex items-center gap-1 px-3 py-2 rounded bg-neutral-700 hover:bg-neutral-600 text-sm font-semibold"
                    aria-label="Back"
                >
                    <ChevronLeft size={16} />
                    Back
                </button>
                <div className="flex-1 min-w-0 text-sm font-semibold truncate">
                    {ctx.item.job_number}
                    {ctx.item.item_number ? ` / ${ctx.item.item_number}` : ''} · {ctx.item.client_name}
                </div>
                {ctx.stage && (
                    <span className="px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider bg-[#4e7e8c]">
                        {ctx.stage.name}
                    </span>
                )}
            </div>

            <div className="max-w-3xl mx-auto px-4 pb-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-300 mb-2">
                    Sub-item {subIdx + 1} of {totalSubItems}
                    {subItem.label ? ` — ${subItem.label}` : ''}
                    {subItem.name ? ` · ${subItem.name}` : ''}
                </div>

                <div className="flex gap-1.5">
                    {STEP_ORDER.map((s, i) => {
                        const state =
                            i < currentStepIdx ? 'done' : i === currentStepIdx ? 'active' : 'pending';
                        const cls =
                            state === 'done'
                                ? 'bg-green-700 text-white'
                                : state === 'active'
                                    ? 'bg-black text-white ring-2 ring-[#4e7e8c]'
                                    : 'bg-neutral-700 text-neutral-400';
                        return (
                            <div
                                key={s}
                                className={`flex-1 px-2 py-2 rounded text-[11px] font-bold text-center ${cls}`}
                            >
                                {STEP_LABEL[s]}
                            </div>
                        );
                    })}
                </div>
            </div>
        </header>
    );
}
