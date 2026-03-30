'use client';

import { UseFormRegister, UseFormWatch, UseFormSetValue } from 'react-hook-form';
import type { EnquiryFormData } from '../schema';
import { DIGITAL_PACKAGES, ACCELERATORS } from '@/lib/offers/onesignDigital';
import { Zap, CheckCircle } from '@/lib/icons';

interface StepIntentProps {
    register: UseFormRegister<EnquiryFormData>;
    watch: UseFormWatch<EnquiryFormData>;
    setValue: UseFormSetValue<EnquiryFormData>;
}

const START_DATE_OPTIONS = [
    'As soon as possible',
    'Within 2 weeks',
    'Within 1 month',
    'Within 2-3 months',
    'Just exploring for now',
];

export function StepIntent({ register, watch, setValue }: StepIntentProps) {
    const selectedPackage = watch('package_key');
    const selectedAccelerators = watch('accelerator_keys') || [];

    const toggleAccelerator = (key: string) => {
        if (selectedAccelerators.includes(key)) {
            setValue('accelerator_keys', selectedAccelerators.filter((k: string) => k !== key));
        } else {
            setValue('accelerator_keys', [...selectedAccelerators, key]);
        }
    };

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-2xl font-bold text-neutral-900 mb-2">Your growth plan</h2>
                <p className="text-neutral-600">Select your preferred package and any accelerators you&apos;d like to explore.</p>
            </div>

            {/* Package Selection */}
            <div>
                <label className="block text-sm font-medium text-neutral-700 mb-3">
                    Preferred Package
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {DIGITAL_PACKAGES.map(pkg => (
                        <button
                            key={pkg.id}
                            type="button"
                            onClick={() => setValue('package_key', pkg.id)}
                            className={`relative text-left p-5 border rounded-[var(--radius-md)] transition-all ${selectedPackage === pkg.id
                                ? 'border-black ring-2 ring-black'
                                : pkg.isRecommended
                                    ? 'border-neutral-300 shadow-sm'
                                    : 'border-neutral-200 hover:border-neutral-400'
                                }`}
                        >
                            {pkg.isRecommended && (
                                <span className="absolute -top-2 left-4 bg-black text-white text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                                    Popular
                                </span>
                            )}
                            <div className={pkg.isRecommended ? 'mt-1' : ''}>
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="font-bold uppercase tracking-tight">{pkg.name}</h4>
                                    {selectedPackage === pkg.id && (
                                        <CheckCircle size={20} className="text-black" />
                                    )}
                                </div>
                                <div className="flex items-baseline gap-1 mb-2">
                                    <span className="text-2xl font-bold">
                                        £{typeof pkg.price === 'number' ? pkg.price.toLocaleString() : pkg.price}
                                    </span>
                                    <span className="text-neutral-500 text-sm">{pkg.priceSuffix}</span>
                                </div>
                                <div className="text-xs text-neutral-500 space-y-1">
                                    <p><strong>{pkg.term}</strong> term</p>
                                    <p>Ad spend: <strong>{pkg.adSpendIncluded}</strong></p>
                                </div>
                                <p className="text-sm text-neutral-600 mt-3 italic">
                                    &ldquo;{pkg.positioningLine}&rdquo;
                                </p>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Accelerators */}
            <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Optional Accelerators
                </label>
                <p className="text-sm text-neutral-500 mb-4">
                    Select any add-ons you&apos;d like to discuss. These will be included in your proposal.
                </p>

                <div className="space-y-6">
                    {ACCELERATORS.map(category => (
                        <div key={category.title}>
                            <h5 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
                                {category.title}
                            </h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {category.items.map(item => (
                                    <button
                                        key={item.key}
                                        type="button"
                                        onClick={() => toggleAccelerator(item.key)}
                                        className={`flex items-start gap-3 p-3 text-left border rounded-[var(--radius-md)] transition-all ${selectedAccelerators.includes(item.key)
                                            ? 'border-black bg-neutral-900 text-white'
                                            : 'border-neutral-200 hover:border-neutral-400'
                                            }`}
                                    >
                                        <div className={`shrink-0 w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center ${selectedAccelerators.includes(item.key)
                                            ? 'bg-white text-black'
                                            : 'bg-neutral-100'
                                            }`}>
                                            <Zap size={16} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-2">
                                                <span className="text-sm font-medium">{item.title}</span>
                                                <span className={`text-xs font-bold whitespace-nowrap ${selectedAccelerators.includes(item.key)
                                                    ? 'text-neutral-300'
                                                    : 'text-neutral-500'
                                                    }`}>
                                                    {item.price}
                                                </span>
                                            </div>
                                            {item.description && (
                                                <p className={`text-xs mt-0.5 ${selectedAccelerators.includes(item.key)
                                                    ? 'text-neutral-400'
                                                    : 'text-neutral-500'
                                                    }`}>
                                                    {item.description}
                                                </p>
                                            )}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Start Date */}
            <div>
                <label className="block text-sm font-medium text-neutral-700 mb-3">
                    When would you like to start?
                </label>
                <div className="flex flex-wrap gap-2">
                    {START_DATE_OPTIONS.map(option => (
                        <button
                            key={option}
                            type="button"
                            onClick={() => setValue('desired_start_date', option)}
                            className={`px-4 py-2 text-sm border rounded-full transition-all ${watch('desired_start_date') === option
                                ? 'border-black bg-black text-white'
                                : 'border-neutral-200 hover:border-neutral-400'
                                }`}
                        >
                            {option}
                        </button>
                    ))}
                </div>
            </div>

            {/* Notes */}
            <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Anything else we should know?
                </label>
                <textarea
                    {...register('notes')}
                    rows={3}
                    placeholder="Any specific goals, challenges, or questions..."
                    className="w-full px-4 py-3 border border-neutral-200 rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition resize-none"
                />
            </div>
        </div>
    );
}
