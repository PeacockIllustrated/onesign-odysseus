'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { ShopFloorSubItem } from '@/lib/production/shop-floor-actions';
import { checkDimensionTolerance } from '@/lib/artwork/utils';

interface Props {
    subItem: ShopFloorSubItem;
    measuredW: string;
    measuredH: string;
    onChangeW: (v: string) => void;
    onChangeH: (v: string) => void;
    onNext: () => void;
    onReportProblem: () => void;
}

/**
 * Capture measured width + height (returns ignored in v1 — spec already
 * shows them on LOOK). Live tolerance pill is driven by the existing
 * checkDimensionTolerance helper. Worker may proceed even when out of
 * tolerance — the pill is informational, not a hard gate.
 */
export function StepMeasure({
    subItem, measuredW, measuredH, onChangeW, onChangeH, onNext, onReportProblem,
}: Props) {
    // Pre-fill from whatever's already on the sub-item (idempotent reloads).
    useEffect(() => {
        if (!measuredW && subItem.measured_width_mm != null) {
            onChangeW(String(subItem.measured_width_mm));
        }
        if (!measuredH && subItem.measured_height_mm != null) {
            onChangeH(String(subItem.measured_height_mm));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [subItem.id]);

    const wNum = measuredW === '' ? null : Number(measuredW);
    const hNum = measuredH === '' ? null : Number(measuredH);
    const bothEntered = wNum != null && !Number.isNaN(wNum) && hNum != null && !Number.isNaN(hNum);
    const canProceed = bothEntered;

    const tol =
        bothEntered && subItem.width_mm != null && subItem.height_mm != null
            ? checkDimensionTolerance(
                Number(subItem.width_mm),
                Number(subItem.height_mm),
                wNum,
                hNum,
            )
            : null;

    return (
        <div className="space-y-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
            <div className="bg-white rounded-lg border border-neutral-200 p-4">
                <h4 className="text-[11px] uppercase tracking-[0.1em] font-bold text-neutral-500 mb-2">
                    Design says
                </h4>
                <div className="flex justify-between text-sm py-1 border-b border-dotted border-neutral-200">
                    <span className="text-neutral-500">Width</span>
                    <span className="font-mono font-semibold">{subItem.width_mm ?? '—'} mm</span>
                </div>
                <div className="flex justify-between text-sm py-1 border-b border-dotted border-neutral-200">
                    <span className="text-neutral-500">Height</span>
                    <span className="font-mono font-semibold">{subItem.height_mm ?? '—'} mm</span>
                </div>
                {subItem.returns_mm != null && (
                    <div className="flex justify-between text-sm py-1">
                        <span className="text-neutral-500">Returns</span>
                        <span className="font-mono font-semibold">{subItem.returns_mm} mm</span>
                    </div>
                )}
            </div>

            <div className="space-y-2">
                <label className="block">
                    <span className="block text-xs font-semibold text-neutral-700 mb-1">Measured width (mm)</span>
                    <input
                        type="number"
                        inputMode="decimal"
                        value={measuredW}
                        onChange={(e) => onChangeW(e.target.value)}
                        className="w-full text-2xl font-mono font-bold px-4 py-3 rounded-lg border-2 border-[#4e7e8c] focus:outline-none focus:ring-2 focus:ring-black"
                        placeholder="0"
                    />
                </label>
                <label className="block">
                    <span className="block text-xs font-semibold text-neutral-700 mb-1">Measured height (mm)</span>
                    <input
                        type="number"
                        inputMode="decimal"
                        value={measuredH}
                        onChange={(e) => onChangeH(e.target.value)}
                        className="w-full text-2xl font-mono font-bold px-4 py-3 rounded-lg border-2 border-[#4e7e8c] focus:outline-none focus:ring-2 focus:ring-black"
                        placeholder="0"
                    />
                </label>

                {tol && (
                    <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                            tol.flag === 'within_tolerance'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                        }`}
                    >
                        {tol.flag === 'within_tolerance' ? '✓ Within tolerance' : '⚠ Out of tolerance'}
                    </span>
                )}
            </div>

            <div className="md:col-span-2 space-y-2">
                <button
                    type="button"
                    onClick={onNext}
                    disabled={!canProceed}
                    className="w-full py-4 rounded-lg bg-[#1a1f23] hover:bg-black text-white text-base font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Next — Confirm →
                </button>
                <button
                    type="button"
                    onClick={onReportProblem}
                    className="w-full py-2 text-xs text-red-700 hover:underline flex items-center justify-center gap-1"
                >
                    <AlertTriangle size={14} />
                    Report a problem
                </button>
            </div>
        </div>
    );
}
