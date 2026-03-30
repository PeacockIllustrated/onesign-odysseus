'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';

const navItems = [
    { label: 'Overview', href: '/growth' },
    { label: 'Packages', href: '/growth/packages' },
    { label: 'Accelerators', href: '/growth/accelerators' },
    { label: 'Enquire', href: '/growth/enquire' },
];

export function SectionNav() {
    const pathname = usePathname();
    const [mobileOpen, setMobileOpen] = useState(false);

    return (
        <>
            {/* Desktop Nav - Sticky */}
            <nav className="hidden md:block sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-neutral-200">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="flex items-center justify-between h-14">
                        <Link href="/growth" className="flex items-center">
                            <img src="/logo-black.svg" alt="OneSign" className="h-6" />
                        </Link>
                        <div className="flex items-center gap-1">
                            {navItems.map((item) => (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`
                                        px-4 py-2 text-sm font-medium rounded-[var(--radius-sm)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black
                                        ${pathname === item.href
                                            ? 'bg-black text-white'
                                            : 'text-neutral-600 hover:text-black hover:bg-neutral-100'
                                        }
                                    `}
                                >
                                    {item.label}
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>
            </nav>

            {/* Mobile Nav - Collapsible */}
            <nav className="md:hidden sticky top-0 z-50 bg-white border-b border-neutral-200">
                <div className="px-4">
                    <div className="flex items-center justify-between h-14">
                        <Link href="/growth" className="flex items-center">
                            <img src="/logo-black.svg" alt="OneSign" className="h-6" />
                        </Link>
                        <button
                            onClick={() => setMobileOpen(!mobileOpen)}
                            className="p-2 -mr-2 text-neutral-600"
                            aria-label="Toggle menu"
                        >
                            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
                        </button>
                    </div>
                </div>

                {/* Mobile Menu Dropdown */}
                {mobileOpen && (
                    <div className="border-t border-neutral-100 bg-white pb-3">
                        {navItems.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => setMobileOpen(false)}
                                className={`
                                    block px-4 py-3 text-sm font-medium transition-colors
                                    ${pathname === item.href
                                        ? 'bg-neutral-100 text-black'
                                        : 'text-neutral-600 hover:bg-neutral-50'
                                    }
                                `}
                            >
                                {item.label}
                            </Link>
                        ))}
                    </div>
                )}
            </nav>
        </>
    );
}
