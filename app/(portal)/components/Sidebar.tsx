'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutGrid,
    FileText,
    Shield,
    ChevronLeft,
    ChevronRight,
    Building2,
    Zap,
    Calculator,
    ShoppingCart,
    DollarSign,
    ClipboardCheck,
    Truck,
    BadgeCheck,
    Wrench,
    Inbox,
    AlertTriangle,
    Box,
    PenTool,
    Package,
    Puzzle,
    Ruler,
    Shapes,
    Store,
    X,
    CalendarDays,
    ChevronDown,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useSidebar } from './SidebarContext';

interface SidebarProps {
    /**
     * Retained for caller compatibility but no longer used — Odysseus is
     * single-tenant internal-only (CLAUDE.md §3). Every authed user gets the
     * full admin sidebar.
     */
    isAdmin?: boolean;
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

/**
 * Three groups, agreed with the office: what we're doing (Operations), what
 * we're making (Design & development), and what it's worth (Financials).
 *
 * They replace the old six-way split (Surveys / Production / Sales / Clients /
 * Inbound), which had grown to twelve items under "Production" alone and made
 * the eye scan the whole list to find anything. Items keep their previous
 * relative order inside a group so nothing moves further than it has to.
 */
const adminNavGroups: NavGroup[] = [
    {
        // The day's work: what is happening, who is doing it, where it is.
        label: 'Operations',
        items: [
            { label: 'Site Surveys', href: '/admin/site-surveys', icon: Ruler },
            { label: 'Quotes', href: '/admin/quotes', icon: Calculator },
            { label: 'Job Board', href: '/admin/jobs', icon: LayoutGrid },
            { label: 'Shop Floor', href: '/shop-floor', icon: Zap },
            { label: 'Flags', href: '/admin/flags', icon: AlertTriangle },
            { label: 'Deliveries', href: '/admin/deliveries', icon: Truck },
            { label: 'Schedule', href: '/admin/schedule', icon: CalendarDays },
            { label: 'Maintenance', href: '/admin/maintenance', icon: Wrench },
            { label: 'Reports', href: '/admin/reports', icon: FileText },
        ],
    },
    {
        // The making of the thing — the Studio tools plus the artwork and
        // approval steps that specify what gets built (CLAUDE.md §1).
        label: 'Design & development',
        items: [
            { label: 'Visualiser', href: '/admin/visualiser', icon: Box },
            { label: 'Storefront', href: '/admin/storefront', icon: Store },
            { label: 'Studio', href: '/admin/tools', icon: Shapes },
            { label: 'Nesting', href: '/admin/nesting', icon: Puzzle },
            { label: 'Artwork', href: '/admin/artwork', icon: ClipboardCheck },
            { label: 'Packs', href: '/admin/packs', icon: Package },
            { label: 'Approvals', href: '/admin/approvals', icon: BadgeCheck },
            { label: 'Design Requests', href: '/admin/design-requests', icon: PenTool },
        ],
    },
    {
        // Money in, money out, and the client records both hang off.
        label: 'Financials',
        items: [
            { label: 'Invoices', href: '/admin/invoices', icon: FileText },
            { label: 'Purchase Orders', href: '/admin/purchase-orders', icon: ShoppingCart },
            { label: 'Pricing', href: '/admin/pricing', icon: DollarSign },
            { label: 'Clients', href: '/admin/clients', icon: Building2 },
            { label: 'External Orders', href: '/admin/external-orders', icon: Inbox },
        ],
    },
];

/** Open/closed state per group, remembered per device. */
const GROUPS_STORAGE_KEY = 'odysseus-sidebar-groups';

function isItemActive(pathname: string, href: string): boolean {
    if (href === '/admin') {
        return pathname === '/admin';
    }
    return pathname === href || pathname.startsWith(href + '/');
}

export function Sidebar(_props: SidebarProps) {
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);
    const { mobileOpen, closeMobile } = useSidebar();

