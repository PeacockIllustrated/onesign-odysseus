'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';

import { WizardProgress } from './components/WizardProgress';
import { StepContact } from './components/StepContact';
import { StepBusiness } from './components/StepBusiness';
import { StepCommercial } from './components/StepCommercial';
import { StepCurrent } from './components/StepCurrent';
import { StepIntent } from './components/StepIntent';
import { StepConfirmation } from './components/StepConfirmation';

import {
    EnquiryFormData,
    enquiryFormSchema,
    stepSchemas,
    defaultEnquiryValues,
} from './schema';
import { Icon } from '@/lib/icons';

const STEP_LABELS = ['Contact', 'Business', 'Commercial', 'Current', 'Intent', 'Done'];

export default function EnquireWizardPage() {
    const [currentStep, setCurrentStep] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [isComplete, setIsComplete] = useState(false);

    const form = useForm<EnquiryFormData>({
        resolver: zodResolver(enquiryFormSchema),
        defaultValues: defaultEnquiryValues,
        mode: 'onBlur',
    });

    const { register, handleSubmit, formState: { errors }, watch, setValue, trigger, getValues } = form;

    const validateCurrentStep = async () => {
        const currentSchema = stepSchemas[currentStep];
        if (!currentSchema) return true;

        const fieldsToValidate = Object.keys(currentSchema.shape) as (keyof EnquiryFormData)[];
        return await trigger(fieldsToValidate);
    };

    const handleNext = async () => {
        const isValid = await validateCurrentStep();
        if (isValid) {
            if (currentStep < 4) {
                setCurrentStep(prev => prev + 1);
            } else {
                // Final step - submit
                await onSubmit(getValues());
            }
        }
    };

    const handleBack = () => {
        if (currentStep > 0) {
            setCurrentStep(prev => prev - 1);
        }
    };

    const onSubmit = async (data: EnquiryFormData) => {
        setIsSubmitting(true);
        setSubmitError(null);

        try {
            const response = await fetch('/api/leads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contact_name: data.contact_name,
                    contact_role: data.contact_role || undefined,
                    contact_email: data.contact_email,
                    contact_phone: data.contact_phone || undefined,
                    company_name: data.company_name,
                    company_website: data.company_website || undefined,
                    industry_type: data.industry_type || undefined,
                    service_areas: data.service_areas?.length ? data.service_areas : undefined,
                    avg_job_value: data.avg_job_value || undefined,
                    capacity_per_week: data.capacity_per_week || undefined,
                    coverage_radius: data.coverage_radius || undefined,
                    ideal_customer: data.ideal_customer || undefined,
                    current_lead_sources: data.current_lead_sources?.length ? data.current_lead_sources : undefined,
                    has_existing_ads: data.has_existing_ads,
                    has_existing_landing_page: data.has_existing_landing_page,
                    desired_start_date: data.desired_start_date || undefined,
                    package_key: data.package_key || undefined,
                    accelerator_keys: data.accelerator_keys?.length ? data.accelerator_keys : undefined,
                    notes: data.notes || undefined,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to submit');
            }

            setIsComplete(true);
            setCurrentStep(5);
        } catch (error) {
            console.error('Failed to submit lead:', error);
            setSubmitError('There was a problem submitting your enquiry. Please try again or contact us directly.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Render current step content
    const renderStep = () => {
        switch (currentStep) {
            case 0:
                return <StepContact register={register} errors={errors} />;
            case 1:
                return <StepBusiness register={register} errors={errors} watch={watch} setValue={setValue} />;
            case 2:
                return <StepCommercial register={register} errors={errors} />;
            case 3:
                return <StepCurrent register={register} watch={watch} setValue={setValue} />;
            case 4:
                return <StepIntent register={register} watch={watch} setValue={setValue} />;
            case 5:
                return <StepConfirmation data={getValues()} />;
            default:
                return null;
        }
    };

    return (
        <div>
            {/* Hero */}
            <section className="py-16 md:py-20 bg-gradient-to-b from-neutral-50 to-white">
                <div className="max-w-3xl mx-auto px-6 text-center">
                    <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-neutral-900 mb-4">
                        Start Your Growth Journey
                    </h1>
                    <p className="text-lg text-neutral-600">
                        Complete this brief to help us understand your business and recommend the right package.
                    </p>
                </div>
            </section>

            {/* Wizard */}
            <section className="py-12 bg-white">
                <div className="max-w-2xl mx-auto px-6">
                    {/* Progress */}
                    {!isComplete && (
                        <WizardProgress
                            currentStep={currentStep}
                            totalSteps={5}
                            stepLabels={STEP_LABELS.slice(0, 5)}
                        />
                    )}

                    {/* Form */}
                    <form onSubmit={handleSubmit(onSubmit)}>
                        <div className="bg-white border border-neutral-200 rounded-[var(--radius-lg)] p-6 md:p-8 shadow-sm">
                            {renderStep()}

                            {/* Error Display */}
                            {submitError && (
                                <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-[var(--radius-md)] text-red-700 text-sm">
                                    {submitError}
                                </div>
                            )}

                            {/* Navigation */}
                            {!isComplete && (
                                <div className="flex items-center justify-between mt-8 pt-6 border-t border-neutral-100">
                                    <button
                                        type="button"
                                        onClick={handleBack}
                                        disabled={currentStep === 0}
                                        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-[var(--radius-sm)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black ${currentStep === 0
                                            ? 'text-neutral-300 cursor-not-allowed'
                                            : 'text-neutral-600 hover:text-black hover:bg-neutral-50'
                                            }`}
                                    >
                                        ← Back
                                    </button>

                                    <div className="flex items-center gap-3">
                                        <span className="text-sm text-neutral-400">
                                            Step {currentStep + 1} of 5
                                        </span>
                                        <button
                                            type="button"
                                            onClick={handleNext}
                                            disabled={isSubmitting}
                                            className="btn-primary min-w-[120px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-black"
                                        >
                                            {isSubmitting ? (
                                                <span className="flex items-center gap-2">
                                                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                    </svg>
                                                    Submitting...
                                                </span>
                                            ) : currentStep === 4 ? (
                                                'Submit Enquiry'
                                            ) : (
                                                'Next →'
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </form>
                </div>
            </section>

            {/* Trust Signals (only show during form) */}
            {!isComplete && (
                <section className="py-12 border-t border-neutral-200">
                    <div className="max-w-4xl mx-auto px-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
                            <div>
                                <div className="w-12 h-12 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <Icon name="Check" size={22} />
                                </div>
                                <h3 className="font-semibold text-neutral-900 mb-1">No Lock-in Tricks</h3>
                                <p className="text-sm text-neutral-600">Clear terms, transparent pricing.</p>
                            </div>
                            <div>
                                <div className="w-12 h-12 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <Icon name="Speed" size={22} />
                                </div>
                                <h3 className="font-semibold text-neutral-900 mb-1">Fast Setup</h3>
                                <p className="text-sm text-neutral-600">Campaigns live within 2 weeks.</p>
                            </div>
                            <div>
                                <div className="w-12 h-12 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <Icon name="Growth" size={22} />
                                </div>
                                <h3 className="font-semibold text-neutral-900 mb-1">Real Results</h3>
                                <p className="text-sm text-neutral-600">Outcome-focused, not vanity metrics.</p>
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {/* Footer link */}
            {!isComplete && (
                <div className="text-center pb-12">
                    <p className="text-sm text-neutral-500">
                        Have questions?{' '}
                        <Link href="/growth/packages" className="underline hover:text-black transition-colors">
                            Review our packages
                        </Link>
                        {' '}or{' '}
                        <a href="mailto:growth@onesigndigital.com" className="underline hover:text-black transition-colors">
                            contact us directly
                        </a>
                    </p>
                </div>
            )}
        </div>
    );
}
