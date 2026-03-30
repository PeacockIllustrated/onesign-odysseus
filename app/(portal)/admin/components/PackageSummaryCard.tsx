'use client';

import { DIGITAL_PACKAGES, ACCELERATORS, type GrowthPackage } from '@/lib/offers/onesignDigital';
import { Check } from 'lucide-react';

interface PackageSummaryCardProps {
    pkg: GrowthPackage;
    selected?: boolean;
    onClick?: () => void;
    showDeliverables?: boolean;
}

export function PackageSummaryCard({ pkg, selected, onClick, showDeliverables = false }: PackageSummaryCardProps) {
    return (
        <div
            onClick={onClick}
            className={`
                p-4 border rounded-lg transition-all
                ${onClick ? 'cursor-pointer' : ''}
                ${selected
                    ? 'border-black bg-neutral-50 ring-1 ring-black'
                    : 'border-neutral-200 hover:border-neutral-300'}
                ${pkg.isRecommended ? 'relative' : ''}
            `}
        >
            {pkg.isRecommended && (
                <span className="absolute -top-2.5 left-4 bg-black text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                    Recommended
                </span>
            )}

            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        {selected && (
                            <div className="w-5 h-5 bg-black rounded-full flex items-center justify-center">
                                <Check size={12} className="text-white" />
                            </div>
                        )}
                        <h3 className="font-bold text-neutral-900">{pkg.name}</h3>
                    </div>
                    <p className="text-sm text-neutral-600 mt-1">{pkg.positioningLine}</p>
                </div>
                <div className="text-right ml-4">
                    <p className="font-bold text-lg text-neutral-900">
                        £{typeof pkg.price === 'number' ? pkg.price.toLocaleString() : pkg.price}
                    </p>
                    <p className="text-xs text-neutral-500">{pkg.priceSuffix}</p>
                </div>
            </div>

            <div className="flex gap-4 mt-3 text-xs text-neutral-500 border-t border-neutral-100 pt-3">
                <span className="flex items-center gap-1">
                    <span className="font-medium">Term:</span> {pkg.term}
                </span>
                <span className="flex items-center gap-1">
                    <span className="font-medium">Ad Spend:</span> {pkg.adSpendIncluded}
                </span>
            </div>

            {showDeliverables && (
                <div className="mt-3 pt-3 border-t border-neutral-100">
                    <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">Deliverables</p>
                    <ul className="space-y-1 text-sm">
                        {pkg.deliverables.map((d, i) => (
                            <li key={i} className={`flex items-start gap-2 ${d.isBold ? 'font-medium' : ''}`}>
                                <Check size={14} className="text-green-500 mt-0.5 flex-shrink-0" />
                                <span>{d.text}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
