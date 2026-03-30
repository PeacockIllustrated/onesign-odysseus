'use client';

import { UseFormRegister, FieldErrors, UseFormWatch, UseFormSetValue } from 'react-hook-form';
import { EnquiryFormData } from '../schema';
import { useState } from 'react';

interface StepBusinessProps {
    register: UseFormRegister<EnquiryFormData>;
    errors: FieldErrors<EnquiryFormData>;
    watch: UseFormWatch<EnquiryFormData>;
    setValue: UseFormSetValue<EnquiryFormData>;
}

const INDUSTRY_OPTIONS = [
    'Construction & Trades',
    'Home Services',
    'Retail',
    'Professional Services',
    'Healthcare',
    'Hospitality',
    'Manufacturing',
    'Property & Real Estate',
    'Other',
];

export function StepBusiness({ register, errors, watch, setValue }: StepBusinessProps) {
    const [newArea, setNewArea] = useState('');
    const serviceAreas = watch('service_areas') || [];

    const addServiceArea = () => {
        if (newArea.trim() && !serviceAreas.includes(newArea.trim())) {
            setValue('service_areas', [...serviceAreas, newArea.trim()]);
            setNewArea('');
        }
    };

    const removeServiceArea = (area: string) => {
        setValue('service_areas', serviceAreas.filter(a => a !== area));
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-neutral-900 mb-2">About your business</h2>
                <p className="text-neutral-600">Help us understand your company and where you operate.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Company Name <span className="text-red-500">*</span>
                    </label>
                    <input
                        {...register('company_name')}
                        type="text"
                        placeholder="Acme Ltd"
                        className={`w-full px-4 py-3 border rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition ${errors.company_name ? 'border-red-500' : 'border-neutral-200'
                            }`}
                    />
                    {errors.company_name && (
                        <p className="text-red-500 text-sm mt-1">{errors.company_name.message}</p>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Website
                    </label>
                    <input
                        {...register('company_website')}
                        type="url"
                        placeholder="https://www.company.com"
                        className="w-full px-4 py-3 border border-neutral-200 rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition"
                    />
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Industry
                </label>
                <select
                    {...register('industry_type')}
                    className="w-full px-4 py-3 border border-neutral-200 rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition bg-white"
                >
                    <option value="">Select your industry...</option>
                    {INDUSTRY_OPTIONS.map(industry => (
                        <option key={industry} value={industry}>{industry}</option>
                    ))}
                </select>
            </div>

            <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Service Areas / Locations
                </label>
                <div className="flex gap-2 mb-2">
                    <input
                        type="text"
                        value={newArea}
                        onChange={(e) => setNewArea(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addServiceArea())}
                        placeholder="e.g., Manchester, Northwest, UK-wide..."
                        className="flex-1 px-4 py-3 border border-neutral-200 rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition"
                    />
                    <button
                        type="button"
                        onClick={addServiceArea}
                        className="px-4 py-3 bg-neutral-100 border border-neutral-200 rounded-[var(--radius-md)] hover:bg-neutral-200 transition font-medium"
                    >
                        Add
                    </button>
                </div>
                {serviceAreas.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {serviceAreas.map(area => (
                            <span
                                key={area}
                                className="inline-flex items-center gap-1 px-3 py-1 bg-neutral-100 text-sm rounded-full"
                            >
                                {area}
                                <button
                                    type="button"
                                    onClick={() => removeServiceArea(area)}
                                    className="text-neutral-400 hover:text-neutral-600"
                                >
                                    ×
                                </button>
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
