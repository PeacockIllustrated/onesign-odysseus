'use client';

import { UseFormRegister, UseFormWatch, UseFormSetValue } from 'react-hook-form';
import { EnquiryFormData } from '../schema';

interface StepCurrentProps {
    register: UseFormRegister<EnquiryFormData>;
    watch: UseFormWatch<EnquiryFormData>;
    setValue: UseFormSetValue<EnquiryFormData>;
}

const LEAD_SOURCES = [
    { key: 'referrals', label: 'Referrals & Word of Mouth' },
    { key: 'organic_search', label: 'Organic Search (Google/Bing)' },
    { key: 'social_organic', label: 'Social Media (Organic)' },
    { key: 'paid_ads', label: 'Paid Ads' },
    { key: 'directories', label: 'Directories (Checkatrade, Yell, etc.)' },
    { key: 'email', label: 'Email Marketing' },
    { key: 'networking', label: 'Networking & Events' },
    { key: 'other', label: 'Other' },
];

export function StepCurrent({ register, watch, setValue }: StepCurrentProps) {
    const currentSources = watch('current_lead_sources') || [];
    const hasExistingAds = watch('has_existing_ads');
    const hasLandingPage = watch('has_existing_landing_page');

    const toggleSource = (key: string) => {
        if (currentSources.includes(key)) {
            setValue('current_lead_sources', currentSources.filter(s => s !== key));
        } else {
            setValue('current_lead_sources', [...currentSources, key]);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-neutral-900 mb-2">Current marketing</h2>
                <p className="text-neutral-600">Understanding where you are now helps us plan what&apos;s next.</p>
            </div>

            <div>
                <label className="block text-sm font-medium text-neutral-700 mb-3">
                    Where do your leads currently come from?
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {LEAD_SOURCES.map(source => (
                        <button
                            key={source.key}
                            type="button"
                            onClick={() => toggleSource(source.key)}
                            className={`p-3 text-left border rounded-[var(--radius-md)] transition-all ${currentSources.includes(source.key)
                                ? 'border-black bg-neutral-900 text-white'
                                : 'border-neutral-200 hover:border-neutral-400'
                                }`}
                        >
                            <span className="text-sm">{source.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-3">
                        Are you currently running paid ads?
                    </label>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={() => setValue('has_existing_ads', true)}
                            className={`flex-1 py-3 px-4 text-center border rounded-[var(--radius-md)] transition-all ${hasExistingAds === true
                                ? 'border-black bg-black text-white'
                                : 'border-neutral-200 hover:border-neutral-400'
                                }`}
                        >
                            Yes
                        </button>
                        <button
                            type="button"
                            onClick={() => setValue('has_existing_ads', false)}
                            className={`flex-1 py-3 px-4 text-center border rounded-[var(--radius-md)] transition-all ${hasExistingAds === false
                                ? 'border-black bg-black text-white'
                                : 'border-neutral-200 hover:border-neutral-400'
                                }`}
                        >
                            No
                        </button>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-3">
                        Do you have a dedicated landing page?
                    </label>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={() => setValue('has_existing_landing_page', true)}
                            className={`flex-1 py-3 px-4 text-center border rounded-[var(--radius-md)] transition-all ${hasLandingPage === true
                                ? 'border-black bg-black text-white'
                                : 'border-neutral-200 hover:border-neutral-400'
                                }`}
                        >
                            Yes
                        </button>
                        <button
                            type="button"
                            onClick={() => setValue('has_existing_landing_page', false)}
                            className={`flex-1 py-3 px-4 text-center border rounded-[var(--radius-md)] transition-all ${hasLandingPage === false
                                ? 'border-black bg-black text-white'
                                : 'border-neutral-200 hover:border-neutral-400'
                                }`}
                        >
                            No
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
