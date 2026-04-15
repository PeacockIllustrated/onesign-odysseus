'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import type { ShopFloorSubItem } from '@/lib/production/shop-floor-actions';
import { submitSubItemProduction } from '@/lib/artwork/sub-item-actions';
import { checkDimensionTolerance } from '@/lib/artwork/utils';

interface Props {
    subItem: ShopFloorSubItem;
    measuredW: string;
    measuredH: string;
    onSignedOff: () => void;
    onReportProblem: () => void;
}

export function StepConfirm({ subItem, measuredW, measuredH, onSignedOff, onReportProblem }: Props) {
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const wNum = Number(measuredW);
    const hNum = Number(measuredH);

    const tol =
        subItem.width_mm != null && subItem.height_mm != null
            ? checkDimensionTolerance(
                Number(subItem.width_mm),
                Number(subItem.height_mm),
                wNum,
                hNum,
            )
            : null;

    const doSignOff = () => {
        setError(null);
        startTransition(async () => {
            const res = await submitSubItemProduction(
                subItem.id,
                {
                    measured_width_mm: wNum,
                    measured_height_mm: hNum,
                    material_confirmed: true,
                    rip_no_scaling_confirmed: true,
                },
                true, // signOff
            );
            if ('error' in res) {
                setError(res.error);
                return;
            }
            onSignedOff();
        });
    };

    return (
        <div className="space-y-4">
            <div className="bg-white rounded-lg border border-neutral-200 p-4">
                <h4 className="text-[11px] uppercase tracking-[0.1em] font-bold text-neutral-500 mb-2">Recap</h4>
                <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                    <span className="text-neutral-500">Spec</span>
                    <span className="font-semibold text-neutral-900 text-right">
                        {[subItem.material, subItem.finish, subItem.width_mm && `${subItem.width_mm} × ${subItem.height_mm}`]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                    </span>

                    <span className="text-neutral-500">Measured</span>
                    <span className="font-mono font-semibold text-neutral-900 text-right">
                        {wNum || '—'} × {hNum || '—'} mm
                    </span>

                    <span className="text-neutral-500">Tolerance</span>
                    <span
                        className={`font-semibold text-right ${
                            tol?.flag === 'within_tolerance' ? 'text-green-700' : tol ? 'text-red-700' : 'text-neutral-400'
                        }`}
                    >
                        {tol ? (tol.flag === 'within_tolerance' ? 'within ±1 mm' : `out of tolerance`) : '—'}
                    </span>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                    {error}
                </div>
            )}

            <button
                type="button"
                onClick={doSignOff}
                disabled={pending}
                className="w-full py-5 rounded-lg bg-green-700 hover:bg-green-800 text-white text-base font-bold flex items-center justify-center gap-2 disabled:opacity-60"
            >
                {pending ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                {pending ? 'Signing off…' : 'Production checked — sign off'}
            </button>

            <button
                type="button"
                onClick={onReportProblem}
                className="w-full py-2 text-xs text-red-700 hover:underline flex items-center justify-center gap-1"
            >
                <AlertTriangle size={14} />
                Report a problem instead
            </button>
        </div>
    );
}
