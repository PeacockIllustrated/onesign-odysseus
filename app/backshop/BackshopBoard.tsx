'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Circle, MonitorPlay } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase';
import {
    BACKSHOP_STAGES,
    backshopStatus,
    type BackshopItemRow,
    type BackshopStatus,
} from '@/lib/backshop/types';

const ACCENT = '#4e7e8c';

const STATUS_STYLE: Record<BackshopStatus, { label: string; cls: string }> = {
    queued: { label: 'Queued', cls: 'bg-neutral-700 text-neutral-200' },
    in_progress: { label: 'In progress', cls: 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40' },
    ready: { label: 'Ready', cls: 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40' },
};

function specLine(item: BackshopItemRow): string[] {
    const parts: string[] = [];
    if (item.width_mm && item.height_mm)
        parts.push(`${item.width_mm}mm × ${item.height_mm}mm`);
    if (item.returns_mm) parts.push(`${item.returns_mm}mm returns`);
    if (item.shadow_gap_mm) parts.push(`${item.shadow_gap_mm}mm shadow gap`);
    return parts;
}

export function BackshopBoard({ items }: { items: BackshopItemRow[] }) {
    const router = useRouter();
    const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);

    // Live board: refetch on any change to backshop_items (add / tick / clear).
    useEffect(() => {
        const supabase = createBrowserClient();
        const channel = supabase
            .channel('backshop_board_realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'backshop_items' },
                () => router.refresh(),
            )
            .subscribe();
        return () => {
            supabase.removeChannel(channel);
        };
    }, [router]);

    // Land focus on the first row so a TV remote can drive it immediately.
    useEffect(() => {
        rowRefs.current[0]?.focus();
    }, []);

    // Remote / keyboard: up/down move the focus ring between rows; Enter on a
    // focused row opens it (native button activation).
    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        const els = rowRefs.current.filter(Boolean) as HTMLButtonElement[];
        if (els.length === 0) return;
        const cur = els.indexOf(
            document.activeElement as HTMLButtonElement,
        );
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        const next = Math.max(
            0,
            Math.min(els.length - 1, (cur < 0 ? 0 : cur) + delta),
        );
        els[next]?.focus();
    };

    if (items.length === 0) {
        return (
            <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center text-neutral-400">
                <MonitorPlay size={48} aria-hidden style={{ color: ACCENT }} />
                <p className="text-xl font-medium text-neutral-200">
                    Nothing on the board yet
                </p>
                <p className="max-w-md text-sm">
                    Designs pushed from the visualiser with{' '}
                    <span className="font-medium text-neutral-300">
                        Add to backshop screen
                    </span>{' '}
                    appear here, ready for production.
                </p>
            </div>
        );
    }

    return (
        <div
            className="flex flex-col gap-4 px-6 py-6"
            onKeyDown={onKeyDown}
            role="list"
        >
            {items.map((item, i) => {
                const status = backshopStatus(item.checks);
                const st = STATUS_STYLE[status];
                const specs = specLine(item);
                return (
                    <button
                        key={item.id}
                        ref={(el) => {
                            rowRefs.current[i] = el;
                        }}
                        type="button"
                        role="listitem"
                        onClick={() => router.push(`/backshop/${item.id}`)}
                        className="group flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-left outline-none transition-colors hover:bg-white/[0.06] focus:border-transparent focus:ring-4 focus:ring-[#4e7e8c] sm:flex-row sm:items-center sm:gap-5 sm:px-6 sm:py-5"
                    >
                        {/* Visual + name + specs */}
                        <div className="flex min-w-0 flex-1 items-center gap-4">
                            <div className="flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/40 sm:h-20 sm:w-40">
                                {item.thumbnail ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={item.thumbnail}
                                        alt=""
                                        className="h-full w-full object-contain"
                                    />
                                ) : (
                                    <MonitorPlay
                                        size={26}
                                        aria-hidden
                                        className="text-neutral-600"
                                    />
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-xl font-bold text-white sm:text-2xl">
                                    {item.name}
                                </div>
                                {item.description && (
                                    <div className="truncate text-xs text-neutral-400 sm:text-sm">
                                        {item.description}
                                    </div>
                                )}
                                {specs.length > 0 && (
                                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-neutral-300 sm:text-xs">
                                        {specs.map((s, j) => (
                                            <span
                                                key={j}
                                                className={
                                                    j === 0
                                                        ? 'font-semibold text-white'
                                                        : ''
                                                }
                                            >
                                                {s}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Status + stage checks */}
                        <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-2">
                            <span
                                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${st.cls}`}
                            >
                                {st.label}
                            </span>
                            <div className="flex flex-wrap gap-1.5 sm:justify-end">
                                {BACKSHOP_STAGES.map((stage) => {
                                    const done = item.checks[stage.key];
                                    return (
                                        <span
                                            key={stage.key}
                                            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ${
                                                done
                                                    ? 'bg-emerald-500/15 text-emerald-300'
                                                    : 'bg-white/5 text-neutral-500'
                                            }`}
                                        >
                                            {done ? (
                                                <CheckCircle2
                                                    size={13}
                                                    aria-hidden
                                                />
                                            ) : (
                                                <Circle
                                                    size={13}
                                                    aria-hidden
                                                />
                                            )}
                                            {stage.label}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                    </button>
                );
            })}
        </div>
    );
}
