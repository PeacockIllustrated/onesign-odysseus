'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
    architectEnquirySchema,
    ArchitectEnquiryFormData,
    defaultArchitectEnquiryValues,
    practiceSchema,
    projectSchema,
    supportSchema,
} from './schema';
import { WizardProgress } from './components/WizardProgress';
import { StepPractice } from './components/StepPractice';
import { StepProject } from './components/StepProject';
import { StepSupport } from './components/StepSupport';
import { StepConfirmation } from './components/StepConfirmation';

// Animated section component with intersection observer
function AnimatedSection({
    children,
    className = '',
    delay = 0
}: {
    children: React.ReactNode;
    className?: string;
    delay?: number;
}) {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsVisible(true);
        }, delay);
        return () => clearTimeout(timer);
    }, [delay]);

    return (
        <div
            className={`transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                } ${className}`}
        >
            {children}
        </div>
    );
}

// Animated bullet item
function BulletItem({
    children,
    variant = 'dark'
}: {
    children: React.ReactNode;
    variant?: 'dark' | 'light';
}) {
    return (
        <li className="flex items-start gap-4 group">
            <span className={`shrink-0 w-2 h-2 mt-2.5 rounded-full transition-transform duration-300 group-hover:scale-150 ${variant === 'dark' ? 'bg-neutral-900' : 'bg-neutral-400'
                }`} />
            <span className={`transition-colors duration-300 ${variant === 'dark' ? 'text-neutral-700 group-hover:text-black' : 'text-neutral-600 group-hover:text-neutral-800'
                }`}>
                {children}
            </span>
        </li>
    );
}

// Section divider with gradient
function SectionDivider({ inverted = false }: { inverted?: boolean }) {
    return (
        <div className={`h-px w-full ${inverted
                ? 'bg-gradient-to-r from-transparent via-neutral-600 to-transparent'
                : 'bg-gradient-to-r from-transparent via-neutral-300 to-transparent'
            }`} />
    );
}

const STEP_LABELS = ['Practice', 'Project', 'Support'];
const stepSchemas = [practiceSchema, projectSchema, supportSchema];

