
import React from 'react';
import { DIGITAL_PACKAGES, ACCELERATORS } from '@/lib/offers/onesignDigital';

export default function ComponentGallery() {
    return (
        <div className="min-h-screen bg-neutral-50 p-12 space-y-16 font-sans">

            {/* Header Section */}
            <section className="space-y-4 max-w-4xl mx-auto text-center">
                <h1 className="text-4xl font-bold tracking-tight text-neutral-900">Component Gallery</h1>
                <p className="text-neutral-500 max-w-2xl mx-auto">
                    Design system tokens and components for OneSign Digital.
                    Focus: Structure, simplicity, authority.
                </p>
            </section>

            <hr className="border-neutral-200 max-w-4xl mx-auto" />

            {/* Buttons */}
            <section className="space-y-6 max-w-4xl mx-auto">
                <h2 className="text-2xl font-semibold text-neutral-900 border-l-4 border-black pl-4">Interactive Elements</h2>
                <div className="bg-white p-8 rounded-lg border border-neutral-200 shadow-sm space-y-8">

                    <div className="space-y-4">
                        <h3 className="text-sm uppercase tracking-wider font-semibold text-neutral-400">Buttons</h3>
                        <div className="flex gap-4 items-center flex-wrap">
                            <button className="btn-primary">Primary Action</button>
                            <button className="btn-secondary">Secondary Action</button>
                            <button className="btn-primary opacity-50 cursor-not-allowed">Disabled</button>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-sm uppercase tracking-wider font-semibold text-neutral-400">Badges & Chips</h3>
                        <div className="flex gap-4 items-center">
                            <span className="badge">New Client</span>
                            <span className="badge bg-black text-white border-black">Recommended</span>
                            <span className="badge bg-green-50 text-green-700 border-green-200">Active</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Package Tiles (Data Driven) */}
            <section className="space-y-6 max-w-6xl mx-auto">
                <h2 className="text-2xl font-semibold text-neutral-900 border-l-4 border-black pl-4">Core Packages (Data-Driven)</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {DIGITAL_PACKAGES.map((pkg) => (
                        <div key={pkg.id} className={`card-base flex flex-col relative ${pkg.isRecommended ? 'ring-2 ring-black shadow-lg' : ''}`}>
                            {pkg.isRecommended && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-black text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">
                                    Most Popular
                                </div>
                            )}

                            <div className="mb-6 space-y-2">
                                <h3 className="text-xl font-bold uppercase tracking-tight">{pkg.name}</h3>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-3xl font-bold">£{pkg.price.toLocaleString()}</span>
                                    <span className="text-neutral-500 text-sm">{pkg.priceSuffix}</span>
                                </div>
                                <p className="text-sm text-neutral-600 font-medium border-b border-neutral-100 pb-4">
                                    {pkg.term} term
                                </p>
                                <p className="text-xs text-neutral-400">
                                    Ad Spend: <span className="font-semibold text-neutral-700">{pkg.adSpendIncluded}</span>
                                </p>
                            </div>

                            <div className="mb-8">
                                <p className="text-sm italic text-neutral-600 bg-neutral-50 p-3 rounded border border-neutral-100">
                                    &quot;{pkg.positioningLine}&quot;
                                </p>
                            </div>

                            <ul className="space-y-3 mb-8 flex-1">
                                {pkg.deliverables.map((item, idx) => (
                                    <li key={idx} className="flex gap-3 text-sm text-neutral-700">
                                        <span className="text-black font-bold shrink-0">✓</span>
                                        <span className={item.isBold ? 'font-semibold text-black' : ''}>
                                            {item.text}
                                        </span>
                                    </li>
                                ))}
                            </ul>

                            <button className={`w-full ${pkg.isRecommended ? 'btn-primary' : 'btn-secondary'}`}>
                                Select {pkg.name}
                            </button>
                        </div>
                    ))}
                </div>
            </section>

            {/* Accelerators Grid */}
            <section className="space-y-6 max-w-4xl mx-auto">
                <h2 className="text-2xl font-semibold text-neutral-900 border-l-4 border-black pl-4">Growth Accelerators</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {ACCELERATORS.map((category, idx) => (
                        <div key={idx} className="space-y-4">
                            <h3 className="font-bold text-lg text-neutral-900 border-b border-neutral-200 pb-2">{category.title}</h3>
                            <div className="grid gap-3">
                                {category.items.map((item, i) => (
                                    <div key={i} className="bg-white border border-neutral-200 p-4 rounded-md flex justify-between items-start hover:border-black transition-colors cursor-pointer group">
                                        <div>
                                            <h4 className="font-medium text-sm group-hover:text-black transition-colors">{item.title}</h4>
                                            {item.description && <p className="text-xs text-neutral-500 mt-1">{item.description}</p>}
                                        </div>
                                        <span className="text-sm font-bold whitespace-nowrap bg-neutral-50 px-2 py-1 rounded">{item.price}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </section>

        </div>
    );
}
