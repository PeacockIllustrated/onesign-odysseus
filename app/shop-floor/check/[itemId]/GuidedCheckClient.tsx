'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { ShopFloorCheckContext, ShopFloorSubItem } from '@/lib/production/shop-floor-actions';
import { computeNextSubItem } from '@/lib/production/shop-floor-utils';
import { GuidedCheckHeader } from './GuidedCheckHeader';
import { StepLook } from './StepLook';
import { StepMeasure } from './StepMeasure';
import { StepConfirm } from './StepConfirm';
import { CompletionScreen } from './CompletionScreen';
import { FlagProblemSheet } from './FlagProblemSheet';

export type StepName = 'look' | 'measure' | 'confirm';

interface Props {
    ctx: ShopFloorCheckContext;
}

export function GuidedCheckClient({ ctx }: Props) {
    const router = useRouter();
    const { subItems } = ctx;

    // Pending measurements (entered on MEASURE, committed on CONFIRM sign-off).
    const [measuredW, setMeasuredW] = useState<string>('');
    const [measuredH, setMeasuredH] = useState<string>('');

    // Start at the first not-yet-signed-off sub-item.
    const initialIdx = useMemo(() => computeNextSubItem(subItems), [subItems]);
    const [subIdx, setSubIdx] = useState<number | null>(initialIdx);
    const [step, setStep] = useState<StepName>('look');
    const [showFlag, setShowFlag] = useState(false);

    // All department sub-items done → show completion screen.
    if (subIdx === null || subItems.length === 0) {
        return (
            <CompletionScreen
                ctx={ctx}
                onDone={() => router.push('/shop-floor')}
            />
        );
    }

    const subItem: ShopFloorSubItem = subItems[subIdx];

    const goToStep = (next: StepName) => setStep(next);

    const goToBack = () => {
        if (step === 'measure') return setStep('look');
        if (step === 'confirm') return setStep('measure');
        router.push('/shop-floor');
    };

    // Called after successful production sign-off — advance to the next
    // un-signed-off sub-item, or surface the completion screen.
    const afterSignOff = () => {
        const remaining = subItems.map((si, i) => (i === subIdx ? { ...si, production_signed_off_at: new Date().toISOString() } : si));
        const next = computeNextSubItem(remaining);
        setMeasuredW('');
        setMeasuredH('');
        if (next === null) {
            // Last sub-item signed off — refresh so the server-side context
            // reflects the final state and the completion screen renders
            // from an up-to-date snapshot.
            router.refresh();
            setSubIdx(null);
        } else {
            // Intermediate sign-off — skip the router.refresh(). The
            // client state is the source of truth mid-walkthrough; a refetch
            // here is wasted work and can cause visible flicker.
            setSubIdx(next);
            setStep('look');
        }
    };

    return (
        <div className="min-h-screen bg-neutral-50">
            <GuidedCheckHeader
                ctx={ctx}
                subItem={subItem}
                subIdx={subIdx}
                totalSubItems={subItems.length}
                step={step}
                onBack={goToBack}
            />

            <div className="max-w-3xl mx-auto p-4 pb-10">
                {step === 'look' && (
                    <StepLook
                        subItem={subItem}
                        stageInstructions={ctx.stageInstructions}
                        onNext={() => goToStep('measure')}
                        onReportProblem={() => setShowFlag(true)}
                    />
                )}

                {step === 'measure' && (
                    <StepMeasure
                        subItem={subItem}
                        measuredW={measuredW}
                        measuredH={measuredH}
                        onChangeW={setMeasuredW}
                        onChangeH={setMeasuredH}
                        onNext={() => goToStep('confirm')}
                        onReportProblem={() => setShowFlag(true)}
                    />
                )}

                {step === 'confirm' && (
                    <StepConfirm
                        subItem={subItem}
                        measuredW={measuredW}
                        measuredH={measuredH}
                        onSignedOff={afterSignOff}
                        onReportProblem={() => setShowFlag(true)}
                    />
                )}
            </div>

            {showFlag && (
                <FlagProblemSheet
                    subItem={subItem}
                    jobItemId={ctx.item.id}
                    stageId={ctx.stage?.id ?? null}
                    onClose={() => setShowFlag(false)}
                    onSubmitted={() => {
                        setShowFlag(false);
                        router.push('/shop-floor');
                    }}
                />
            )}
        </div>
    );
}
