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
    formatArtwork,
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

/**
 * One column template, used by the header and every row, so the four columns
 * line up down the whole panel however many artwork parts a row carries.
 * The artwork parts stack inside their own cell rather than wrapping the row,
 * which is what made the first version unreadable.
 */
const GRID_BASE = 'grid gap-x-3 items-start';

/**
 * Only Executive Box Branding names its rows ("A  Cyclone"); the other
 * fifteen panels would carry an empty column down the page, so the Name
 * column is dropped on panels that do not use it.
 */
const COLS_WITH_NAME = 'grid-cols-[72px_minmax(0,0.8fr)_132px_minmax(0,2.2fr)_70px]';
const COLS_NO_NAME = 'grid-cols-[72px_132px_minmax(0,1fr)_70px]';
const gridFor = (showName: boolean) =>
    `${GRID_BASE} ${showName ? COLS_WITH_NAME : COLS_NO_NAME}`;

/**
 * Fields read as text until you touch them. Fifteen rows of four permanently
 * outlined inputs is 60 boxes competing for attention; the outline appearing
 * on hover is affordance enough.
 */
const FIELD =
    'min-w-0 px-2 py-1 rounded bg-transparent border border-transparent text-sm ' +
    'hover:border-neutral-200 hover:bg-white ' +
    'focus:outline-none focus:bg-white focus:border-[#4e7e8c] focus:ring-1 focus:ring-[#4e7e8c]/30 ' +
    'disabled:opacity-60 transition-colors';

/** The colour the client-facing site renders each state in. */
const STATE_SWATCH: Record<string, string> = {
    spec: 'bg-blue-600',
    flat: 'bg-neutral-800',
    pending: 'bg-orange-600',
    quote: 'bg-blue-600',
    unquoted: 'bg-blue-400',
};

