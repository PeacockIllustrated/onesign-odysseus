'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/app/(portal)/components/ui';
import { Check, Plus, X, RotateCcw, Eye, EyeOff, ExternalLink } from 'lucide-react';
import {
    updateRow,
    setPackPublished,
} from '@/lib/redbull-pack/actions';
import {
    countRows,
    isOutstanding,
    type ArtworkPart,
    type JobPack,
    type PackPanel,
    type PackRow,
    type PackSheet,
    type PackState,
} from '@/lib/redbull-pack/types';

interface Props {
    pack: JobPack;
    states: PackState[];
}

type Filter = 'all' | 'outstanding';

const SITE_URL = 'https://redbull.onesignanddigital.com';

/** The colour the client-facing site renders each state in. */
const STATE_SWATCH: Record<string, string> = {
    spec: 'bg-blue-600',
    flat: 'bg-neutral-800',
    pending: 'bg-orange-600',
    quote: 'bg-blue-600',
    unquoted: 'bg-blue-400',
};

interface Draft {
    code: string;
    name: string;
    size: string;
    artwork: ArtworkPart[];
}

function toDraft(row: PackRow): Draft {
    return {
        code: row.code,
        name: row.name ?? '',
        size: row.size ?? '',
        artwork: row.artwork.map((p) => ({ ...p })),
    };
}

function sameDraft(a: Draft, b: Draft): boolean {
    return (
        a.code === b.code &&
        a.name === b.name &&
        a.size === b.size &&
        a.artwork.length === b.artwork.length &&
        a.artwork.every((p, i) => p.label === b.artwork[i].label && p.state === b.artwork[i].state)
    );
}

