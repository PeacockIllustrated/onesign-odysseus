'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Check, Loader2, Mail } from 'lucide-react';
import { Card } from '@/app/(portal)/components/ui';
import {
    promoteDesignRequest,
    updateDesignRequestStatus,
} from '@/lib/design-requests/actions';
import {
    DESIGN_REQUEST_STATUSES,
    DESIGN_REQUEST_STATUS_LABELS,
    type DesignRequestStatus,
} from '@/lib/design-requests/types';

const ACCENT = '#4e7e8c';

export function RequestActions({
    id,
    status,
    designId,
    email,
    reference,
}: {
    id: string;
    status: DesignRequestStatus;
    designId: string | null;
    email: string;
    reference: string;
}) {
    const router = useRouter();
    const [current, setCurrent] = useState<DesignRequestStatus>(status);
    const [saving, startSaving] = useTransition();
    const [savedTick, setSavedTick] = useState(false);
    const [promoting, setPromoting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const onStatus = (next: DesignRequestStatus) => {
        setCurrent(next);
        setError(null);
        startSaving(async () => {
            const res = await updateDesignRequestStatus(id, next);
            if (res.ok) {
                setSavedTick(true);
                setTimeout(() => setSavedTick(false), 1800);
                router.refresh();
            } else {
                setError(res.error);
            }
        });
    };

    const openInVisualiser = async () => {
        if (promoting) return;
        // Already promoted — go straight to it.
        if (designId) {
            router.push(`/admin/visualiser?id=${designId}`);
            return;
        }
        setPromoting(true);
        setError(null);
        const res = await promoteDesignRequest(id);
        setPromoting(false);
        if (res.ok) {
            router.push(`/admin/visualiser?id=${res.data.designId}`);
        } else {
            setError(res.error);
        }
    };

    return (
        <Card className="p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-neutral-500">
                Triage
            </h3>

            <label className="block">
                <span className="text-xs font-medium text-neutral-600">
                    Status
                </span>
                <div className="mt-1 flex items-center gap-2">
                    <select
                        value={current}
                        onChange={(e) =>
                            onStatus(e.target.value as DesignRequestStatus)
                        }
                        disabled={saving}
                        className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-[#4e7e8c] focus:ring-1 focus:ring-[#4e7e8c]"
                    >
                        {DESIGN_REQUEST_STATUSES.map((s) => (
                            <option key={s} value={s}>
                                {DESIGN_REQUEST_STATUS_LABELS[s]}
                            </option>
                        ))}
                    </select>
                    {saving ? (
                        <Loader2
                            size={16}
                            className="animate-spin text-neutral-400"
                            aria-hidden
                        />
                    ) : savedTick ? (
                        <Check
                            size={16}
                            className="text-emerald-500"
                            aria-hidden
                        />
                    ) : null}
                </div>
            </label>

            <div className="mt-4 space-y-2">
                <button
                    type="button"
                    onClick={openInVisualiser}
                    disabled={promoting}
                    aria-busy={promoting}
                    className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-50"
                    style={{ background: ACCENT }}
                >
                    {promoting ? (
                        <Loader2
                            size={16}
                            className="animate-spin"
                            aria-hidden
                        />
                    ) : (
                        <Box size={16} aria-hidden />
                    )}
                    Open in visualiser
                </button>
                {designId && (
                    <p className="text-center text-[11px] text-neutral-400">
                        Linked to a saved visualiser design
                    </p>
                )}

                <a
                    href={`mailto:${email}?subject=${encodeURIComponent(
                        `Your sign enquiry (${reference})`,
                    )}`}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
                >
                    <Mail size={16} aria-hidden />
                    Reply by email
                </a>
            </div>

            {error && (
                <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                    {error}
                </p>
            )}
        </Card>
    );
}