export default function ArchitectsPage() {
    const [currentStep, setCurrentStep] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [isComplete, setIsComplete] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const form = useForm<ArchitectEnquiryFormData>({
        resolver: zodResolver(architectEnquirySchema),
        defaultValues: defaultArchitectEnquiryValues,
        mode: 'onBlur',
    });

    const { register, handleSubmit, formState: { errors }, watch, setValue, trigger, getValues } = form;

    const validateCurrentStep = async () => {
        const currentSchema = stepSchemas[currentStep];
        if (!currentSchema) return true;

        const fieldsToValidate = Object.keys(currentSchema.shape) as (keyof ArchitectEnquiryFormData)[];
        return await trigger(fieldsToValidate);
    };

    const handleNext = async () => {
        const isValid = await validateCurrentStep();
        if (isValid) {
            if (currentStep < 2) {
                setCurrentStep(prev => prev + 1);
                // Scroll to form top
                document.getElementById('enquire')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
                // Final step - submit
                await onSubmit(getValues());
            }
        }
    };

    const handleBack = () => {
        if (currentStep > 0) {
            setCurrentStep(prev => prev - 1);
            document.getElementById('enquire')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    const onSubmit = async (data: ArchitectEnquiryFormData) => {
        setIsSubmitting(true);
        setSubmitError(null);

        try {
            const response = await fetch('/api/architect-leads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    practice_name: data.practice_name,
                    contact_name: data.contact_name,
                    contact_role: data.contact_role || undefined,
                    email: data.email,
                    phone: data.phone || undefined,
                    project_name: data.project_name || undefined,
                    project_type: data.project_type || undefined,
                    riba_stage: data.riba_stage || undefined,
                    location: data.location || undefined,
                    planning_sensitive: data.planning_sensitive || false,
                    support_needed: data.support_needed?.length ? data.support_needed : undefined,
                    notes: data.notes || undefined,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to submit');
            }

            setIsComplete(true);
        } catch (error) {
            console.error('Failed to submit architect lead:', error);
            setSubmitError('There was a problem submitting your enquiry. Please try again or contact us directly.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderStep = () => {
        switch (currentStep) {
            case 0:
                return <StepPractice register={register} errors={errors} />;
            case 1:
                return <StepProject register={register} watch={watch} />;
            case 2:
                return <StepSupport register={register} watch={watch} setValue={setValue} />;
            default:
                return null;
        }
    };

    return (
        <div className="overflow-hidden">
            {/* Hero Section - Full viewport with dramatic entrance */}
            <section className="relative min-h-[90vh] flex items-center justify-center bg-neutral-900 text-white overflow-hidden">
                {/* Subtle grid pattern overlay */}
                <div
                    className="absolute inset-0 opacity-[0.03]"
                    style={{
                        backgroundImage: `linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)`,
                        backgroundSize: '60px 60px'
                    }}
                />

                {/* Animated gradient orb */}
                <div className="absolute top-1/4 right-1/4 w-[600px] h-[600px] bg-gradient-radial from-neutral-700/20 to-transparent rounded-full blur-3xl animate-pulse" />

                <div className="relative max-w-5xl mx-auto px-6 text-center">
                    <AnimatedSection delay={100}>
                        <p className="text-sm font-medium text-neutral-400 uppercase tracking-[0.3em] mb-6">
                            For Architects
                        </p>
                    </AnimatedSection>

                    <AnimatedSection delay={300}>
                        <h1 className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight mb-8 leading-[1.1]">
                            Signage & Wayfinding
                            <span className="block text-neutral-400 mt-2">A Design-Led Approach</span>
                        </h1>
                    </AnimatedSection>

                    <AnimatedSection delay={500}>
                        <p className="text-xl md:text-2xl text-neutral-300 font-light max-w-2xl mx-auto mb-12">
                            Supporting design intent from concept to construction
                        </p>
                    </AnimatedSection>

                    <AnimatedSection delay={700}>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <a
                                href="#enquire"
                                className="inline-flex items-center justify-center px-8 py-4 text-sm font-medium bg-white text-black rounded-[var(--radius-sm)] hover:bg-neutral-100 transition-all duration-300 hover:shadow-lg hover:shadow-white/20 hover:-translate-y-0.5"
                            >
                                Get in Touch
                            </a>
                            <a
                                href="#what-matters"
                                className="inline-flex items-center justify-center px-8 py-4 text-sm font-medium border border-neutral-600 text-white rounded-[var(--radius-sm)] hover:border-white hover:bg-white/5 transition-all duration-300"
                            >
                                Learn More ↓
                            </a>
                        </div>
                    </AnimatedSection>
                </div>

                {/* Scroll indicator */}
                <div className={`absolute bottom-8 left-1/2 -translate-x-1/2 transition-all duration-1000 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
                    <div className="w-6 h-10 border-2 border-neutral-600 rounded-full flex justify-center pt-2">
                        <div className="w-1 h-2 bg-neutral-400 rounded-full animate-bounce" />
                    </div>
                </div>
            </section>

            {/* Introduction - Clean white with elegant typography */}
            <section className="py-24 md:py-32 bg-white">
                <div className="max-w-4xl mx-auto px-6">
                    <AnimatedSection>
                        <div className="space-y-8 text-lg md:text-xl text-neutral-600 leading-relaxed">
                            <p className="text-2xl md:text-3xl text-neutral-900 font-light leading-relaxed">
                                Signage and wayfinding should feel like a natural extension of the architecture — not an overlay applied late in the process.
                            </p>
                            <p>
                                When resolved early and properly, it supports clarity, movement and identity without compromising design quality.
                            </p>
                            <p>
                                We work alongside architects to help translate design intent into build-ready signage that delivers exactly as drawn.
                            </p>
                        </div>
                    </AnimatedSection>
                </div>
            </section>

            <SectionDivider />

            {/* What Matters to Architects - With subtle card hover */}
            <section id="what-matters" className="py-24 md:py-32 bg-white scroll-mt-16">
                <div className="max-w-5xl mx-auto px-6">
                    <div className="grid lg:grid-cols-2 gap-16 items-start">
                        <div className="lg:sticky lg:top-24">
                            <p className="text-sm font-medium text-neutral-400 uppercase tracking-wider mb-4">
                                Understanding Your Priorities
                            </p>
                            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-neutral-900 mb-6">
                                What Matters to Architects
                            </h2>
                            <p className="text-lg text-neutral-600">
                                From working with design teams across public realm, heritage, education and mixed-use projects, we consistently see the same priorities:
                            </p>
                        </div>

                        <ul className="space-y-4">
                            {[
                                'Protecting design intent',
                                'Materials and proportions that align with the architecture',
                                'Details that are buildable, not theoretical',
                                'Clean coordination with façades, interiors, landscape and MEP',
                                'Planning-ready solutions, especially in sensitive contexts',
                                'Avoiding late-stage compromise or value-engineering',
                            ].map((item, i) => (
                                <li
                                    key={i}
                                    className="group p-5 bg-neutral-50 rounded-[var(--radius-md)] border border-transparent hover:border-neutral-200 hover:bg-white hover:shadow-lg transition-all duration-300 cursor-default"
                                >
                                    <div className="flex items-start gap-4">
                                        <span className="shrink-0 w-8 h-8 bg-neutral-900 text-white rounded-full flex items-center justify-center text-sm font-medium group-hover:scale-110 transition-transform duration-300">
                                            {i + 1}
                                        </span>
                                        <span className="text-neutral-700 pt-1">{item}</span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </section>

            {/* Where Signage Often Goes Wrong - Dark dramatic section */}
            <section id="common-issues" className="py-24 md:py-32 bg-neutral-900 text-white relative overflow-hidden">
                {/* Subtle pattern */}
                <div
                    className="absolute inset-0 opacity-[0.02]"
                    style={{
                        backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
                        backgroundSize: '40px 40px'
                    }}
                />

                <div className="relative max-w-4xl mx-auto px-6">
                    <p className="text-sm font-medium text-neutral-500 uppercase tracking-wider mb-4">
                        Common Challenges
                    </p>
                    <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-6">
                        Where Signage Often Goes Wrong
                    </h2>
                    <p className="text-lg text-neutral-400 mb-12">
                        Despite best intentions, signage is often:
                    </p>

                    <div className="grid md:grid-cols-2 gap-4">
                        {[
                            'Considered too late in the programme',
                            'Value-engineered without design input',
                            'Poorly fixed, damaging façades or finishes',
                            'Challenged at planning or conservation stage',
                            'Visually cluttered or inconsistent',
                            'Delivered differently to what was drawn',
                        ].map((item, i) => (
                            <div
                                key={i}
                                className="group flex items-start gap-4 p-4 rounded-[var(--radius-md)] border border-neutral-800 hover:border-neutral-600 hover:bg-neutral-800/50 transition-all duration-300"
                            >
                                <span className="shrink-0 w-6 h-6 border border-neutral-600 rounded-full flex items-center justify-center group-hover:border-white group-hover:bg-white transition-all duration-300">
                                    <span className="w-2 h-2 bg-neutral-600 rounded-full group-hover:bg-neutral-900 transition-colors duration-300" />
                                </span>
                                <span className="text-neutral-300 group-hover:text-white transition-colors duration-300">{item}</span>
                            </div>
                        ))}
                    </div>

                    <p className="text-neutral-500 italic mt-10 text-center">
                        These issues usually arise from a lack of early technical resolution rather than design quality.
                    </p>
                </div>
            </section>

            {/* How We Support Design Teams */}
            <section id="support" className="py-24 md:py-32 bg-white">
                <div className="max-w-5xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <p className="text-sm font-medium text-neutral-400 uppercase tracking-wider mb-4">
                            Our Approach
                        </p>
                        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-neutral-900 mb-6">
                            How We Support Design Teams
                        </h2>
                        <p className="text-lg text-neutral-600 max-w-2xl mx-auto">
                            Our role is to bridge the gap between concept and construction:
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[
                            { title: 'Strategy', desc: 'Early input on signage strategy and placement' },
                            { title: 'Materials', desc: 'Advice on materials, finishes and fixing methods' },
                            { title: 'Planning', desc: 'Planning-ready visuals and proportions' },
                            { title: 'Detailing', desc: 'Technical detailing at RIBA Stages 4–5' },
                            { title: 'Packages', desc: 'Build-ready packages contractors can deliver accurately' },
                            { title: 'Coordination', desc: 'Close coordination through fabrication and installation' },
                        ].map((item, i) => (
                            <div
                                key={i}
                                className="group relative p-6 border border-neutral-200 rounded-[var(--radius-lg)] hover:border-neutral-300 hover:shadow-xl transition-all duration-500"
                            >
                                <div className="absolute top-0 left-6 -translate-y-1/2 px-3 py-1 bg-white text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                                    {String(i + 1).padStart(2, '0')}
                                </div>
                                <h3 className="text-lg font-semibold text-neutral-900 mb-2 group-hover:text-black transition-colors">
                                    {item.title}
                                </h3>
                                <p className="text-neutral-600">
                                    {item.desc}
                                </p>
                            </div>
                        ))}
                    </div>

                    <div className="mt-16 text-center">
                        <div className="inline-block p-6 bg-neutral-50 rounded-[var(--radius-lg)] border border-neutral-100">
                            <p className="text-xl md:text-2xl font-medium text-neutral-900">
                                The goal is simple: <span className="text-neutral-500">what&apos;s designed is what gets built.</span>
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* How We Typically Engage */}
            <section id="engagement" className="py-24 md:py-32 bg-gradient-to-b from-neutral-50 to-white">
                <div className="max-w-4xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <p className="text-sm font-medium text-neutral-400 uppercase tracking-wider mb-4">
                            Flexible Support
                        </p>
                        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-neutral-900 mb-6">
                            How We Typically Engage
                        </h2>
                        <p className="text-lg text-neutral-600">
                            We can support at any stage — formally or informally:
                        </p>
                    </div>

                    {/* Timeline-style layout */}
                    <div className="relative">
                        {/* Vertical line */}
                        <div className="absolute left-4 md:left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-neutral-300 via-neutral-200 to-transparent md:-translate-x-1/2" />

                        <div className="space-y-8">
                            {[
                                'Early concept sanity-checks',
                                'Design development and detailing',
                                'Planning and heritage support',
                                'Technical packages for tender and construction',
                                'Delivery support through to installation',
                            ].map((item, i) => (
                                <div
                                    key={i}
                                    className={`relative flex items-center gap-6 ${i % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'}`}
                                >
                                    {/* Dot */}
                                    <div className="absolute left-4 md:left-1/2 w-3 h-3 bg-neutral-900 rounded-full md:-translate-x-1/2 ring-4 ring-white z-10" />

                                    {/* Content */}
                                    <div className={`ml-12 md:ml-0 md:w-1/2 ${i % 2 === 0 ? 'md:pr-12 md:text-right' : 'md:pl-12'}`}>
                                        <div className="group p-5 bg-white border border-neutral-200 rounded-[var(--radius-md)] shadow-sm hover:shadow-md hover:border-neutral-300 transition-all duration-300">
                                            <span className="text-neutral-700 group-hover:text-black transition-colors">{item}</span>
                                        </div>
                                    </div>

                                    {/* Spacer for alternating layout */}
                                    <div className="hidden md:block md:w-1/2" />
                                </div>
                            ))}
                        </div>
                    </div>

                    <p className="text-center text-neutral-500 italic mt-12">
                        No obligation. Just support where it adds value.
                    </p>
                </div>
            </section>

            <SectionDivider />

            {/* Mini Case Study */}
            <section id="case-study" className="py-24 md:py-32 bg-white">
                <div className="max-w-5xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <p className="text-sm font-medium text-neutral-400 uppercase tracking-wider mb-4">
                            Case Study
                        </p>
                        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-neutral-900">
                            Design → Detail → Delivery
                        </h2>
                    </div>

                    <div className="relative">
                        {/* Progress line for desktop */}
                        <div className="hidden lg:block absolute top-8 left-0 right-0 h-px bg-neutral-200" />

                        <div className="grid lg:grid-cols-4 gap-8">
                            {[
                                {
                                    title: 'Project Context',
                                    content: 'Complex public-facing environment requiring clear wayfinding without visual clutter, delivered within a sensitive architectural setting.',
                                },
                                {
                                    title: 'Design Intent',
                                    content: 'Signage that sits quietly within the architecture, respects material language and proportions, and supports intuitive movement without over-signage.',
                                },
                                {
                                    title: 'Technical Resolution',
                                    content: 'Material-appropriate details, fixing methods protecting finishes, coordination with façade, interior and MEP packages, technical drawings aligned with architectural set.',
                                },
                                {
                                    title: 'Delivery',
                                    content: 'Fabrication followed approved details, installation aligned with site sequencing, no design compromise during value-engineering, final installation matched original intent.',
                                },
                            ].map((item, i) => (
                                <div key={i} className="relative group">
                                    {/* Number marker */}
                                    <div className="relative z-10 mb-6 flex lg:justify-center">
                                        <div className="w-16 h-16 bg-neutral-900 text-white rounded-full flex items-center justify-center text-xl font-bold group-hover:scale-110 transition-transform duration-300">
                                            {String(i + 1).padStart(2, '0')}
                                        </div>
                                    </div>

                                    <h3 className="text-lg font-semibold text-neutral-900 mb-3 lg:text-center">
                                        {item.title}
                                    </h3>
                                    <p className="text-sm text-neutral-600 lg:text-center">
                                        {item.content}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Key Takeaway */}
                    <div className="mt-16">
                        <div className="bg-neutral-900 text-white p-8 md:p-12 rounded-[var(--radius-lg)]">
                            <p className="text-sm font-medium text-neutral-400 uppercase tracking-wider mb-4">
                                Key Takeaway
                            </p>
                            <p className="text-xl md:text-2xl font-medium">
                                Early technical resolution protects design quality and avoids downstream compromise.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Materials & Detail Reference Sheet */}
            <section id="materials" className="py-24 md:py-32 bg-neutral-50">
                <div className="max-w-5xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <p className="text-sm font-medium text-neutral-400 uppercase tracking-wider mb-4">
                            Reference
                        </p>
                        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-neutral-900 mb-6">
                            Materials & Detail Reference Sheet
                        </h2>
                        <p className="text-lg text-neutral-600 max-w-2xl mx-auto">
                            A quick reference for how signage can be integrated cleanly within architectural environments.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-8">
                        {/* Materials */}
                        <div className="bg-white p-8 rounded-[var(--radius-lg)] border border-neutral-200 hover:shadow-lg transition-shadow duration-500">
                            <h3 className="text-lg font-semibold text-neutral-900 mb-6 pb-4 border-b border-neutral-100">
                                Typical Materials
                            </h3>
                            <ul className="space-y-3">
                                {[
                                    'Powder-coated steel',
                                    'Stainless steel (brushed or bead-blasted)',
                                    'Brass / bronze (natural or patinated)',
                                    'Aluminium (anodised or coated)',
                                    'Timber and composite interfaces',
                                    'Stone and masonry-compatible systems',
                                ].map((item, i) => (
                                    <BulletItem key={i} variant="light">{item}</BulletItem>
                                ))}
                            </ul>
                        </div>

                        {/* Fixing Principles */}
                        <div className="bg-white p-8 rounded-[var(--radius-lg)] border border-neutral-200 hover:shadow-lg transition-shadow duration-500">
                            <h3 className="text-lg font-semibold text-neutral-900 mb-6 pb-4 border-b border-neutral-100">
                                Fixing Principles
                            </h3>
                            <ul className="space-y-3">
                                {[
                                    'Concealed fixings where possible',
                                    'Face-fix only where architecturally appropriate',
                                    'Stand-off systems to protect façades',
                                    'Freestanding elements to avoid fabric impact',
                                    'Removable systems for maintenance and future change',
                                ].map((item, i) => (
                                    <BulletItem key={i} variant="light">{item}</BulletItem>
                                ))}
                            </ul>
                        </div>

                        {/* Illumination */}
                        <div className="bg-white p-8 rounded-[var(--radius-lg)] border border-neutral-200 hover:shadow-lg transition-shadow duration-500">
                            <h3 className="text-lg font-semibold text-neutral-900 mb-6 pb-4 border-b border-neutral-100">
                                Illumination
                            </h3>
                            <ul className="space-y-3">
                                {[
                                    'Discreet halo or edge illumination',
                                    'Low-glare, low-maintenance LED systems',
                                    'Integrated power routing coordinated with MEP',
                                    'No illumination where it detracts from the architecture',
                                ].map((item, i) => (
                                    <BulletItem key={i} variant="light">{item}</BulletItem>
                                ))}
                            </ul>
                        </div>

                        {/* Performance */}
                        <div className="bg-white p-8 rounded-[var(--radius-lg)] border border-neutral-200 hover:shadow-lg transition-shadow duration-500">
                            <h3 className="text-lg font-semibold text-neutral-900 mb-6 pb-4 border-b border-neutral-100">
                                Performance Considerations
                            </h3>
                            <ul className="space-y-3">
                                {[
                                    'Durability in high-traffic environments',
                                    'Ease of maintenance and replacement',
                                    'Planning and conservation sensitivity',
                                    'Long-term visual consistency',
                                ].map((item, i) => (
                                    <BulletItem key={i} variant="light">{item}</BulletItem>
                                ))}
                            </ul>
                        </div>
                    </div>

                    {/* Final Note */}
                    <div className="mt-12 text-center">
                        <p className="text-lg md:text-xl text-neutral-600 italic max-w-3xl mx-auto">
                            Good signage doesn&apos;t draw attention to itself — it supports clarity, movement and identity while allowing the architecture to lead.
                        </p>
                    </div>
                </div>
            </section>

            {/* Onboarding Wizard */}
            <section id="enquire" className="py-24 md:py-32 bg-white scroll-mt-16">
                <div className="max-w-2xl mx-auto px-6">
                    <div className="text-center mb-12">
                        <p className="text-sm font-medium text-neutral-400 uppercase tracking-wider mb-4">
                            Start a Conversation
                        </p>
                        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-neutral-900 mb-4">
                            Get in Touch
                        </h2>
                        <p className="text-lg text-neutral-600">
                            Tell us about your project and how we can support your design team.
                        </p>
                    </div>

                    {isComplete ? (
                        <StepConfirmation data={getValues()} />
                    ) : (
                        <>
                            {/* Wizard Progress */}
                            <WizardProgress
                                currentStep={currentStep}
                                totalSteps={3}
                                stepLabels={STEP_LABELS}
                            />

                            {/* Form Card */}
                            <form onSubmit={handleSubmit(onSubmit)}>
                                <div className="bg-white border border-neutral-200 rounded-[var(--radius-lg)] p-6 md:p-10 shadow-sm">
                                    {renderStep()}

                                    {/* Error Display */}
                                    {submitError && (
                                        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-[var(--radius-md)] text-red-700 text-sm">
                                            {submitError}
                                        </div>
                                    )}

                                    {/* Navigation */}
                                    <div className="flex items-center justify-between mt-10 pt-8 border-t border-neutral-100">
                                        <button
                                            type="button"
                                            onClick={handleBack}
                                            disabled={currentStep === 0}
                                            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-[var(--radius-sm)] transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black ${currentStep === 0
                                                    ? 'text-neutral-300 cursor-not-allowed'
                                                    : 'text-neutral-600 hover:text-black hover:bg-neutral-50'
                                                }`}
                                        >
                                            ← Back
                                        </button>

                                        <div className="flex items-center gap-4">
                                            <span className="text-sm text-neutral-400 hidden sm:block">
                                                Step {currentStep + 1} of 3
                                            </span>
                                            <button
                                                type="button"
                                                onClick={handleNext}
                                                disabled={isSubmitting}
                                                className="btn-primary min-w-[140px] py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-black hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
                                            >
                                                {isSubmitting ? (
                                                    <span className="flex items-center gap-2">
                                                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                        </svg>
                                                        Submitting...
                                                    </span>
                                                ) : currentStep === 2 ? (
                                                    'Submit Enquiry'
                                                ) : (
                                                    'Next →'
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </>
                    )}
                </div>
            </section>
        </div>
    );
}
