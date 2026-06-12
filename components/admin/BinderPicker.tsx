'use client';

/**
 * SVG binder UI — a shared client-logo library surfaced wherever the app takes
 * an SVG.
 *
 *   - <BinderButton onPick> — opens a picker (thumbnail grid, filter by client,
 *     search) and hands the chosen logo's { name, svgSource } back to the host
 *     tool, which feeds it into its normal SVG ingestion path.
 *   - <SaveToBinderButton svg> — saves the current SVG into the binder (name +
 *     optional client).
 *
 * Both reuse the binder server actions (migration 066) and resolve client names
 * from the org list client-side, so any "upload SVG" surface gets the library
 * with a one-line drop-in.
 */

import { useEffect, useMemo, useState } from 'react';
import {
    Bookmark,
    BookMarked,
    Check,
    FolderOpen,
    Loader2,
    Search,
    Trash2,
    X,
} from 'lucide-react';
import {
    listBinderAssets,
    saveBinderAsset,
    deleteBinderAsset,
    type BinderAssetSummary,
} from '@/lib/binder/actions';
import { getClientListAction } from '@/lib/clients/actions';

const ACCENT = '#4e7e8c';

export interface PickedBinderAsset {
    name: string;
    svgSource: string;
}

type Client = { id: string; name: string };

const svgDataUrl = (svg: string) =>
    'data:image/svg+xml;utf8,' + encodeURIComponent(svg);

const CHECKER: React.CSSProperties = {
    backgroundColor: '#fff',
    backgroundImage:
        'linear-gradient(45deg,#eee 25%,transparent 25%),linear-gradient(-45deg,#eee 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eee 75%),linear-gradient(-45deg,transparent 75%,#eee 75%)',
    backgroundSize: '12px 12px',
    backgroundPosition: '0 0,0 6px,6px -6px,-6px 0',
};

