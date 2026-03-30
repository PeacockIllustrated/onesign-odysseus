'use client';

import type { EnquiryFormData } from '../schema';
import { DIGITAL_PACKAGES, getAcceleratorByKey } from '@/lib/offers/onesignDigital';
import { CheckCircle } from '@/lib/icons';
import Link from 'next/link';

interface StepConfirmationProps {
    data: EnquiryFormData;
}

export function StepConfirmation({ data }: StepConfirmationProps) {
    const selectedPackage = DIGITAL_PACKAGES.find(p => p.id === data.package_key);
    const selectedAccelerators = (data.accelerator_keys || [])
        .map((key: string) => getAcceleratorByKey(key))
        .filter(Boolean);

    return (
        <div className="text-center space-y-8">
            {/* Success Icon */}
            <div className="flex justify-center">
                <div className="w-20 h-20 bg-black rounded-full flex items-center justify-center">
                    <CheckCircle size={40} className="text-white" />
                </div>
            </div>

            {/* Headline */}
            <div>
                <h2 className="text-3xl font-bold text-neutral-900 mb-3">
                    Enquiry Submitted
                </h2>
                <p className="text-lg text-neutral-600">
                    Thank you, {data.contact_name.split(' ')[0]}. We&apos;ve received your enquiry.
                </p>
            </div>

            {/* Summary Card */}
            <div className="bg-neutral-50 border border-neutral-200 rounded-[var(--radius-lg)] p-6 text-left max-w-lg mx-auto">
                <h3 className="font-semibold text-neutral-900 mb-4">Your enquiry summary</h3>
                <dl className="space-y-3 text-sm">
                    <div className="flex justify-between">
                        <dt className="text-neutral-500">Company</dt>
                        <dd className="font-medium text-neutral-900">{data.company_name}</dd>
                    </div>
                    {selectedPackage && (
                        <div className="flex justify-between">
                            <dt className="text-neutral-500">Package Interest</dt>
                            <dd className="font-medium text-neutral-900">{selectedPackage.name}</dd>
                        </div>
                    )}
                    {selectedAccelerators.length > 0 && (
                        <div className="flex justify-between">
                            <dt className="text-neutral-500">Accelerators</dt>
                            <dd className="font-medium text-neutral-900 text-right">
                                {selectedAccelerators.length} selected
                            </dd>
                        </div>
                    )}
                    {data.desired_start_date && (
                        <div className="flex justify-between">
                            <dt className="text-neutral-500">Timeline</dt>
                            <dd className="font-medium text-neutral-900">{data.desired_start_date}</dd>
                        </div>
                    )}
                </dl>
            </div>

            {/* What Happens Next */}
            <div className="bg-white border border-neutral-200 rounded-[var(--radius-lg)] p-6 text-left max-w-lg mx-auto">
                <h3 className="font-semibold text-neutral-900 mb-4">What happens next</h3>
                <ol className="space-y-4">
                    <li className="flex gap-3">
                        <span className="shrink-0 w-6 h-6 bg-black text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
                        <div>
                            <p className="font-medium text-neutral-900">We review your brief</p>
                            <p className="text-sm text-neutral-500">Within 24 hours, we&apos;ll assess your requirements and prepare a tailored response.</p>
                        </div>
                    </li>
                    <li className="flex gap-3">
                        <span className="shrink-0 w-6 h-6 bg-black text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
                        <div>
                            <p className="font-medium text-neutral-900">Discovery call</p>
                            <p className="text-sm text-neutral-500">A 15-minute call to clarify details and answer your questions. No sales pressure.</p>
                        </div>
                    </li>
                    <li className="flex gap-3">
                        <span className="shrink-0 w-6 h-6 bg-black text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
                        <div>
                            <p className="font-medium text-neutral-900">Your proposal</p>
                            <p className="text-sm text-neutral-500">A clear proposal with recommended package, pricing, and projected outcomes.</p>
                        </div>
                    </li>
                </ol>
            </div>

            {/* Confirmation email notice */}
            <p className="text-sm text-neutral-500">
                A confirmation email has been sent to <strong>{data.contact_email}</strong>
            </p>

            {/* Return link */}
            <div className="pt-4">
                <Link
                    href="/growth"
                    className="btn-secondary"
                >
                    ← Back to Growth Packages
                </Link>
            </div>
        </div>
    );
}
