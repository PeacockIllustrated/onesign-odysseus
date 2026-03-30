'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

interface SidebarContextValue {
    mobileOpen: boolean;
    openMobile: () => void;
    closeMobile: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
    const [mobileOpen, setMobileOpen] = useState(false);
    const pathname = usePathname();

    const openMobile = useCallback(() => setMobileOpen(true), []);
    const closeMobile = useCallback(() => setMobileOpen(false), []);

    // Close mobile sidebar on navigation
    useEffect(() => {
        setMobileOpen(false);
    }, [pathname]);

    // Lock body scroll when mobile sidebar is open
    useEffect(() => {
        if (mobileOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [mobileOpen]);

    return (
        <SidebarContext.Provider value={{ mobileOpen, openMobile, closeMobile }}>
            {children}
        </SidebarContext.Provider>
    );
}

export function useSidebar() {
    const ctx = useContext(SidebarContext);
    if (!ctx) throw new Error('useSidebar must be used within SidebarProvider');
    return ctx;
}
