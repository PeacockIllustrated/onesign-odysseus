'use client';

import { AlertTriangle } from 'lucide-react';
import type { ShopFloorSubItem } from '@/lib/production/shop-floor-actions';
import { ArtworkZoom } from './ArtworkZoom';

interface Props {
    subItem: ShopFloorSubItem;
    stageInstructions: string[];
    onNext: () => void;
    onReportProblem: () => void;
}

function specRow(k: string, v: string | number | null | undefined) {
    if (v === null || v === undefined || v === '') return null;
    return (
        <div className="flex justify-between text-sm py-1 border-b border-dotted border-neutral-200 last:border-none" key={k}>
            <span className="text-neutral-500">{k}</span>
            <span className="font-semibold text-neutral-900">{v}</span>
        </div>
    );
}

function dims(w: number | null, h: number | null, r: number | null) {
    if (!w && !h) return null;
    const parts = [w, h, r].filter((x): x is number => x != null).map((n) => `${n}`);
    return parts.join(' × ') + ' mm';
}

export function StepLook({ subItem, stageInstructions, onNext, onReportProblem }: Props) {
    const sizeText = dims(subItem.width_mm, subItem.height_mm, subItem.returns_mm);

    return (
        <div className="space-y-4 md:grid md:grid-cols-[1.4fr_1fr] md:gap-4 md:space-y-0">
            <div>
                <ArtworkZoom url={subItem.thumbnail_url} alt={subItem.name ?? 'Artwork'} />
            </div>

            <div className="space-y-3">
                <div className="bg-white rounded-lg border border-neutral-200 p-4">
                    <h4 className="text-[11px] uppercase tracking-[0.1em] font-bold text-neutral-500 mb-2">Spec</h4>
                    {specRow('Material', subItem.material)}
                    {specRow('Method', subItem.application_method)}
                    {specRow('Finish', subItem.finish)}
                    {specRow('Size', sizeText)}
                    {specRow('Qty', subItem.quantity)}
                </div>

                {stageInstructions.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <h4 className="text-[11px] uppercase tracking-[0.1em] font-bold text-amber-800 mb-2">
                            Notes for this stage
                        </h4>
                        <ul className="space-y-1">
                            {stageInstructions.map((t, i) => (
                                <li key={i} className="text-sm text-amber-900">• {t}</li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            <div className="md:col-span-2 space-y-2">
                <button
                    type="button"
                    onClick={onNext}
                    className="w-full py-4 rounded-lg bg-[#1a1f23] hover:bg-black text-white text-base font-bold"
                >
                    Next — Measure →
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
