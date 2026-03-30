'use client';

import { UseFormRegister, FieldErrors } from 'react-hook-form';
import { EnquiryFormData } from '../schema';

interface StepContactProps {
    register: UseFormRegister<EnquiryFormData>;
    errors: FieldErrors<EnquiryFormData>;
}

export function StepContact({ register, errors }: StepContactProps) {
    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-neutral-900 mb-2">Let&apos;s start with you</h2>
                <p className="text-neutral-600">Tell us who we&apos;ll be working with.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Full Name <span className="text-red-500">*</span>
                    </label>
                    <input
                        {...register('contact_name')}
                        type="text"
                        placeholder="John Smith"
                        className={`w-full px-4 py-3 border rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition ${errors.contact_name ? 'border-red-500' : 'border-neutral-200'
                            }`}
                    />
                    {errors.contact_name && (
                        <p className="text-red-500 text-sm mt-1">{errors.contact_name.message}</p>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Your Role
                    </label>
                    <input
                        {...register('contact_role')}
                        type="text"
                        placeholder="Managing Director, Owner, Marketing Manager..."
                        className="w-full px-4 py-3 border border-neutral-200 rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Email <span className="text-red-500">*</span>
                    </label>
                    <input
                        {...register('contact_email')}
                        type="email"
                        placeholder="john@company.com"
                        className={`w-full px-4 py-3 border rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition ${errors.contact_email ? 'border-red-500' : 'border-neutral-200'
                            }`}
                    />
                    {errors.contact_email && (
                        <p className="text-red-500 text-sm mt-1">{errors.contact_email.message}</p>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Phone
                    </label>
                    <input
                        {...register('contact_phone')}
                        type="tel"
                        placeholder="07XXX XXXXXX"
                        className="w-full px-4 py-3 border border-neutral-200 rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition"
                    />
                </div>
            </div>
        </div>
    );
}