    // Every group starts open, so the server and the first client render agree
    // and nobody's nav is empty before the stored preference loads.
    const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
        Object.fromEntries(adminNavGroups.map((g) => [g.label, true]))
    );

    useEffect(() => {
        try {
            const saved = window.localStorage.getItem(GROUPS_STORAGE_KEY);
            if (saved) setOpenGroups((prev) => ({ ...prev, ...JSON.parse(saved) }));
        } catch {
            // Private mode, or a stored value we can no longer parse — the
            // all-open default is a fine place to be.
        }
    }, []);

    const activeGroup = adminNavGroups.find((g) =>
        g.items.some((i) => isItemActive(pathname, i.href))
    )?.label;

    // Navigating into a closed group opens it — you should always be able to
    // see where you are. It only fires when the active group changes, so
    // closing it again afterwards sticks.
    useEffect(() => {
        if (!activeGroup) return;
        setOpenGroups((prev) => (prev[activeGroup] ? prev : { ...prev, [activeGroup]: true }));
    }, [activeGroup]);

    function toggleGroup(label: string) {
        setOpenGroups((prev) => {
            const next = { ...prev, [label]: !prev[label] };
            try {
                window.localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(next));
            } catch {
                /* private mode — the session still behaves, it just won't persist */
            }
            return next;
        });
    }

    // Odysseus is single-tenant internal-only (CLAUDE.md §3). Every authed user
    // is Onesign staff; the non-admin branch no longer has its own UI.
    const homeHref = '/admin';

    const sidebarContent = (
        <>
            {/* Navigation */}
            <nav className="flex-1 py-4 px-2 overflow-y-auto">
                {/* Admin Overview */}
                <NavLink
                    item={adminOverview}
                    isActive={isItemActive(pathname, adminOverview.href)}
                    collapsed={collapsed}
                    onNavigate={closeMobile}
                />

                {/* Admin Nav Groups */}
                <NavGroups
                    pathname={pathname}
                    collapsed={collapsed}
                    openGroups={openGroups}
                    onToggleGroup={toggleGroup}
                    onNavigate={closeMobile}
                />
            </nav>

            {/* Footer */}
            {!collapsed && (
                <div className="p-4 border-t border-neutral-100 dark:border-[#223037]">
                    <p className="text-xs text-neutral-400 dark:text-neutral-500">
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
                    dark:bg-[#0f191e] dark:border-[#223037]
                    ${collapsed ? 'w-16' : 'w-56'}
                `}
            >
                {/* Logo + collapse toggle */}
                <div className="h-16 flex items-center justify-between px-4 border-b border-neutral-100 dark:border-[#223037]">
                    <Link href={homeHref} className="flex items-center">
                        {collapsed ? (
                            <>
                                <img src="/Odysseus-Icon_Black.svg" alt="Onesign Odysseus" className="h-8 w-auto dark:hidden" />
                                <img src="/Odysseus-Icon.svg" alt="Onesign Odysseus" className="h-8 w-auto hidden dark:block" />
                            </>
                        ) : (
                            <>
                                <img src="/Odysseus-Logo-Black.svg" alt="Onesign Odysseus" className="h-9 w-auto dark:hidden" />
                                <img src="/Odysseus-Logo.svg" alt="Onesign Odysseus" className="h-9 w-auto hidden dark:block" />
                            </>
                        )}
                    </Link>
                    <button
                        onClick={() => setCollapsed(!collapsed)}
                        className="p-1 text-neutral-400 hover:text-neutral-600 transition-colors dark:text-neutral-500 dark:hover:text-neutral-300"
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
                    <aside className="relative w-72 max-w-[85vw] h-full bg-white shadow-xl flex flex-col animate-slide-in dark:bg-[#0f191e]">
                        {/* Logo + close */}
                        <div className="h-16 flex items-center justify-between px-4 border-b border-neutral-100 dark:border-[#223037]">
                            <Link href={homeHref} className="flex items-center" onClick={closeMobile}>
                                <img src="/Odysseus-Logo-Black.svg" alt="Onesign Odysseus" className="h-9 w-auto dark:hidden" />
                                <img src="/Odysseus-Logo.svg" alt="Onesign Odysseus" className="h-9 w-auto hidden dark:block" />
                            </Link>
                            <button
                                onClick={closeMobile}
                                className="p-1 text-neutral-400 hover:text-neutral-600 transition-colors dark:text-neutral-500 dark:hover:text-neutral-300"
                                aria-label="Close menu"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Mobile nav content — same groups as desktop, never collapsed */}
                        <nav className="flex-1 py-4 px-2 overflow-y-auto">
                            <NavLink
                                item={adminOverview}
                                isActive={isItemActive(pathname, adminOverview.href)}
                                collapsed={false}
                                onNavigate={closeMobile}
                            />

                            <NavGroups
                                pathname={pathname}
                                collapsed={false}
                                openGroups={openGroups}
                                onToggleGroup={toggleGroup}
                                onNavigate={closeMobile}
                            />
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

/**
 * The grouped nav. Groups are an accordion rather than plain headings: with
 * everything expanded the list runs past the fold on a laptop, and the office
 * mostly lives in one group at a time.
 *
 * Several groups can be open at once — an exclusive accordion would keep
 * shutting the section you were using to open the one you glanced at.
 *
 * When the rail is collapsed to icons there is nothing to label, so the items
 * render as one flat list with a rule between groups.
 */
function NavGroups({
    pathname,
    collapsed,
    openGroups,
    onToggleGroup,
    onNavigate,
}: {
    pathname: string;
    collapsed: boolean;
    openGroups: Record<string, boolean>;
    onToggleGroup: (label: string) => void;
    onNavigate?: () => void;
}) {
    return (
        <>
            {adminNavGroups.map((group) => {
                const open = openGroups[group.label] ?? true;
                const panelId = `sidebar-group-${group.label.replace(/\W+/g, '-').toLowerCase()}`;
                const hasActive = group.items.some((i) => isItemActive(pathname, i.href));

                return (
                    <div
                        key={group.label}
                        className={
                            collapsed
                                ? 'mt-2 pt-2 border-t border-neutral-100 first:mt-0 first:pt-0 first:border-t-0 dark:border-[#223037]'
                                : 'mt-3'
                        }
                    >
                        {!collapsed && (
                            <button
                                type="button"
                                onClick={() => onToggleGroup(group.label)}
                                aria-expanded={open}
                                aria-controls={panelId}
                                className={`flex w-full items-center gap-1.5 rounded-[var(--radius-sm)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                                    hasActive
                                        ? 'text-[var(--accent)] dark:text-[var(--accent-glow)]'
                                        : 'text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300'
                                }`}
                            >
                                <ChevronDown
                                    size={12}
                                    className={`shrink-0 transition-transform duration-150 ${
                                        open ? '' : '-rotate-90'
                                    }`}
                                />
                                <span className="truncate">{group.label}</span>
                                {/* A closed group still says it holds the current page. */}
                                {!open && hasActive && (
                                    <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                                )}
                            </button>
                        )}

                        {(open || collapsed) && (
                            <ul id={panelId} className="space-y-0.5">
                                {group.items.map((item) => (
                                    <li key={item.href}>
                                        <NavLink
                                            item={item}
                                            isActive={isItemActive(pathname, item.href)}
                                            collapsed={collapsed}
                                            onNavigate={onNavigate}
                                        />
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                );
            })}
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

    const baseClasses = 'flex items-center gap-3 px-3 py-2 rounded-[var(--radius-sm)] text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';

    let stateClasses: string;
    if (isActive) {
        stateClasses = 'bg-[var(--accent)] text-white shadow-sm';
    } else if (muted) {
        stateClasses = 'text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-white/5 dark:hover:text-neutral-300';
    } else {
        stateClasses = 'text-neutral-600 hover:bg-neutral-100 hover:text-black dark:text-[var(--bg-fg-muted)] dark:hover:bg-white/5 dark:hover:text-white';
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
