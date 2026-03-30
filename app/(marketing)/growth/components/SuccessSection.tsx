'use client';

import { Icon } from '@/lib/icons';

const successCriteria = [
    {
        icon: 'Time' as const,
        title: 'Explain in Under 2 Minutes',
        description: 'A salesperson can walk through the service clearly and confidently.',
    },
    {
        icon: 'Leads' as const,
        title: 'Self-Selling Pages',
        description: 'Point to the page and let it speak for itself—no interpretation needed.',
    },
    {
        icon: 'Growth' as const,
        title: 'Upsell Without Confusion',
        description: 'Accelerators are clear enhancements, not confusing add-ons.',
    },
    {
        icon: 'Strategy' as const,
        title: 'Position as Growth Partner',
        description: 'OneSign is positioned as a long-term partner, not a one-time supplier.',
    },
];

export function SuccessSection() {
    return (
        <section className="py-16 bg-neutral-50 border-y border-neutral-200">
            <div className="max-w-6xl mx-auto px-6">
                <div className="text-center mb-12">
                    <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-neutral-900 mb-3">
                        What Success Looks Like
                    </h2>
                    <p className="text-neutral-600 max-w-2xl mx-auto">
                        Our packages are designed as revenue tools—clarity and authority over decoration.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {successCriteria.map((item, idx) => (
                        <div
                            key={idx}
                            className="bg-white p-6 rounded-[var(--radius-md)] border border-neutral-200 shadow-sm"
                        >
                            <div className="w-12 h-12 bg-black text-white rounded-[var(--radius-sm)] flex items-center justify-center mb-4">
                                <Icon name={item.icon} size={22} />
                            </div>
                            <h3 className="font-semibold text-neutral-900 mb-2">{item.title}</h3>
                            <p className="text-sm text-neutral-600">{item.description}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
