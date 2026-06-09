'use client';

import { ChevronDown } from 'lucide-react';

/**
 * Collapsible side-rail section — `<details>`-based so it's
 * keyboard-accessible for free. Shared across the controls + artwork
 * rails so the whole side panel reads as one consistent accordion
 * rather than a wall of always-open sub-panels.
 *
 * Optional `step` renders a small numbered chip so a newcomer can read
 * the rail top-to-bottom as the workflow (panel → artwork → …), and
 * `accent` highlights a section that's currently actionable.
 */
export function Section({
    title,
    step,
    defaultOpen = true,
    accent = false,
    right,
    children,
}: {
    title: string;
    step?: number;
    defaultOpen?: boolean;
    accent?: boolean;
    /** Optional control rendered on the summary's right (e.g. a count). */
    right?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <details
            open={defaultOpen}
            className={`group rounded-md border bg-white ${
                accent ? 'border-[#b8d0d8]' : 'border-neutral-200'
            }`}
        >
            <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-500 [&::-webkit-details-marker]:hidden">
                {typeof step === 'number' && (
                    <span
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                        style={{ background: accent ? '#4e7e8c' : '#9ca3af' }}
                        aria-hidden
                    >
                        {step}
                    </span>
                )}
                <span className="min-w-0 flex-1 truncate">{title}</span>
                {right}
                <ChevronDown
                    size={14}
                    aria-hidden
                    className="shrink-0 text-neutral-400 transition-transform group-open:rotate-180"
                />
            </summary>
            <div className="border-t border-neutral-100 px-3 py-3 space-y-3">
                {children}
            </div>
        </details>
    );
}
