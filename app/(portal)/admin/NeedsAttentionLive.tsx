'use client';

import { useEffect, useMemo, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase';
import { dismissNotification } from '@/lib/notifications/actions';
import type { AttentionItem } from '@/lib/notifications/queries';
import { Bell, X } from 'lucide-react';

interface Props {
    items: AttentionItem[];
    urgentCount: number;
    actionCount: number;
}

export function NeedsAttentionLive({ items, urgentCount, actionCount }: Props) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const supabase = useMemo(() => createBrowserClient(), []);

    useEffect(() => {
        const channel = supabase
            .channel('dashboard-notifications')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'notifications' },
                () => router.refresh()
            )
            .subscribe();
        return () => {
            supabase.removeChannel(channel);
        };
    }, [router, supabase]);

    const handleDismiss = (id: string) => {
        startTransition(async () => {
            await dismissNotification(id);
            router.refresh();
        });
    };

    return (
        <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Bell size={16} className="text-[#4e7e8c]" />
                    <h2 className="text-sm font-semibold text-neutral-900">Needs Attention</h2>
                    {urgentCount > 0 && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider bg-red-50 text-red-700 px-1.5 py-0.5 rounded">
                            {urgentCount} urgent
                        </span>
                    )}
                    {actionCount > 0 && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">
                            {actionCount} action
                        </span>
                    )}
                    <span className="ml-1 text-[10px] text-neutral-400" title="Live via Supabase Realtime">● live</span>
                </div>
            </div>

            <div className="bg-white rounded-[var(--radius-md)] border border-neutral-200 divide-y divide-neutral-100">
                {items.length === 0 ? (
                    <p className="text-sm text-neutral-400 text-center py-6">Nothing needs attention right now ✓</p>
                ) : (
                    items.slice(0, 8).map((item, idx) => {
                        const dot =
                            item.severity === 'urgent' ? 'bg-red-500'
                            : item.severity === 'action' ? 'bg-amber-500'
                            : 'bg-neutral-300';
                        return (
                            <div
                                key={item.id ?? `${item.kind}-${idx}`}
                                className="group flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 transition-colors"
                            >
                                <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} aria-hidden />
                                <Link href={item.href} className="min-w-0 flex-1">
                                    <p className="text-sm text-neutral-900 truncate">{item.title}</p>
                                    {item.detail && (
                                        <p className="text-xs text-neutral-500 truncate">{item.detail}</p>
                                    )}
                                </Link>
                                {item.timestamp && (
                                    <span className="text-[11px] text-neutral-400 shrink-0">
                                        {new Date(item.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                                    </span>
                                )}
                                {item.id && (
                                    <button
                                        type="button"
                                        onClick={() => handleDismiss(item.id!)}
                                        disabled={isPending}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-neutral-200 text-neutral-400 hover:text-neutral-700"
                                        title="Dismiss"
                                        aria-label="Dismiss notification"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                        );
                    })
                )}
                {items.length > 8 && (
                    <div className="px-4 py-2 text-xs text-neutral-500 text-center">
                        +{items.length - 8} more
                    </div>
                )}
            </div>
        </div>
    );
}
