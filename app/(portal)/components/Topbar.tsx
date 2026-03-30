'use client';

import { useState } from 'react';
import { User, LogOut, ChevronDown, Settings, Menu } from 'lucide-react';
import Link from 'next/link';
import type { Org } from '@/lib/supabase';
import { useSidebar } from './SidebarContext';

interface TopbarProps {
    org: Org;
    isAdmin?: boolean;
}

export function Topbar({ org, isAdmin }: TopbarProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const { openMobile } = useSidebar();

    async function handleLogout() {
        // Call server action to sign out
        const response = await fetch('/api/auth/logout', { method: 'POST' });
        if (response.ok) {
            window.location.href = '/login';
        }
    }

    return (
        <header className="h-14 bg-white border-b border-neutral-200 flex items-center justify-between px-4 md:px-6">
            {/* Left: hamburger (mobile) + org name */}
            <div className="flex items-center gap-2">
                <button
                    onClick={openMobile}
                    className="md:hidden p-1.5 -ml-1 text-neutral-500 hover:text-neutral-700 transition-colors"
                    aria-label="Open menu"
                >
                    <Menu size={20} />
                </button>
                <span className="text-sm font-medium text-neutral-900 truncate max-w-[160px] sm:max-w-none">{org.name}</span>
                <span className="badge text-xs hidden sm:inline-flex">{isAdmin ? 'admin' : 'client portal'}</span>
            </div>

            {/* User menu */}
            <div className="relative">
                <button
                    onClick={() => setMenuOpen(!menuOpen)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-sm)] text-sm text-neutral-600 hover:bg-neutral-100 transition-colors"
                >
                    <div className="w-7 h-7 rounded-full bg-neutral-200 flex items-center justify-center">
                        <User size={14} className="text-neutral-500" />
                    </div>
                    <ChevronDown size={14} className={`transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
                </button>

                {menuOpen && (
                    <>
                        {/* Backdrop */}
                        <div
                            className="fixed inset-0 z-10"
                            onClick={() => setMenuOpen(false)}
                        />

                        {/* Dropdown */}
                        <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-neutral-200 rounded-[var(--radius-md)] shadow-lg z-20 py-1">
                            <Link
                                href="/settings"
                                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50 transition-colors"
                                onClick={() => setMenuOpen(false)}
                            >
                                <Settings size={14} />
                                <span>Settings</span>
                            </Link>
                            <button
                                onClick={handleLogout}
                                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50 transition-colors"
                            >
                                <LogOut size={14} />
                                <span>Sign out</span>
                            </button>
                        </div>
                    </>
                )}
            </div>
        </header>
    );
}
