'use client';

import { UseFormRegister, UseFormWatch, UseFormSetValue } from 'react-hook-form';
import { ArchitectEnquiryFormData, SUPPORT_OPTIONS } from '../schema';

interface StepSupportProps {
    register: UseFormRegister<ArchitectEnquiryFormData>;
    watch: UseFormWatch<ArchitectEnquiryFormData>;
    setValue: UseFormSetValue<ArchitectEnquiryFormData>;
}

export function StepSupport({ register, watch, setValue }: StepSupportProps) {
    const supportNeeded = watch('support_needed') || [];

    const toggleSupport = (value: string) => {
        if (supportNeeded.includes(value)) {
            setValue('support_needed', supportNeeded.filter((v) => v !== value));
        } else {
            setValue('support_needed', [...supportNeeded, value]);
        }
    };

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-2xl md:text-3xl font-bold text-neutral-900 mb-3">
                    What support do you need?
                </h2>
                <p className="text-neutral-600">
                    Select all that apply. We&apos;ll tailor our response accordingly.
                </p>
            </div>

            <div className="space-y-3">
                {SUPPORT_OPTIONS.map((option, index) => {
                    const isSelected = supportNeeded.includes(option.value);
                    return (
                        <label
                            key={option.value}
                            className={`group flex items-center gap-4 p-5 rounded-[var(--radius-lg)] border cursor-pointer transition-all duration-300 ${isSelected
                                    ? 'border-neutral-900 bg-neutral-900 text-white shadow-lg'
                                    : 'border-neutral-200 hover:border-neutral-400 hover:shadow-md'
                                }`}
                            style={{ animationDelay: `${index * 50}ms` }}
                        >
                            <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSupport(option.value)}
                                className="sr-only"
                            />
                            <span className={`shrink-0 w-6 h-6 border-2 rounded-full flex items-center justify-center transition-all duration-200 ${isSelected
                                    ? 'border-white bg-white'
                                    : 'border-neutral-300 group-hover:border-neutral-400'
                                }`}>
                                {isSelected && (
                                    <svg className="w-3 h-3 text-neutral-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </span>
                            <span className={`text-base font-medium transition-colors ${isSelected ? 'text-white' : 'text-neutral-700 group-hover:text-black'
                                }`}>
                                {option.label}
                            </span>
                        </label>
                    );
                })}
            </div>

            <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Anything else we should know?
                </label>
                <textarea
                    {...register('notes')}
                    rows={4}
                    placeholder="Brief context, specific challenges, timeline considerations..."
                    className="w-full px-4 py-3.5 border border-neutral-200 rounded-[var(--radius-md)] text-base focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all duration-300 hover:border-neutral-300 resize-none"
                />
            </div>
        </div>
    );
}
