import { DIGITAL_PACKAGES, formatPrice } from '@/lib/offers/onesignDigital';
import { PackageCard } from '../components/PackageCard';
import Link from 'next/link';

export const metadata = {
    title: 'Compare Growth Packages | OneSign Digital',
    description: 'Compare Launch, Scale, and Dominate packages. Clear pricing, terms, and deliverables.',
};

export default function PackagesPage() {
    return (
        <div>
            {/* Header */}
            <section className="py-16 md:py-20 bg-neutral-50 border-b border-neutral-200">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="max-w-2xl">
                        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-neutral-900 mb-4">
                            Growth Packages
                        </h1>
                        <p className="text-lg text-neutral-600">
                            Three tiers designed for different stages of growth. Each package includes managed advertising, creative production, and lead delivery.
                        </p>
                    </div>
                </div>
            </section>

            {/* Packages Grid */}
            <section className="py-16 md:py-20">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {DIGITAL_PACKAGES.map((pkg) => (
                            <div key={pkg.id} id={pkg.id} className="scroll-mt-20">
                                <PackageCard pkg={pkg} variant="full" />
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Individual Package Deep Dives - PDF Ready Sections */}
            {DIGITAL_PACKAGES.map((pkg, index) => (
                <section
                    key={pkg.id}
                    className={`py-16 md:py-20 ${index % 2 === 0 ? 'bg-neutral-50' : 'bg-white'} border-t border-neutral-200`}
                >
                    <div className="max-w-4xl mx-auto px-6">
                        {/* Package Header */}
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-10">
                            <div>
                                {pkg.isRecommended && (
                                    <span className="inline-block bg-black text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-3">
                                        Most Popular
                                    </span>
                                )}
                                <h2 className="text-3xl font-bold uppercase tracking-tight text-neutral-900">
                                    {pkg.name}
                                </h2>
                                <p className="text-lg text-neutral-600 mt-2 max-w-lg">
                                    {pkg.positioningLine}
                                </p>
                            </div>
                            <div className="md:text-right shrink-0">
                                <div className="flex items-baseline gap-1 md:justify-end">
                                    <span className="text-4xl font-bold text-neutral-900">
                                        {formatPrice(pkg.price)}
                                    </span>
                                    <span className="text-neutral-500">{pkg.priceSuffix}</span>
                                </div>
                                <p className="text-sm text-neutral-500 mt-1">{pkg.term} minimum term</p>
                            </div>
                        </div>

                        {/* Key Details */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                            <div className="bg-white border border-neutral-200 rounded-[var(--radius-md)] p-5">
                                <p className="text-sm text-neutral-500 mb-1">Monthly Investment</p>
                                <p className="text-xl font-bold text-neutral-900">
                                    {formatPrice(pkg.price)}
                                </p>
                            </div>
                            <div className="bg-white border border-neutral-200 rounded-[var(--radius-md)] p-5">
                                <p className="text-sm text-neutral-500 mb-1">Commitment</p>
                                <p className="text-xl font-bold text-neutral-900">{pkg.term}</p>
                            </div>
                            <div className="bg-white border border-neutral-200 rounded-[var(--radius-md)] p-5">
                                <p className="text-sm text-neutral-500 mb-1">Ad Spend Included</p>
                                <p className="text-xl font-bold text-neutral-900">{pkg.adSpendIncluded}</p>
                            </div>
                        </div>

                        {/* Deliverables */}
                        <div className="bg-white border border-neutral-200 rounded-[var(--radius-md)] p-6 md:p-8">
                            <h3 className="text-lg font-semibold text-neutral-900 mb-6">What&apos;s Included</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {pkg.deliverables.map((item, idx) => (
                                    <div
                                        key={idx}
                                        className={`flex items-start gap-3 ${item.isBold ? 'md:col-span-2 bg-neutral-50 p-3 rounded-[var(--radius-sm)] -mx-3' : ''}`}
                                    >
                                        <span className="text-black font-bold shrink-0 mt-0.5">✓</span>
                                        <span className={`text-sm ${item.isBold ? 'font-semibold text-black' : 'text-neutral-700'}`}>
                                            {item.text}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* CTA */}
                        <div className="mt-8 flex flex-wrap gap-4">
                            <Link
                                href="/growth/enquire"
                                className={pkg.isRecommended ? 'btn-primary' : 'btn-secondary'}
                            >
                                Get Started with {pkg.name}
                            </Link>
                            <Link
                                href="/growth/accelerators"
                                className="text-sm font-medium text-neutral-600 hover:text-black transition-colors flex items-center gap-1"
                            >
                                Add accelerators →
                            </Link>
                        </div>
                    </div>
                </section>
            ))}

            {/* Bottom CTA */}
            <section className="py-16 bg-black text-white">
                <div className="max-w-4xl mx-auto px-6 text-center">
                    <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-4">
                        Not Sure Which Package?
                    </h2>
                    <p className="text-neutral-400 mb-8 max-w-xl mx-auto">
                        Talk to our team about your goals and we&apos;ll recommend the right fit for your business.
                    </p>
                    <Link
                        href="/growth/enquire"
                        className="inline-flex items-center justify-center px-8 py-3 text-sm font-medium bg-white text-black rounded-[var(--radius-sm)] hover:bg-neutral-100 transition-colors"
                    >
                        Start Your Enquiry
                    </Link>
                </div>
            </section>
        </div>
    );
}
