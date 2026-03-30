'use client';

import { UseFormRegister, FieldErrors } from 'react-hook-form';
import { ArchitectEnquiryFormData } from '../schema';

interface StepPracticeProps {
    register: UseFormRegister<ArchitectEnquiryFormData>;
    errors: FieldErrors<ArchitectEnquiryFormData>;
}

export function StepPractice({ register, errors }: StepPracticeProps) {
    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-2xl md:text-3xl font-bold text-neutral-900 mb-3">
                    Tell us about your practice
                </h2>
                <p className="text-neutral-600">
                    We&apos;ll use this to understand your studio and how best to support you.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                        Practice name <span className="text-neutral-400">*</span>
                    </label>
                    <input
                        {...register('practice_name')}
                        type="text"
                        placeholder="Studio Name Ltd"
                        className={`w-full px-4 py-3.5 border rounded-[var(--radius-md)] text-base focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all duration-300 hover:border-neutral-300 ${errors.practice_name ? 'border-red-400' : 'border-neutral-200'
                            }`}
                    />
                    {errors.practice_name && (
                        <p className="text-red-500 text-sm mt-2">{errors.practice_name.message}</p>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                        Contact name <span className="text-neutral-400">*</span>
                    </label>
                    <input
                        {...register('contact_name')}
                        type="text"
                        placeholder="Jane Smith"
                        className={`w-full px-4 py-3.5 border rounded-[var(--radius-md)] text-base focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all duration-300 hover:border-neutral-300 ${errors.contact_name ? 'border-red-400' : 'border-neutral-200'
                            }`}
                    />
                    {errors.contact_name && (
                        <p className="text-red-500 text-sm mt-2">{errors.contact_name.message}</p>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                        Your role
                    </label>
                    <input
                        {...register('contact_role')}
                        type="text"
                        placeholder="Associate / Director / Partner"
                        className="w-full px-4 py-3.5 border border-neutral-200 rounded-[var(--radius-md)] text-base focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all duration-300 hover:border-neutral-300"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                        Email <span className="text-neutral-400">*</span>
                    </label>
                    <input
                        {...register('email')}
                        type="email"
                        placeholder="jane@studio.com"
                        className={`w-full px-4 py-3.5 border rounded-[var(--radius-md)] text-base focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all duration-300 hover:border-neutral-300 ${errors.email ? 'border-red-400' : 'border-neutral-200'
                            }`}
                    />
                    {errors.email && (
                        <p className="text-red-500 text-sm mt-2">{errors.email.message}</p>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                        Phone
                    </label>
                    <input
                        {...register('phone')}
                        type="tel"
                        placeholder="+44 20 1234 5678"
                        className="w-full px-4 py-3.5 border border-neutral-200 rounded-[var(--radius-md)] text-base focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all duration-300 hover:border-neutral-300"
                    />
                </div>
            </div>
        </div>
    );
}
