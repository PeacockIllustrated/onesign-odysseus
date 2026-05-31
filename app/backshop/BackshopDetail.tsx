'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Circle, FileText } from 'lucide-react';
import {
    toggleBackshopCheck,
    setBackshopArchived,
} from '@/lib/backshop/actions';
import {
    backshopStatus,
    normaliseChecks,
    stagesForChecks,
    type BackshopChecks,
    type BackshopItemWithPdf,
} from '@/lib/backshop/types';

const ACCENT = '#4e7e8c';

export function BackshopDetail({
    item,
    qrDataUrl,
}: {
    item: BackshopItemWithPdf;
    qrDataUrl: string | null;
}) {
    const router = useRouter();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [checks, setChecks] = useState<BackshopChecks>(
        normaliseChecks(item.checks),
    );
    const [, startTransition] = useTransition();

    const goBack = () => router.push('/backshop');

    // Remote / keyboard: arrows roam the focus ring across every control
    // tagged data-nav; Enter activates natively; Escape / Backspace go back.
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' || e.key === 'Backspace') {
                e.preventDefault();
                goBack();
                return;
            }
            const isNext =
                e.key === 'ArrowDown' || e.key === 'ArrowRight';
            const isPrev = e.key === 'ArrowUp' || e.key === 'ArrowLeft';
            if (!isNext && !isPrev) return;
            e.preventDefault();
            const nav = Array.from(
                el.querySelectorAll<HTMLElement>('[data-nav]'),
            );
            if (nav.length === 0) return;
            const cur = nav.indexOf(document.activeElement as HTMLElement);
            const next = Math.max(
                0,
                Math.min(
                    nav.length - 1,
                    (cur < 0 ? 0 : cur) + (isNext ? 1 : -1),
                ),
            );
            nav[next]?.focus();
        };
        el.addEventListener('keydown', onKey);
        return () => el.removeEventListener('keydown', onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Focus the first toggle on mount for immediate remote control.
    useEffect(() => {
        containerRef.current
            ?.querySelector<HTMLElement>('[data-nav]')
            ?.focus();
    }, []);

    const toggle = (key: string) => {
        const value = !checks[key];
        setChecks((c) => ({ ...c, [key]: value })); // optimistic
        startTransition(async () => {
            const res = await toggleBackshopCheck(item.id, key, value);
            if (!res.ok) setChecks((c) => ({ ...c, [key]: !value })); // revert
        });
    };

    const markDone = () => {
        startTransition(async () => {
            await setBackshopArchived(item.id, true);
            goBack();
        });
    };

    const status = backshopStatus(checks);
    const stages = stagesForChecks(checks);
    const specs: string[] = [];
    if (item.width_mm && item.height_mm)
        specs.push(`${item.width_mm}mm × ${item.height_mm}mm`);
    if (item.returns_mm) specs.push(`${item.returns_mm}mm returns`);
    if (item.shadow_gap_mm) specs.push(`${item.shadow_gap_mm}mm shadow gap`);

    return (
        <div ref={containerRef} className="px-8 py-6">
            <div className="mb-6 flex items-start justify-between gap-6">
                <div className="min-w-0">
                    <h1 className="truncate text-4xl font-black text-neutral-900">
                        {item.name}
                    </h1>
                    {item.description && (
                        <p className="mt-1 text-lg text-neutral-500">
                            {item.description}
                        </p>
                    )}
                </div>
                <span
                    className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold ${
                        status === 'ready'
                            ? 'bg-emerald-100 text-emerald-700'
                            : status === 'in_progress'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-neutral-200 text-neutral-600'
                    }`}
                >
                    {status === 'ready'
                        ? 'Ready'
                        : status === 'in_progress'
                          ? 'In progress'
                          : 'Queued'}
                </span>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
                {/* Visual + specs */}
                <div className="space-y-4">
                    <div className="flex items-center justify-center overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100 p-4">
                        {item.thumbnail ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={item.thumbnail}
                                alt=""
                                className="max-h-[42vh] w-full object-contain"
                            />
                        ) : (
                            <div className="py-20 text-neutral-400">
                                No preview
                            </div>
                        )}
                    </div>
                    {specs.length > 0 && (
                        <div className="flex flex-wrap gap-x-6 gap-y-1 text-lg text-neutral-700">
                            {specs.map((s, i) => (
                                <span
                                    key={i}
                                    className={
                                        i === 0
                                            ? 'font-bold text-neutral-900'
                                            : ''
                                    }
                                >
                                    {s}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* Contextual checks + actions */}
                <div className="space-y-4">
                    <div className="space-y-2">
                        {stages.map((stage) => {
                            const done = checks[stage.key];
                            return (
                                <button
                                    key={stage.key}
                                    type="button"
                                    data-nav
                                    onClick={() => toggle(stage.key)}
                                    aria-pressed={done}
                                    className={`flex min-h-[60px] w-full items-center justify-between rounded-xl border px-5 text-xl font-semibold outline-none transition-colors focus:ring-4 focus:ring-[#4e7e8c] ${
                                        done
                                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                            : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                                    }`}
                                >
                                    <span>{stage.label}</span>
                                    {done ? (
                                        <CheckCircle2 size={28} aria-hidden />
                                    ) : (
                                        <Circle
                                            size={28}
                                            aria-hidden
                                            className="text-neutral-300"
                                        />
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Reference PDF + QR */}
                    {item.pdfUrl ? (
                        <div className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-4">
                            {qrDataUrl && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={qrDataUrl}
                                    alt="QR code to open the reference PDF"
                                    className="h-24 w-24 shrink-0 rounded border border-neutral-200"
                                />
                            )}
                            <div className="min-w-0">
                                <a
                                    data-nav
                                    href={item.pdfUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2 text-base font-semibold text-white outline-none focus:ring-4 focus:ring-[#4e7e8c]"
                                    style={{ background: ACCENT }}
                                >
                                    <FileText size={18} aria-hidden />
                                    Open reference PDF
                                </a>
                                <p className="mt-2 text-xs text-neutral-500">
                                    Scan the code to open it on a phone.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <p className="rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-400">
                            No reference PDF stored for this item.
                        </p>
                    )}

                    {/* Footer actions */}
                    <div className="flex flex-wrap items-center gap-3 pt-2">
                        <button
                            type="button"
                            data-nav
                            onClick={goBack}
                            className="inline-flex min-h-[48px] items-center gap-2 rounded-lg border border-neutral-300 px-5 text-base font-medium text-neutral-700 outline-none hover:bg-neutral-50 focus:ring-4 focus:ring-[#4e7e8c]"
                        >
                            <ArrowLeft size={18} aria-hidden />
                            Back to board
                        </button>
                        <button
                            type="button"
                            data-nav
                            onClick={markDone}
                            className="inline-flex min-h-[48px] items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-5 text-base font-semibold text-emerald-700 outline-none hover:bg-emerald-100 focus:ring-4 focus:ring-emerald-400 disabled:opacity-50"
                        >
                            <CheckCircle2 size={18} aria-hidden />
                            Mark done &amp; clear
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
