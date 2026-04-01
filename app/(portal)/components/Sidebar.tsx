'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    LayoutGrid,
    CheckSquare,
    FolderOpen,
    FileText,
    CreditCard,
    Shield,
    ChevronLeft,
    ChevronRight,
    Building2,
    Zap,
    Calculator,
    ShoppingCart,
    DollarSign,
    Palette,
    ClipboardCheck,
    X,
} from 'lucide-react';
import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useSidebar } from './SidebarContext';

interface SidebarProps {
    isAdmin: boolean;
}

interface NavItem {
    label: string;
    href: string;
    icon: LucideIcon;
}

interface NavGroup {
    label: string;
    items: NavItem[];
}

const adminOverview: NavItem = { label: 'Overview', href: '/admin', icon: Shield };

const adminNavGroups: NavGroup[] = [
    {
        label: 'Production',
        items: [
            { label: 'Job Board', href: '/admin/jobs', icon: LayoutGrid },
            { label: 'Shop Floor', href: '/shop-floor', icon: Zap },
            { label: 'Artwork', href: '/admin/artwork', icon: ClipboardCheck },
        ],
    },
    {
        label: 'Sales',
        items: [
            { label: 'Quotes', href: '/admin/quotes', icon: Calculator },
            { label: 'Invoices', href: '/admin/invoices', icon: FileText },
            { label: 'Purchase Orders', href: '/admin/purchase-orders', icon: ShoppingCart },
            { label: 'Pricing', href: '/admin/pricing', icon: DollarSign },
        ],
    },
    {
        label: 'Clients',
        items: [
            { label: 'Clients', href: '/admin/clients', icon: Building2 },
            { label: 'Design Packs', href: '/admin/design-packs', icon: Palette },
            { label: 'Reports', href: '/admin/reports', icon: FileText },
        ],
    },
];

const clientNavItems: NavItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Deliverables', href: '/deliverables', icon: CheckSquare },
    { label: 'Assets', href: '/assets', icon: FolderOpen },
    { label: 'Reports', href: '/reports', icon: FileText },
    { label: 'Billing', href: '/billing', icon: CreditCard },
];

function isItemActive(pathname: string, href: string): boolean {
    if (href === '/admin') {
        return pathname === '/admin';
    }
    return pathname === href || pathname.startsWith(href + '/');
}

