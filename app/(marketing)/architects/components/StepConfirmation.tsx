'use client';

import type { ArchitectEnquiryFormData } from '../schema';
import { PROJECT_TYPES, RIBA_STAGES, SUPPORT_OPTIONS } from '../schema';

interface StepConfirmationProps {
    data: ArchitectEnquiryFormData;
}

export function StepConfirmation({ data }: StepConfirmationProps) {
    const projectType = PROJECT_TYPES.find(p => p.value === data.project_type);
    const ribaStage = RIBA_STAGES.find(s => s.value === data.riba_stage);
    const supportLabels = (data.support_needed || [])
        .map(key => SUPPORT_OPTIONS.find(o => o.value === key)?.label)
        .filter(Boolean);

    return (
        <div className="text-center space-y-8">
            {/* Success Icon with animation */}
            <div className="flex justify-center">
                <div className="relative">
                    <div className="w-24 h-24 bg-neutral-900 rounded-full flex items-center justify-center animate-[scale-in_0.5s_ease-out]">
                        <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    {/* Animated ring */}
                    <div className="absolute inset-0 w-24 h-24 rounded-full border-2 border-neutral-200 animate-ping opacity-20" />
                </div>
            </div>

            {/* Headline */}
            <div>
                <h2 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-3">
                    Enquiry Received
                </h2>
                <p className="text-lg text-neutral-600">
                    Thank you, {data.contact_name.split(' ')[0]}. We&apos;ll be in touch shortly.
                </p>
            </div>

            {/* Summary Card */}
            <div className="bg-neutral-50 border border-neutral-200 rounded-[var(--radius-lg)] p-6 text-left max-w-md mx-auto">
                <h3 className="font-semibold text-neutral-900 mb-4 pb-3 border-b border-neutral-100">
                    Your enquiry summary
                </h3>
                <dl className="space-y-3 text-sm">
                    <div className="flex justify-between gap-4">
                        <dt className="text-neutral-500">Practice</dt>
                        <dd className="font-medium text-neutral-900 text-right">{data.practice_name}</dd>
                    </div>
                    {data.project_name && (
                        <div className="flex justify-between gap-4">
                            <dt className="text-neutral-500">Project</dt>
                            <dd className="font-medium text-neutral-900 text-right">{data.project_name}</dd>
                        </div>
                    )}
                    {projectType && (
                        <div className="flex justify-between gap-4">
                            <dt className="text-neutral-500">Type</dt>
                            <dd className="font-medium text-neutral-900 text-right">{projectType.label}</dd>
                        </div>
                    )}
                    {ribaStage && (
                        <div className="flex justify-between gap-4">
                            <dt className="text-neutral-500">RIBA Stage</dt>
                            <dd className="font-medium text-neutral-900 text-right">{ribaStage.label.split(' – ')[0]}</dd>
                        </div>
                    )}
                    {supportLabels.length > 0 && (
                        <div className="pt-3 border-t border-neutral-100">
                            <dt className="text-neutral-500 mb-2">Support requested</dt>
                            <dd className="flex flex-wrap gap-2">
                                {supportLabels.map((label, i) => (
                                    <span key={i} className="inline-block px-2.5 py-1 bg-neutral-200 text-neutral-700 text-xs rounded-full">
                                        {label}
                                    </span>
                                ))}
                            </dd>
                        </div>
                    )}
                </dl>
            </div>

            {/* What Happens Next */}
            <div className="bg-white border border-neutral-200 rounded-[var(--radius-lg)] p-6 text-left max-w-md mx-auto">
                <h3 className="font-semibold text-neutral-900 mb-4 pb-3 border-b border-neutral-100">
                    What happens next
                </h3>
                <ol className="space-y-4">
                    <li className="flex gap-4">
                        <span className="shrink-0 w-7 h-7 bg-neutral-900 text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
                        <div>
                            <p className="font-medium text-neutral-900">We review your project</p>
                            <p className="text-sm text-neutral-500">Within 2 working days</p>
                        </div>
                    </li>
                    <li className="flex gap-4">
                        <span className="shrink-0 w-7 h-7 bg-neutral-900 text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
                        <div>
                            <p className="font-medium text-neutral-900">Initial assessment</p>
                            <p className="text-sm text-neutral-500">How we can support your design team</p>
                        </div>
                    </li>
                    <li className="flex gap-4">
                        <span className="shrink-0 w-7 h-7 bg-neutral-900 text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
                        <div>
                            <p className="font-medium text-neutral-900">Next steps</p>
                            <p className="text-sm text-neutral-500">No obligation — just support where it adds value</p>
                        </div>
                    </li>
                </ol>
            </div>

            {/* Contact info */}
            <p className="text-sm text-neutral-500">
                For urgent matters, email us directly at{' '}
                <a href="mailto:architects@onesign.co.uk" className="text-black underline hover:no-underline transition-all">
                    architects@onesign.co.uk
                </a>
            </p>
        </div>
    );
}
