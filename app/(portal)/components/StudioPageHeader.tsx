import type { ReactNode } from 'react';

/**
 * Shared "Studio-light" page header — the rounded steel-teal gradient band
 * with an accent bar and an uppercase eyebrow. One source of truth so every
 * admin surface in the Studio family (artwork, packs, …) reads the same.
 *
 * Server-safe (no hooks) so it drops into any server-component page.
 */
export function StudioPageHeader({
    eyebrow = 'Studio',
    title,
    description,
    action,
}: {
    eyebrow?: string;
    title: string;
    description?: string;
    action?: ReactNode;
}) {
    return (
        <div className="relative overflow-hidden rounded-2xl border border-[#cfe0e6] bg-gradient-to-br from-[#e8f0f3] via-white to-white mb-6 shadow-sm">
            <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-[#9ed0dc] to-[#4e7e8c]" />
            <div className="flex flex-col gap-3 p-5 pl-7 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#4e7e8c]">{eyebrow}</p>
                    <h1 className="truncate text-2xl font-bold tracking-tight text-[#10242b]">{title}</h1>
                    {description && <p className="mt-0.5 text-sm text-[#5b7a83]">{description}</p>}
                </div>
                {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
            </div>
        </div>
    );
}
