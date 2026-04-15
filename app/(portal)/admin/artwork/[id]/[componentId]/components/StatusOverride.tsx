'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Check } from 'lucide-react';
import { Chip } from '@/app/(portal)/components/ui';
import { overrideComponentStatus } from '@/lib/artwork/sub-item-actions';
import {
    getComponentStatusLabel,
    getComponentStatusVariant,
} from '@/lib/artwork/utils';
import type { ComponentStatus } from '@/lib/artwork/types';

const STATUSES: ComponentStatus[] = [
    'pending_design',
    'design_submitted',
    'design_signed_off',
    'in_production',
    'production_complete',
    'flagged',
];

interface Props {
    componentId: string;
    currentStatus: ComponentStatus;
    disabled?: boolean;
}

/**
 * Chip-shaped click-target that opens a dropdown of status values and sends
 * an override to the server. Auto-derived statuses (from sub-item sign-offs)
 * are the normal path; this exists for the edge cases where a human needs
 * to force a particular state.
 */
export function StatusOverride({ componentId, currentStatus, disabled }: Props) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            if (!wrapperRef.current?.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    const pick = (next: ComponentStatus) => {
        setOpen(false);
        if (next === currentStatus) return;
        setError(null);
        startTransition(async () => {
            const res = await overrideComponentStatus(componentId, next);
            if ('error' in res) setError(res.error);
            else router.refresh();
        });
    };

    return (
        <div ref={wrapperRef} className="relative inline-block">
            <button
                type="button"
                onClick={() => !disabled && setOpen((v) => !v)}
                disabled={disabled || pending}
                className="inline-flex items-center gap-1 hover:opacity-80 disabled:opacity-60"
                title={disabled ? 'status is locked' : 'click to override status'}
            >
                <Chip variant={getComponentStatusVariant(currentStatus)}>
                    {getComponentStatusLabel(currentStatus)}
                </Chip>
                {!disabled && (
                    <ChevronDown size={12} className="text-neutral-400" />
                )}
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-neutral-200 rounded-[var(--radius-sm)] shadow-lg min-w-[200px] py-1">
                    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500 border-b border-neutral-100">
                        override status
                    </div>
                    {STATUSES.map((s) => {
                        const isCurrent = s === currentStatus;
                        return (
                            <button
                                key={s}
                                type="button"
                                onClick={() => pick(s)}
                                className={`w-full flex items-center justify-between px-3 py-1.5 text-sm text-left hover:bg-neutral-50 ${
                                    isCurrent ? 'bg-neutral-50' : ''
                                }`}
                            >
                                <span className="flex items-center gap-2">
                                    <Chip variant={getComponentStatusVariant(s)}>
                                        {getComponentStatusLabel(s)}
                                    </Chip>
                                </span>
                                {isCurrent && <Check size={12} className="text-neutral-400" />}
                            </button>
                        );
                    })}
                </div>
            )}

            {error && (
                <p className="absolute text-[11px] text-red-700 mt-1 right-0 whitespace-nowrap">
                    {error}
                </p>
            )}
        </div>
    );
}