export function RedbullPackClient({ pack, states }: Props) {
    const router = useRouter();
    const [filter, setFilter] = useState<Filter>('all');
    const [query, setQuery] = useState('');
    const [drafts, setDrafts] = useState<Record<string, Draft>>({});
    const [rowError, setRowError] = useState<Record<string, string>>({});
    const [savedAt, setSavedAt] = useState<Record<string, number>>({});
    const [pageError, setPageError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const counts = useMemo(() => countRows(pack), [pack]);
    const defaultState = states[0]?.key ?? 'spec';

    /** Only `panels` sheets carry rows; the rest are presentation. */
    const editable = useMemo(
        () => pack.sheets.filter((s) => s.type === 'panels' && s.panels.length > 0),
        [pack]
    );

    const draftFor = (row: PackRow): Draft => drafts[row.id] ?? toDraft(row);

    const isDirty = (row: PackRow): boolean =>
        row.id in drafts && !sameDraft(drafts[row.id], toDraft(row));

    const setDraft = (row: PackRow, next: Partial<Draft>) => {
        setDrafts((d) => ({ ...d, [row.id]: { ...draftFor(row), ...next } }));
        setSavedAt((s) => {
            if (!(row.id in s)) return s;
            const copy = { ...s };
            delete copy[row.id];
            return copy;
        });
    };

    const revert = (row: PackRow) => {
        setDrafts((d) => {
            const copy = { ...d };
            delete copy[row.id];
            return copy;
        });
        setRowError((e) => {
            const copy = { ...e };
            delete copy[row.id];
            return copy;
        });
    };

    const save = (row: PackRow) => {
        const draft = draftFor(row);
        startTransition(async () => {
            setRowError((e) => {
                const copy = { ...e };
                delete copy[row.id];
                return copy;
            });

            const res = await updateRow(row.id, {
                code: draft.code,
                name: draft.name,
                size: draft.size,
                artwork: draft.artwork,
            });

            if (!res.ok) {
                setRowError((e) => ({ ...e, [row.id]: res.error }));
                return;
            }
            revert(row);
            setSavedAt((s) => ({ ...s, [row.id]: Date.now() }));
            router.refresh();
        });
    };

    const togglePublished = () => {
        startTransition(async () => {
            setPageError(null);
            const res = await setPackPublished({
                packId: pack.id,
                isPublished: !pack.is_published,
            });
            if (!res.ok) setPageError(res.error);
            router.refresh();
        });
    };

    const matches = (row: PackRow, panel: PackPanel, sheet: PackSheet): boolean => {
        if (filter === 'outstanding' && !isOutstanding(row)) return false;
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return (
            row.code.toLowerCase().includes(q) ||
            (row.name ?? '').toLowerCase().includes(q) ||
            (row.size ?? '').toLowerCase().includes(q) ||
            row.artwork.some((p) => p.label.toLowerCase().includes(q)) ||
            panel.title.toLowerCase().includes(q) ||
            sheet.title.toLowerCase().includes(q)
        );
    };

    return (
        <>
            {/* Pack status ---------------------------------------------------- */}
            <Card className="mb-4">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                    <div>
                        <div className="text-sm font-semibold text-neutral-900">
                            {pack.client} · {pack.venue}
                        </div>
                        <div className="text-xs text-neutral-500">
                            Revision {pack.revision}
                            {pack.updated ? ` · issued ${pack.updated}` : ''} · {counts.total} rows
                        </div>
                    </div>

                    <div className="text-sm">
                        <span className="text-neutral-500">Outstanding: </span>
                        <span
                            className={`font-semibold ${
                                counts.outstanding > 0 ? 'text-orange-700' : 'text-neutral-400'
                            }`}
                        >
                            {counts.outstanding}
                        </span>
                    </div>

                    <div className="ml-auto flex items-center gap-3">
                        <a
                            href={SITE_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-500 hover:text-neutral-900"
                        >
                            View the site <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <button
                            type="button"
                            onClick={togglePublished}
                            disabled={isPending}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold uppercase tracking-wider border transition-colors disabled:opacity-50 ${
                                pack.is_published
                                    ? 'border-green-300 bg-green-50 text-green-800 hover:bg-green-100'
                                    : 'border-neutral-300 bg-neutral-50 text-neutral-600 hover:bg-neutral-100'
                            }`}
                        >
                            {pack.is_published ? (
                                <>
                                    <Eye className="w-3.5 h-3.5" /> Published
                                </>
                            ) : (
                                <>
                                    <EyeOff className="w-3.5 h-3.5" /> Offline
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {!pack.is_published && (
                    <p className="mt-3 text-xs text-orange-700">
                        The pack is offline — the client-facing site is returning 404. Nobody at
                        Red Bull can see it until you publish.
                    </p>
                )}
                {pageError && (
                    <p className="mt-3 text-xs text-red-700">{pageError}</p>
                )}
            </Card>

            {/* Controls ------------------------------------------------------- */}
            <div className="mb-4 flex flex-wrap items-center gap-3">
                <div className="inline-flex rounded border border-neutral-200 bg-white overflow-hidden text-xs">
                    {(
                        [
                            ['all', `All ${counts.total}`],
                            ['outstanding', `Outstanding ${counts.outstanding}`],
                        ] as [Filter, string][]
                    ).map(([value, label]) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => setFilter(value)}
                            className={`px-3 py-1.5 font-semibold uppercase tracking-wider transition-colors ${
                                filter === value
                                    ? 'bg-neutral-900 text-white'
                                    : 'text-neutral-600 hover:bg-neutral-50'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Find a ref, size, sponsor…"
                    className="flex-1 min-w-[200px] max-w-sm px-3 py-1.5 rounded border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#4e7e8c]/40"
                />
            </div>

            {/* Sheets --------------------------------------------------------- */}
            {editable.map((sheet) => {
                const visiblePanels = sheet.panels
                    .map((panel) => ({
                        panel,
                        rows: panel.rows.filter((r) => matches(r, panel, sheet)),
                    }))
                    .filter((p) => p.rows.length > 0);

                if (visiblePanels.length === 0) return null;

                return (
                    <section key={sheet.id} className="mb-8">
                        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                            Sheet {sheet.number} · {sheet.title}
                        </h2>

                        <div className="space-y-4">
                            {visiblePanels.map(({ panel, rows }) => (
                                <Card key={panel.id}>
                                    <div className="flex items-center gap-2 mb-3">
                                        {panel.colour && (
                                            <span
                                                aria-hidden="true"
                                                className="w-3.5 h-2.5 rounded-sm ring-1 ring-black/10"
                                                style={{ background: panel.colour }}
                                            />
                                        )}
                                        <h3 className="text-sm font-semibold text-neutral-900">
                                            {panel.title}
                                        </h3>
                                        <span className="text-xs text-neutral-400">
                                            {rows.length} of {panel.rows.length}
                                        </span>
                                    </div>

                                    <div className="divide-y divide-neutral-100">
                                        {rows.map((row) => (
                                            <RowEditor
                                                key={row.id}
                                                row={row}
                                                draft={draftFor(row)}
                                                dirty={isDirty(row)}
                                                saved={row.id in savedAt}
                                                error={rowError[row.id]}
                                                states={states}
                                                defaultState={defaultState}
                                                disabled={isPending}
                                                onChange={(next) => setDraft(row, next)}
                                                onSave={() => save(row)}
                                                onRevert={() => revert(row)}
                                            />
                                        ))}
                                    </div>
                                </Card>
                            ))}
                        </div>
                    </section>
                );
            })}

            {editable.every((s) =>
                s.panels.every((p) => p.rows.every((r) => !matches(r, p, s)))
            ) && (
                <p className="text-sm text-neutral-500">
                    Nothing matches that filter.
                </p>
            )}
        </>
    );
}

// -----------------------------------------------------------------------------

interface RowEditorProps {
    row: PackRow;
    draft: Draft;
    dirty: boolean;
    saved: boolean;
    error?: string;
    states: PackState[];
    defaultState: string;
    disabled: boolean;
    onChange: (next: Partial<Draft>) => void;
    onSave: () => void;
    onRevert: () => void;
}

function RowEditor({
    row,
    draft,
    dirty,
    saved,
    error,
    states,
    defaultState,
    disabled,
    onChange,
    onSave,
    onRevert,
}: RowEditorProps) {
    const setPart = (index: number, next: Partial<ArtworkPart>) => {
        const artwork = draft.artwork.map((p, i) => (i === index ? { ...p, ...next } : p));
        onChange({ artwork });
    };

    const addPart = () => {
        onChange({ artwork: [...draft.artwork, { label: '', state: defaultState }] });
    };

    const removePart = (index: number) => {
        onChange({ artwork: draft.artwork.filter((_, i) => i !== index) });
    };

    const field =
        'px-2 py-1 rounded border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#4e7e8c]/40 disabled:bg-neutral-50';

    return (
        <div className="py-2.5">
            <div className="flex flex-wrap items-start gap-2">
                <input
                    value={draft.code}
                    onChange={(e) => onChange({ code: e.target.value })}
                    disabled={disabled}
                    aria-label="Ref"
                    className={`${field} w-24 font-semibold`}
                />
                <input
                    value={draft.name}
                    onChange={(e) => onChange({ name: e.target.value })}
                    disabled={disabled}
                    aria-label="Name"
                    placeholder="—"
                    className={`${field} w-40`}
                />
                <input
                    value={draft.size}
                    onChange={(e) => onChange({ size: e.target.value })}
                    disabled={disabled}
                    aria-label="Size"
                    placeholder="e.g. 14100 × 850"
                    className={`${field} w-44`}
                />

                {/* Artwork — the field the pack is edited through */}
                <div className="flex flex-wrap items-center gap-1.5">
                    {draft.artwork.map((part, i) => (
                        <span key={i} className="inline-flex items-center gap-1">
                            {i > 0 && <span className="text-neutral-300 px-0.5">/</span>}
                            <span
                                aria-hidden="true"
                                className={`w-2 h-2 rounded-full ${
                                    STATE_SWATCH[part.state] ?? 'bg-neutral-300'
                                }`}
                            />
                            <input
                                value={part.label}
                                onChange={(e) => setPart(i, { label: e.target.value })}
                                disabled={disabled}
                                aria-label={`Artwork ${i + 1} label`}
                                placeholder="Label"
                                className={`${field} w-40`}
                            />
                            <select
                                value={part.state}
                                onChange={(e) => setPart(i, { state: e.target.value })}
                                disabled={disabled}
                                aria-label={`Artwork ${i + 1} state`}
                                className={`${field} w-32`}
                            >
                                {states.map((s) => (
                                    <option key={s.key} value={s.key}>
                                        {s.label}
                                    </option>
                                ))}
                            </select>
                            <button
                                type="button"
                                onClick={() => removePart(i)}
                                disabled={disabled}
                                aria-label={`Remove artwork part ${i + 1}`}
                                className="p-1 text-neutral-400 hover:text-red-600 disabled:opacity-50"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </span>
                    ))}

                    {draft.artwork.length < 4 && (
                        <button
                            type="button"
                            onClick={addPart}
                            disabled={disabled}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-dashed border-neutral-300 text-xs text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 disabled:opacity-50"
                        >
                            <Plus className="w-3 h-3" />
                            {draft.artwork.length === 0 ? 'Artwork' : 'Part'}
                        </button>
                    )}
                </div>

                <div className="ml-auto flex items-center gap-1.5">
                    {saved && !dirty && (
                        <span className="text-xs text-green-700 inline-flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" /> Saved
                        </span>
                    )}
                    {dirty && (
                        <>
                            <button
                                type="button"
                                onClick={onRevert}
                                disabled={disabled}
                                className="p-1.5 text-neutral-400 hover:text-neutral-700 disabled:opacity-50"
                                aria-label={`Discard changes to ${row.code}`}
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                            <button
                                type="button"
                                onClick={onSave}
                                disabled={disabled}
                                className="px-3 py-1.5 rounded bg-[#4e7e8c] text-white text-xs font-semibold uppercase tracking-wider hover:bg-[#3a5f6a] disabled:opacity-50"
                            >
                                Save
                            </button>
                        </>
                    )}
                </div>
            </div>

            {error && <p className="mt-1.5 text-xs text-red-700">{error}</p>}
        </div>
    );
}
