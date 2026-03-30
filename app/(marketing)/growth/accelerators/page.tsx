import { ACCELERATORS } from '@/lib/offers/onesignDigital';
import { AcceleratorTile } from '../components/AcceleratorTile';
import Link from 'next/link';

export const metadata = {
    title: 'Growth Accelerators | OneSign Digital',
    description: 'Optional growth accelerators: video content, landing pages, CRM automation, and more.',
};

export default function AcceleratorsPage() {
    return (
        <div>
            {/* Header */}
            <section className="py-12 md:py-16 bg-neutral-50 border-b border-neutral-200">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="max-w-2xl">
                        <p className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-3">
                            Enhance Your Package
                        </p>
                        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-neutral-900 mb-4">
                            Optional Growth Accelerators
                        </h1>
                        <p className="text-lg text-neutral-600">
                            Modular enhancements that amplify your growth package. Add video content, conversion optimization, CRM automation, and more.
                        </p>
                    </div>
                </div>
            </section>

            {/* Accelerators by Category */}
            <section className="py-16 md:py-20">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                        {ACCELERATORS.map((category, idx) => (
                            <div key={idx}>
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-1 h-6 bg-black rounded-full" />
                                    <h2 className="text-xl font-bold text-neutral-900">
                                        {category.title}
                                    </h2>
                                </div>
                                <div className="space-y-4">
                                    {category.items.map((item, i) => (
                                        <AcceleratorTile key={i} item={item} />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* How It Works */}
            <section className="py-16 bg-neutral-50 border-t border-neutral-200">
                <div className="max-w-4xl mx-auto px-6">
                    <h2 className="text-2xl font-bold tracking-tight text-neutral-900 mb-8 text-center">
                        How Accelerators Work
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div className="text-center">
                            <div className="w-12 h-12 bg-black text-white rounded-full flex items-center justify-center mx-auto mb-4 text-lg font-bold">
                                1
                            </div>
                            <h3 className="font-semibold text-neutral-900 mb-2">Choose Your Base</h3>
                            <p className="text-sm text-neutral-600">
                                Select a growth package that fits your stage.
                            </p>
                        </div>
                        <div className="text-center">
                            <div className="w-12 h-12 bg-black text-white rounded-full flex items-center justify-center mx-auto mb-4 text-lg font-bold">
                                2
                            </div>
                            <h3 className="font-semibold text-neutral-900 mb-2">Add Accelerators</h3>
                            <p className="text-sm text-neutral-600">
                                Enhance with modular add-ons as needed.
                            </p>
                        </div>
                        <div className="text-center">
                            <div className="w-12 h-12 bg-black text-white rounded-full flex items-center justify-center mx-auto mb-4 text-lg font-bold">
                                3
                            </div>
                            <h3 className="font-semibold text-neutral-900 mb-2">Scale Over Time</h3>
                            <p className="text-sm text-neutral-600">
                                Add or remove accelerators as you grow.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className="py-16">
                <div className="max-w-4xl mx-auto px-6">
                    <div className="bg-neutral-900 rounded-[var(--radius-lg)] p-8 md:p-12 text-white text-center">
                        <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-4">
                            Ready to Build Your Package?
                        </h2>
                        <p className="text-neutral-400 mb-8 max-w-xl mx-auto">
                            Start with a base package and customize with the accelerators that matter most to your business.
                        </p>
                        <div className="flex flex-wrap justify-center gap-4">
                            <Link
                                href="/growth/packages"
                                className="btn-secondary"
                            >
                                View Packages
                            </Link>
                            <Link
                                href="/growth/enquire"
                                className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium bg-white text-black rounded-[var(--radius-sm)] hover:bg-neutral-100 transition-colors"
                            >
                                Start Your Enquiry
                            </Link>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
