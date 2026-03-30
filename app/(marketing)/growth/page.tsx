import { DIGITAL_PACKAGES } from '@/lib/offers/onesignDigital';
import { PackageCard } from './components/PackageCard';
import { SuccessSection } from './components/SuccessSection';
import { Icon } from '@/lib/icons';
import Link from 'next/link';

export const metadata = {
    title: 'Digital Growth Packages | OneSign',
    description: 'Productised digital growth services: Launch, Scale, Dominate. Generate leads, increase enquiries, and grow your business.',
};

export default function GrowthOverviewPage() {
    return (
        <div>
            {/* Hero Section */}
            <section className="py-20 md:py-28 bg-gradient-to-b from-neutral-50 to-white">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="max-w-3xl">
                        <p className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-4">
                            Digital Growth Services
                        </p>
                        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-neutral-900 mb-6">
                            Generate Leads.<br />
                            Grow Revenue.
                        </h1>
                        <p className="text-lg md:text-xl text-neutral-600 mb-8 max-w-2xl">
                            Productised digital growth packages designed for businesses that want measurable results. Validate demand, scale enquiries, or dominate your market.
                        </p>
                        <div className="flex flex-wrap gap-4">
                            <Link href="/growth/packages" className="btn-primary">
                                View Packages
                            </Link>
                            <Link href="/growth/enquire" className="btn-secondary">
                                Get Started
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* Package Previews */}
            <section className="py-20">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="flex items-end justify-between mb-10">
                        <div>
                            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-neutral-900 mb-2">
                                Choose Your Growth Path
                            </h2>
                            <p className="text-neutral-600">
                                Three packages. Clear outcomes. No complexity.
                            </p>
                        </div>
                        <Link
                            href="/growth/packages"
                            className="hidden md:flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-black transition-colors"
                        >
                            Compare all packages →
                        </Link>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {DIGITAL_PACKAGES.map((pkg) => (
                            <PackageCard key={pkg.id} pkg={pkg} variant="compact" />
                        ))}
                    </div>

                    <div className="mt-6 text-center md:hidden">
                        <Link
                            href="/growth/packages"
                            className="text-sm font-medium text-neutral-600 hover:text-black transition-colors"
                        >
                            Compare all packages →
                        </Link>
                    </div>
                </div>
            </section>

            {/* Value Props */}
            <section className="py-20 border-t border-neutral-200">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div className="flex gap-4">
                            <div className="shrink-0 w-12 h-12 bg-neutral-100 rounded-[var(--radius-sm)] flex items-center justify-center">
                                <Icon name="Ads" size={22} />
                            </div>
                            <div>
                                <h3 className="font-semibold text-neutral-900 mb-1">Managed Advertising</h3>
                                <p className="text-sm text-neutral-600">
                                    Facebook, Instagram, LinkedIn & Google ads—fully managed with included spend.
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <div className="shrink-0 w-12 h-12 bg-neutral-100 rounded-[var(--radius-sm)] flex items-center justify-center">
                                <Icon name="Content" size={22} />
                            </div>
                            <div>
                                <h3 className="font-semibold text-neutral-900 mb-1">Creative Production</h3>
                                <p className="text-sm text-neutral-600">
                                    Video-first creatives, copywriting, and ongoing testing included.
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <div className="shrink-0 w-12 h-12 bg-neutral-100 rounded-[var(--radius-sm)] flex items-center justify-center">
                                <Icon name="Leads" size={22} />
                            </div>
                            <div>
                                <h3 className="font-semibold text-neutral-900 mb-1">Lead Delivery</h3>
                                <p className="text-sm text-neutral-600">
                                    Qualified leads delivered directly—email, phone, and CRM integrations.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Success Section */}
            <SuccessSection />

            {/* Accelerators Preview */}
            <section className="py-20">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="bg-neutral-900 rounded-[var(--radius-lg)] p-8 md:p-12 text-white">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div>
                                <p className="text-neutral-400 text-sm font-medium uppercase tracking-wider mb-2">
                                    Enhance Your Package
                                </p>
                                <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-2">
                                    Optional Growth Accelerators
                                </h2>
                                <p className="text-neutral-400 max-w-xl">
                                    Add video content, landing pages, CRM automation, and more. Modular enhancements that scale with your needs.
                                </p>
                            </div>
                            <Link
                                href="/growth/accelerators"
                                className="shrink-0 inline-flex items-center justify-center px-6 py-3 text-sm font-medium bg-white text-black rounded-[var(--radius-sm)] hover:bg-neutral-100 transition-colors"
                            >
                                View Accelerators
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* Final CTA */}
            <section className="py-20 bg-neutral-50 border-t border-neutral-200">
                <div className="max-w-3xl mx-auto px-6 text-center">
                    <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-neutral-900 mb-4">
                        Ready to Start Growing?
                    </h2>
                    <p className="text-neutral-600 mb-8">
                        Get in touch to discuss which package is right for your business.
                    </p>
                    <Link href="/growth/enquire" className="btn-primary">
                        Start Your Enquiry
                    </Link>
                </div>
            </section>
        </div>
    );
}