/** Does any row on this panel carry a name? */
function panelUsesNames(panel: PackPanel): boolean {
    return panel.rows.some((r) => (r.name ?? '').trim().length > 0);
}

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
                <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                    {/* Client and venue are in the branded header above, so this
                        card carries the numbers and the controls only. */}
                    <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                            Rows
                        </div>
                        <div className="text-lg font-semibold text-neutral-900 tabular-nums">
                            {counts.total}
                        </div>
                    </div>

                    <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                            Outstanding
                        </div>
                        <div
                            className={`text-lg font-semibold tabular-nums ${
                                counts.outstanding > 0 ? 'text-orange-700' : 'text-neutral-400'
                            }`}
                        >
                            {counts.outstanding}
                        </div>
                    </div>

                    <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                            Issued
                        </div>
                        <div className="text-lg font-semibold text-neutral-900 tabular-nums">
                            {pack.updated ?? '—'}
                        </div>
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

                                    <div className="overflow-x-auto">
                                        <div className="min-w-[720px]">
                                            <div
                                                className={`${gridFor(panelUsesNames(panel))} px-2 pb-1.5 mb-1 border-b border-neutral-200 text-[10px] font-semibold uppercase tracking-wider text-neutral-400`}
                                            >
                                                <div>Ref</div>
                                                {panelUsesNames(panel) && <div>Name</div>}
                                                <div>Size</div>
                                                <div>Artwork</div>
                                                <div />
                                            </div>

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
                                                    showName={panelUsesNames(panel)}
                                                    disabled={isPending}
                                                    onChange={(next) => setDraft(row, next)}
                                                    onSave={() => save(row)}
                                                    onRevert={() => revert(row)}
                                                />
                                            ))}
                                        </div>
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
    showName: boolean;
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
    showName,
    disabled,
    onChange,
    onSave,
    onRevert,
}: RowEditorProps) {
    const setPart = (index: number, next: Partial<ArtworkPart>) => {
        onChange({ artwork: draft.artwork.map((p, i) => (i === index ? { ...p, ...next } : p)) });
    };

    const addPart = () => {
        onChange({ artwork: [...draft.artwork, { label: '', state: defaultState }] });
    };

    const removePart = (index: number) => {
        onChange({ artwork: draft.artwork.filter((_, i) => i !== index) });
    };

    return (
        <div
            className={`group ${gridFor(showName)} px-2 py-1.5 rounded border-l-2 transition-colors ${
                dirty
                    ? 'border-l-[#4e7e8c] bg-[#e8f0f3]/50'
                    : 'border-l-transparent hover:bg-neutral-50/70'
            }`}
        >
            <input
                value={draft.code}
                onChange={(e) => onChange({ code: e.target.value })}
                disabled={disabled}
                aria-label="Ref"
                className={`${FIELD} w-full font-semibold`}
            />

            {showName && (
                <input
                    value={draft.name}
                    onChange={(e) => onChange({ name: e.target.value })}
                    disabled={disabled}
                    aria-label="Name"
                    className={`${FIELD} w-full`}
                />
            )}

            <input
                value={draft.size}
                onChange={(e) => onChange({ size: e.target.value })}
                disabled={disabled}
                aria-label="Size"
                className={`${FIELD} w-full tabular-nums`}
            />

            {/* The field the pack is edited through. Parts stack, so a two-part
                value never pushes the row out of alignment. */}
            <div className="space-y-1">
                {draft.artwork.map((part, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                        <span
                            aria-hidden="true"
                            title={part.state}
                            className={`shrink-0 w-1.5 h-5 rounded-sm ${
                                STATE_SWATCH[part.state] ?? 'bg-neutral-300'
                            }`}
                        />
                        <input
                            value={part.label}
                            onChange={(e) => setPart(i, { label: e.target.value })}
                            disabled={disabled}
                            aria-label={`Artwork ${i + 1} label`}
                            placeholder="Label"
                            className={`${FIELD} flex-1`}
                        />
                        <select
                            value={part.state}
                            onChange={(e) => setPart(i, { state: e.target.value })}
                            disabled={disabled}
                            aria-label={`Artwork ${i + 1} state`}
                            className={`${FIELD} w-32 shrink-0 text-xs text-neutral-600`}
                        >
                            {states.map((st) => (
                                <option key={st.key} value={st.key}>
                                    {st.label}
                                </option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={() => removePart(i)}
                            disabled={disabled}
                            aria-label={`Remove artwork part ${i + 1}`}
                            className="shrink-0 p-1 text-neutral-300 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-red-600 disabled:opacity-50 transition-opacity"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                ))}

                {draft.artwork.length > 1 && (
                    <p className="pl-3 text-[11px] text-neutral-400">
                        Reads as <span className="text-neutral-600">{formatArtwork(draft.artwork)}</span>
                    </p>
                )}

                {draft.artwork.length < 4 && (
                    <button
                        type="button"
                        onClick={addPart}
                        disabled={disabled}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-neutral-400 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 transition-opacity"
                    >
                        <Plus className="w-3 h-3" />
                        {draft.artwork.length === 0 ? 'Add artwork' : 'Add part'}
                    </button>
                )}

                {error && <p className="text-xs text-red-700">{error}</p>}
            </div>

            <div className="flex items-center justify-end gap-1 pt-0.5">
                {saved && !dirty && (
                    <span title="Saved" className="text-green-600">
                        <Check className="w-4 h-4" />
                    </span>
                )}
                {dirty && (
                    <>
                        <button
                            type="button"
                            onClick={onRevert}
                            disabled={disabled}
                            className="p-1 text-neutral-400 hover:text-neutral-700 disabled:opacity-50"
                            aria-label={`Discard changes to ${row.code}`}
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={onSave}
                            disabled={disabled}
                            className="px-2.5 py-1 rounded bg-[#4e7e8c] text-white text-[11px] font-semibold uppercase tracking-wider hover:bg-[#3a5f6a] disabled:opacity-50"
                        >
                            Save
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