function Modal({
    title,
    onClose,
    children,
    wide,
}: {
    title: string;
    onClose: () => void;
    children: React.ReactNode;
    wide?: boolean;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="absolute inset-0 bg-black/40"
            />
            <div
                className={`relative flex max-h-[85vh] w-full flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl ${
                    wide ? 'max-w-3xl' : 'max-w-md'
                }`}
            >
                <div className="flex shrink-0 items-center justify-between border-b border-neutral-100 px-4 py-3">
                    <h2 className="flex items-center gap-2 text-sm font-bold tracking-tight text-neutral-900">
                        <BookMarked size={16} style={{ color: ACCENT }} />
                        {title}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                    >
                        <X size={16} />
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}

// ─── Picker ─────────────────────────────────────────────────────────────────

export function BinderButton({
    onPick,
    label = 'From binder',
    className,
}: {
    onPick: (asset: PickedBinderAsset) => void;
    label?: string;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className={
                    className ??
                    'flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-[#4e7e8c] hover:bg-[#e8f0f3] hover:text-[#3a5f6a]'
                }
            >
                <FolderOpen size={14} /> {label}
            </button>
            {open && (
                <BinderModal
                    onClose={() => setOpen(false)}
                    onPick={(a) => {
                        onPick(a);
                        setOpen(false);
                    }}
                />
            )}
        </>
    );
}

function BinderModal({
    onClose,
    onPick,
}: {
    onClose: () => void;
    onPick: (asset: PickedBinderAsset) => void;
}) {
    const [assets, setAssets] = useState<BinderAssetSummary[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [orgId, setOrgId] = useState('');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        (async () => {
            const [a, c] = await Promise.all([
                listBinderAssets(),
                getClientListAction().catch(() => []),
            ]);
            if (!active) return;
            if (a.ok) setAssets(a.data);
            else setError(a.error);
            setClients(c.map((x) => ({ id: x.id, name: x.name })));
            setLoading(false);
        })();
        return () => {
            active = false;
        };
    }, []);

    const clientName = (id: string | null) =>
        id ? (clients.find((c) => c.id === id)?.name ?? null) : null;

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return assets.filter(
            (a) =>
                (!orgId || a.org_id === orgId) &&
                (!q || a.name.toLowerCase().includes(q)),
        );
    }, [assets, orgId, search]);

    const onDelete = async (id: string) => {
        const res = await deleteBinderAsset(id);
        if (!res.ok) {
            setError(res.error);
            return;
        }
        setAssets((prev) => prev.filter((a) => a.id !== id));
    };

    return (
        <Modal title="Logo binder" onClose={onClose} wide>
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-neutral-100 px-4 py-2.5">
                <div className="flex flex-1 items-center gap-1.5 rounded-md border border-neutral-300 px-2">
                    <Search size={13} className="text-neutral-400" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search logos…"
                        className="w-full bg-transparent py-1.5 text-xs focus:outline-none"
                    />
                </div>
                <select
                    value={orgId}
                    onChange={(e) => setOrgId(e.target.value)}
                    className="rounded-md border border-neutral-300 px-2 py-1.5 text-xs focus:border-[#4e7e8c] focus:outline-none"
                >
                    <option value="">All clients</option>
                    {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                            {c.name}
                        </option>
                    ))}
                </select>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {loading ? (
                    <div className="flex items-center justify-center gap-2 py-12 text-sm text-neutral-400">
                        <Loader2 size={16} className="animate-spin" /> Loading…
                    </div>
                ) : error ? (
                    <p className="py-12 text-center text-sm text-red-600">
                        {error}
                    </p>
                ) : filtered.length === 0 ? (
                    <p className="py-12 text-center text-sm text-neutral-400">
                        {assets.length === 0
                            ? 'No logos saved yet. Save one from the Image → SVG converter.'
                            : 'No logos match.'}
                    </p>
                ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {filtered.map((a) => (
                            <div
                                key={a.id}
                                className="group relative flex flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white transition-colors hover:border-[#4e7e8c]"
                            >
                                <button
                                    type="button"
                                    onClick={() =>
                                        onPick({
                                            name: a.name,
                                            svgSource: a.svg_source,
                                        })
                                    }
                                    className="flex flex-col text-left"
                                >
                                    <div
                                        className="flex h-24 items-center justify-center p-2"
                                        style={CHECKER}
                                    >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={svgDataUrl(a.svg_source)}
                                            alt={a.name}
                                            className="max-h-full max-w-full object-contain"
                                        />
                                    </div>
                                    <div className="border-t border-neutral-100 px-2 py-1.5">
                                        <p className="truncate text-xs font-medium text-neutral-800">
                                            {a.name}
                                        </p>
                                        <p className="truncate text-[10px] text-neutral-400">
                                            {clientName(a.org_id) ?? 'Unassigned'}
                                        </p>
                                    </div>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onDelete(a.id)}
                                    aria-label={`Delete ${a.name}`}
                                    className="absolute right-1.5 top-1.5 rounded bg-white/85 p-1 text-neutral-400 opacity-0 shadow-sm backdrop-blur transition-opacity hover:text-red-500 group-hover:opacity-100"
                                >
                                    <Trash2 size={13} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Modal>
    );
}

// ─── Save ───────────────────────────────────────────────────────────────────

export function SaveToBinderButton({
    svg,
    defaultName,
    className,
}: {
    svg: string | null | undefined;
    defaultName?: string;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                disabled={!svg}
                className={
                    className ??
                    'flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-60'
                }
            >
                <Bookmark size={14} /> Save to binder
            </button>
            {open && svg && (
                <SaveModal
                    svg={svg}
                    defaultName={defaultName ?? 'logo'}
                    onClose={() => setOpen(false)}
                />
            )}
        </>
    );
}

function SaveModal({
    svg,
    defaultName,
    onClose,
}: {
    svg: string;
    defaultName: string;
    onClose: () => void;
}) {
    const [name, setName] = useState(defaultName);
    const [orgId, setOrgId] = useState('');
    const [clients, setClients] = useState<Client[]>([]);
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        getClientListAction()
            .then((c) => {
                if (active) setClients(c.map((x) => ({ id: x.id, name: x.name })));
            })
            .catch(() => {});
        return () => {
            active = false;
        };
    }, []);

    const onSave = async () => {
        setBusy(true);
        setError(null);
        const res = await saveBinderAsset({
            name: name.trim() || defaultName,
            svgSource: svg,
            orgId: orgId || null,
        });
        setBusy(false);
        if (!res.ok) {
            setError(res.error);
            return;
        }
        setDone(true);
        setTimeout(onClose, 700);
    };

    return (
        <Modal title="Save to binder" onClose={onClose}>
            <div className="space-y-3 p-4">
                <label className="block">
                    <span className="text-[11px] font-medium text-neutral-500">
                        Logo name
                    </span>
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="mt-1 w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm focus:border-[#4e7e8c] focus:outline-none"
                    />
                </label>
                <label className="block">
                    <span className="text-[11px] font-medium text-neutral-500">
                        Client (optional)
                    </span>
                    <select
                        value={orgId}
                        onChange={(e) => setOrgId(e.target.value)}
                        className="mt-1 w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm focus:border-[#4e7e8c] focus:outline-none"
                    >
                        <option value="">Unassigned</option>
                        {clients.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name}
                            </option>
                        ))}
                    </select>
                </label>
                {error && <p className="text-xs text-red-600">{error}</p>}
                <button
                    type="button"
                    onClick={onSave}
                    disabled={busy || done}
                    className="flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                    style={{ background: ACCENT }}
                >
                    {done ? (
                        <>
                            <Check size={14} /> Saved
                        </>
                    ) : busy ? (
                        <>
                            <Loader2 size={14} className="animate-spin" /> Saving…
                        </>
                    ) : (
                        <>
                            <Bookmark size={14} /> Save to binder
                        </>
                    )}
                </button>
            </div>
        </Modal>
    );
}