export function Sidebar({ isAdmin }: SidebarProps) {
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);
    const { mobileOpen, closeMobile } = useSidebar();

    const homeHref = isAdmin ? '/admin' : '/dashboard';

    const sidebarContent = (
        <>
            {/* Navigation */}
            <nav className="flex-1 py-4 px-2 overflow-y-auto">
                {isAdmin ? (
                    <>
                        {/* Admin Overview */}
                        <NavLink
                            item={adminOverview}
                            isActive={isItemActive(pathname, adminOverview.href)}
                            collapsed={collapsed}
                            onNavigate={closeMobile}
                        />

                        {/* Admin Nav Groups */}
                        {adminNavGroups.map((group) => (
                            <div key={group.label} className="mt-4">
                                {!collapsed && (
                                    <div className="px-3 py-1 text-[10px] font-semibold text-neutral-400 uppercase tracking-widest">
                                        {group.label}
                                    </div>
                                )}
                                <ul className="space-y-0.5">
                                    {group.items.map((item) => (
                                        <li key={item.href}>
                                            <NavLink
                                                item={item}
                                                isActive={isItemActive(pathname, item.href)}
                                                collapsed={collapsed}
                                                onNavigate={closeMobile}
                                            />
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}

                        {/* Separator */}
                        <div className="my-4 mx-2 border-t border-neutral-200" />

                        {/* Client View section */}
                        {!collapsed && (
                            <div className="px-3 py-1 text-[10px] font-semibold text-neutral-400 uppercase tracking-widest">
                                Client View
                            </div>
                        )}
                        <ul className="space-y-0.5">
                            {clientNavItems.map((item) => (
                                <li key={item.href}>
                                    <NavLink
                                        item={item}
                                        isActive={isItemActive(pathname, item.href)}
                                        collapsed={collapsed}
                                        muted
                                        onNavigate={closeMobile}
                                    />
                                </li>
                            ))}
                        </ul>
                    </>
                ) : (
                    /* Client-only view */
                    <ul className="space-y-1">
                        {clientNavItems.map((item) => (
                            <li key={item.href}>
                                <NavLink
                                    item={item}
                                    isActive={isItemActive(pathname, item.href)}
                                    collapsed={collapsed}
                                    onNavigate={closeMobile}
                                />
                            </li>
                        ))}
                    </ul>
                )}
            </nav>

            {/* Footer */}
            {!collapsed && (
                <div className="p-4 border-t border-neutral-100">
                    <p className="text-xs text-neutral-400">
                        &copy; {new Date().getFullYear()} OneSign
                    </p>
                </div>
            )}
        </>
    );

    return (
        <>
            {/* Desktop sidebar - hidden on mobile */}
            <aside
                className={`
                    hidden md:flex bg-white border-r border-neutral-200 flex-col
                    transition-all duration-200 ease-in-out
                    ${collapsed ? 'w-16' : 'w-56'}
                `}
            >
                {/* Logo + collapse toggle */}
                <div className="h-14 flex items-center justify-between px-4 border-b border-neutral-100">
                    <Link href={homeHref} className="flex items-center">
                        {collapsed ? (
                            <img src="/onesign-icon.svg" alt="OneSign" className="h-6" />
                        ) : (
                            <img src="/logo-black.svg" alt="OneSign" className="h-5" />
                        )}
                    </Link>
                    <button
                        onClick={() => setCollapsed(!collapsed)}
                        className="p-1 text-neutral-400 hover:text-neutral-600 transition-colors"
                        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                    </button>
                </div>

                {sidebarContent}
            </aside>

            {/* Mobile sidebar overlay */}
            {mobileOpen && (
                <div className="fixed inset-0 z-40 md:hidden">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/40 transition-opacity"
                        onClick={closeMobile}
                    />

                    {/* Drawer */}
                    <aside className="relative w-72 max-w-[85vw] h-full bg-white shadow-xl flex flex-col animate-slide-in">
                        {/* Logo + close */}
                        <div className="h-14 flex items-center justify-between px-4 border-b border-neutral-100">
                            <Link href={homeHref} className="flex items-center" onClick={closeMobile}>
                                <img src="/logo-black.svg" alt="OneSign" className="h-5" />
                            </Link>
                            <button
                                onClick={closeMobile}
                                className="p-1 text-neutral-400 hover:text-neutral-600 transition-colors"
                                aria-label="Close menu"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Reuse the same nav content, never collapsed on mobile */}
                        <nav className="flex-1 py-4 px-2 overflow-y-auto">
                            {isAdmin ? (
                                <>
                                    <NavLink
                                        item={adminOverview}
                                        isActive={isItemActive(pathname, adminOverview.href)}
                                        collapsed={false}
                                        onNavigate={closeMobile}
                                    />

                                    {adminNavGroups.map((group) => (
                                        <div key={group.label} className="mt-4">
                                            <div className="px-3 py-1 text-[10px] font-semibold text-neutral-400 uppercase tracking-widest">
                                                {group.label}
                                            </div>
                                            <ul className="space-y-0.5">
                                                {group.items.map((item) => (
                                                    <li key={item.href}>
                                                        <NavLink
                                                            item={item}
                                                            isActive={isItemActive(pathname, item.href)}
                                                            collapsed={false}
                                                            onNavigate={closeMobile}
                                                        />
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ))}

                                    <div className="my-4 mx-2 border-t border-neutral-200" />

                                    <div className="px-3 py-1 text-[10px] font-semibold text-neutral-400 uppercase tracking-widest">
                                        Client View
                                    </div>
                                    <ul className="space-y-0.5">
                                        {clientNavItems.map((item) => (
                                            <li key={item.href}>
                                                <NavLink
                                                    item={item}
                                                    isActive={isItemActive(pathname, item.href)}
                                                    collapsed={false}
                                                    muted
                                                    onNavigate={closeMobile}
                                                />
                                            </li>
                                        ))}
                                    </ul>
                                </>
                            ) : (
                                <ul className="space-y-1">
                                    {clientNavItems.map((item) => (
                                        <li key={item.href}>
                                            <NavLink
                                                item={item}
                                                isActive={isItemActive(pathname, item.href)}
                                                collapsed={false}
                                                onNavigate={closeMobile}
                                            />
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </nav>

                        <div className="p-4 border-t border-neutral-100">
                            <p className="text-xs text-neutral-400">
                                &copy; {new Date().getFullYear()} OneSign
                            </p>
                        </div>
                    </aside>
                </div>
            )}
        </>
    );
}

function NavLink({
    item,
    isActive,
    collapsed,
    muted,
    onNavigate,
}: {
    item: NavItem;
    isActive: boolean;
    collapsed: boolean;
    muted?: boolean;
    onNavigate?: () => void;
}) {
    const Icon = item.icon;

    const baseClasses = 'flex items-center gap-3 px-3 py-2 rounded-[var(--radius-sm)] text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black';

    let stateClasses: string;
    if (isActive) {
        stateClasses = 'bg-black text-white';
    } else if (muted) {
        stateClasses = 'text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600';
    } else {
        stateClasses = 'text-neutral-600 hover:bg-neutral-100 hover:text-black';
    }

    return (
        <Link
            href={item.href}
            className={`${baseClasses} ${stateClasses} ${collapsed ? 'justify-center' : ''}`}
            title={collapsed ? item.label : undefined}
            onClick={onNavigate}
        >
            <Icon size={18} />
            {!collapsed && <span>{item.label}</span>}
        </Link>
    );
}
