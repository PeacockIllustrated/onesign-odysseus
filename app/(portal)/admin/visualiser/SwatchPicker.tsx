'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

const ACCENT = '#4e7e8c';

export interface SwatchItem {
    hex: string;
    label: string;
    sublabel?: string;
}

/**
 * A compact colour-library picker: a trigger showing the current selection,
 * expanding to a searchable swatch grid. Used for the RAL panel colour and the
 * acrylic colour library so production colours are chosen from a real palette,
 * not a free hex. Inline-expanding (no portal) — fits the narrow control rails.
 */
export function SwatchPicker({
    items,
    value,
    onPick,
    placeholder = 'Pick a colour…',
}: {
    items: SwatchItem[];
    /** Current hex (drives the highlighted swatch + trigger). */
    value: string | undefined;
    onPick: (item: SwatchItem) => void;
    placeholder?: string;
}) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');

    const current = useMemo(() => {
        const v = (value ?? '').toLowerCase();
        return items.find((i) => i.hex.toLowerCase() === v) ?? null;
    }, [items, value]);

    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s) return items;
        return items.filter(
            (i) =>
                i.label.toLowerCase().includes(s) ||
                (i.sublabel ?? '').toLowerCase().includes(s) ||
                i.hex.toLowerCase().includes(s),
        );
    }, [items, q]);

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="flex w-full items-center gap-2 rounded-md border border-neutral-300 px-2 py-1.5 text-left hover:border-neutral-400"
            >
                <span
                    className="h-6 w-6 shrink-0 rounded border border-neutral-300"
                    style={{ background: value ?? '#ffffff' }}
                />
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-neutral-800">
                        {current ? current.label : placeholder}
                    </span>
                    {current?.sublabel && (
                        <span className="block truncate text-[10px] text-neutral-400">
                            {current.sublabel}
                        </span>
                    )}
                </span>
                <ChevronDown size={14} className="shrink-0 text-neutral-400" />
            </button>

            {open && (
                <div className="absolute left-0 right-0 z-20 mt-1 rounded-lg border border-neutral-200 bg-white p-2 shadow-lg">
                    <div className="mb-2 flex items-center gap-1.5 rounded-md border border-neutral-200 px-2 py-1">
                        <Search size={12} className="text-neutral-400" />
                        <input
                            autoFocus
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Search name or code…"
                            className="w-full text-xs focus:outline-none"
                        />
                    </div>
                    <div className="grid max-h-56 grid-cols-6 gap-1 overflow-y-auto">
                        {filtered.map((i) => {
                            const selected =
                                (value ?? '').toLowerCase() ===
                                i.hex.toLowerCase();
                            return (
                                <button
                                    key={`${i.hex}-${i.label}`}
                                    type="button"
                                    title={`${i.label}${i.sublabel ? ' · ' + i.sublabel : ''}`}
                                    onClick={() => {
                                        onPick(i);
                                        setOpen(false);
                                        setQ('');
                                    }}
                                    className="relative flex aspect-square items-center justify-center rounded border"
                                    style={{
                                        background: i.hex,
                                        borderColor: selected
                                            ? ACCENT
                                            : 'rgba(0,0,0,0.12)',
                                        boxShadow: selected
                                            ? `0 0 0 2px ${ACCENT}`
                                            : undefined,
                                    }}
                                >
                                    {selected && (
                                        <Check
                                            size={12}
                                            className="drop-shadow"
                                            color="#fff"
                                        />
                                    )}
                                </button>
                            );
                        })}
                        {filtered.length === 0 && (
                            <p className="col-span-6 py-3 text-center text-[11px] text-neutral-400">
                                No matches.
                            </p>
                        )}
                    </div>
                    <p className="mt-1 text-[10px] text-neutral-400">
                        {filtered.length} of {items.length} · hover a swatch for
                        its name
                    </p>
                </div>
            )}
        </div>
    );
}
