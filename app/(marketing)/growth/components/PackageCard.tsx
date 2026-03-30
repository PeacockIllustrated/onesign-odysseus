'use client';

import { GrowthPackage, formatPrice } from '@/lib/offers/onesignDigital';
import { CheckCircle } from '@/lib/icons';
import Link from 'next/link';

interface PackageCardProps {
    pkg: GrowthPackage;
    variant?: 'full' | 'compact';
    showCTA?: boolean;
}

// Tier-based styling for visual differentiation
const tierStyles = {
    entry: {
        badge: 'bg-neutral-100 text-neutral-600 border-neutral-200',
        label: 'Entry',
        accent: 'border-neutral-200',
    },
    popular: {
        badge: 'bg-black text-white border-black',
        label: 'Most Popular',
        accent: 'ring-2 ring-black border-black',
    },
    enterprise: {
        badge: 'bg-neutral-900 text-white border-neutral-900',
        label: 'Enterprise',
        accent: 'border-neutral-900 shadow-lg',
    },
};

export function PackageCard({ pkg, variant = 'full', showCTA = true }: PackageCardProps) {
    const isCompact = variant === 'compact';
    const tierStyle = tierStyles[pkg.tier];

    return (
        <div
            className={`
                relative bg-white border rounded-[var(--radius-md)] flex flex-col
                ${pkg.isRecommended
                    ? tierStyle.accent + ' shadow-lg'
                    : 'border-neutral-200 shadow-sm hover:shadow-md transition-shadow'
                }
                ${isCompact ? 'p-5' : 'p-6 md:p-8'}
            `}
        >
            {/* Tier Badge */}
            {pkg.isRecommended ? (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-black text-white text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider">
                    {tierStyle.label}
                </div>
            ) : (
                <div className={`absolute -top-3 left-4 text-xs font-semibold px-3 py-1 rounded-full border ${tierStyle.badge}`}>
                    {tierStyle.label}
                </div>
            )}

            {/* Header */}
            <div className={`space-y-2 ${pkg.isRecommended || pkg.tier === 'enterprise' ? 'mt-3' : 'mt-2'}`}>
                <h3 className="text-xl font-bold uppercase tracking-tight text-neutral-900">
                    {pkg.name}
                </h3>
                <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-neutral-900">
                        {formatPrice(pkg.price)}
                    </span>
                    <span className="text-neutral-500 text-sm">{pkg.priceSuffix}</span>
                </div>
            </div>

            {/* Meta */}
            <div className={`flex flex-wrap gap-3 text-sm text-neutral-600 ${isCompact ? 'mt-3 mb-4' : 'mt-4 mb-6'} pb-4 border-b border-neutral-100`}>
                <span className="flex items-center gap-1.5">
                    <span className="font-medium text-neutral-900">{pkg.term}</span> term
                </span>
                <span className="text-neutral-300">|</span>
                <span>
                    Ad Spend: <span className="font-medium text-neutral-900">{pkg.adSpendIncluded}</span>
                </span>
            </div>

            {/* Positioning */}
            <div className={`${isCompact ? 'mb-4' : 'mb-6'}`}>
                <p className="text-sm text-neutral-600 bg-neutral-50 p-3 rounded border border-neutral-100">
                    {pkg.positioningLine}
                </p>
            </div>

            {/* Deliverables */}
            {!isCompact && (
                <ul className="space-y-3 mb-8 flex-1">
                    {pkg.deliverables.map((item, idx) => (
                        <li key={idx} className="flex gap-3 text-sm text-neutral-700">
                            <CheckCircle className="text-black shrink-0 mt-0.5" size={16} />
                            <span className={item.isBold ? 'font-semibold text-black' : ''}>
                                {item.text}
                            </span>
                        </li>
                    ))}
                </ul>
            )}

            {/* CTA */}
            {showCTA && (
                <Link
                    href="/growth/enquire"
                    className={`w-full text-center focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black ${pkg.isRecommended ? 'btn-primary' : 'btn-secondary'} ${isCompact ? 'mt-auto' : ''}`}
                >
                    {isCompact ? 'Learn More' : `Select ${pkg.name}`}
                </Link>
            )}
        </div>
    );
}
