'use client';

import { UseFormRegister, FieldErrors } from 'react-hook-form';
import { EnquiryFormData } from '../schema';

interface StepCommercialProps {
    register: UseFormRegister<EnquiryFormData>;
    errors: FieldErrors<EnquiryFormData>;
}

const JOB_VALUE_RANGES = [
    'Under £1,000',
    '£1,000 – £5,000',
    '£5,000 – £10,000',
    '£10,000 – £25,000',
    '£25,000 – £50,000',
    '£50,000+',
    'Varies significantly',
];

const CAPACITY_OPTIONS = [
    '1-2 jobs per week',
    '3-5 jobs per week',
    '5-10 jobs per week',
    '10+ jobs per week',
    '20+ jobs per month',
    '50+ jobs per month',
];

const RADIUS_OPTIONS = [
    'Local (10 miles)',
    'Regional (25 miles)',
    'County-wide (50 miles)',
    'Multi-region (100+ miles)',
    'Nationwide',
];

export function StepCommercial({ register, errors }: StepCommercialProps) {
    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-neutral-900 mb-2">Commercial details</h2>
                <p className="text-neutral-600">This helps us recommend the right package and set realistic expectations.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Average Job Value
                    </label>
                    <select
                        {...register('avg_job_value')}
                        className="w-full px-4 py-3 border border-neutral-200 rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition bg-white"
                    >
                        <option value="">Select a range...</option>
                        {JOB_VALUE_RANGES.map(range => (
                            <option key={range} value={range}>{range}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Capacity
                    </label>
                    <select
                        {...register('capacity_per_week')}
                        className="w-full px-4 py-3 border border-neutral-200 rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition bg-white"
                    >
                        <option value="">How many jobs can you handle?</option>
                        {CAPACITY_OPTIONS.map(option => (
                            <option key={option} value={option}>{option}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Coverage Radius
                </label>
                <select
                    {...register('coverage_radius')}
                    className="w-full px-4 py-3 border border-neutral-200 rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition bg-white"
                >
                    <option value="">How far are you willing to travel?</option>
                    {RADIUS_OPTIONS.map(option => (
                        <option key={option} value={option}>{option}</option>
                    ))}
                </select>
            </div>

            <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Ideal Customer
                </label>
                <textarea
                    {...register('ideal_customer')}
                    rows={3}
                    placeholder="Describe your ideal customer. e.g., 'Homeowners renovating kitchens, budget £15k+' or 'Commercial property developers needing fit-outs'"
                    className="w-full px-4 py-3 border border-neutral-200 rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition resize-none"
                />
            </div>
        </div>
    );
}
