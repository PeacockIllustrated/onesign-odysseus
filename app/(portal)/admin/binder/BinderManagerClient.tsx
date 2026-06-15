'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BookMarked, Download, ImageUp, Search, Trash2 } from 'lucide-react';
import {
    updateBinderAsset,
    deleteBinderAsset,
    type BinderAssetSummary,
} from '@/lib/binder/actions';

const ACCENT = '#4e7e8c';
type Client = { id: string; name: string };

const svgDataUrl = (svg: string) => 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);

const CHECKER: React.CSSProperties = {
    backgroundColor: '#fff',
    backgroundImage:
        'linear-gradient(45deg,#eee 25%,transparent 25%),linear-gradient(-45deg,#eee 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eee 75%),linear-gradient(-45deg,transparent 75%,#eee 75%)',
    backgroundSize: '14px 14px',
    backgroundPosition: '0 0,0 7px,7px -7px,-7px 0',
};

function download(svg: string, name: string) {
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export function BinderManagerClient({
    initialAssets,
    clients,
}: {
    initialAssets: BinderAssetSummary[];
    clients: Client[];
}) {
    const [assets, setAssets] = useState<BinderAssetSummary[]>(initialAssets);
    const [search, setSearch] = useState('');
    const [orgFilter, setOrgFilter] = useState('');
    const [error, setError] = useState<string | null>(null);

    const clientName = (id: string | null) =>
        id ? (clients.find((c) => c.id === id)?.name ?? null) : null;

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return assets.filter(
            (a) =>
                (!orgFilter || a.org_id === orgFilter) &&
                (!q || a.name.toLowerCase().includes(q)),
        );
    }, [assets, search, orgFilter]);

    const patch = (id: string, fields: Partial<BinderAssetSummary>) =>
        setAssets((prev) => prev.map((a) => (a.id === id ? { ...a, ...fields } : a)));

    const saveMeta = async (a: BinderAssetSummary) => {
        const res = await updateBinderAsset({ id: a.id, name: a.name.trim() || 'logo', orgId: a.org_id });
        if (!res.ok) setError(res.error);
    };

    const onDelete = async (id: string) => {
        const res = await deleteBinderAsset(id);
        if (!res.ok) {
            setError(res.error);
            return;
        }
        setAssets((prev) => prev.filter((a) => a.id !== id));
    };

    return (
        <div className="mx-auto max-w-6xl pb-12">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <Link
                        href="/admin/tools"
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
                    >
                        <ArrowLeft size={14} /> Studio
                    </Link>
                    <div>
                        <h1 className="flex items-center gap-2 text-base md:text-lg font-bold tracking-tight text-neutral-900">
                            <BookMarked size={18} style={{ color: ACCENT }} /> Logo binder
                        </h1>
                        <p className="hidden sm:block text-xs text-neutral-500">
                            Your shared library of client logos — used at every &ldquo;upload SVG&rdquo; point
                        </p>
                    </div>
                </div>
                <Link
                    href="/admin/visualiser/vectorise"
                    className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white"
                    style={{ background: ACCENT }}
                >
                    <ImageUp size={14} /> Add via converter
                </Link>
            </header>

            <div className="mt-4 flex flex-wrap items-center gap-2">
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
                    value={orgFilter}
                    onChange={(e) => setOrgFilter(e.target.value)}
                    className="rounded-md border border-neutral-300 px-2 py-1.5 text-xs focus:border-[#4e7e8c] focus:outline-none"
                >
                    <option value="">All clients</option>
                    {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                            {c.name}
                        </option>
                    ))}
                </select>
                <span className="text-xs text-neutral-400">
                    {filtered.length} of {assets.length}
                </span>
            </div>

            {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

            {filtered.length === 0 ? (
                <p className="py-16 text-center text-sm text-neutral-400">
                    {assets.length === 0
                        ? 'No logos saved yet. Trace one in the Image → SVG converter and hit “Save to binder”.'
                        : 'No logos match.'}
                </p>
            ) : (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {filtered.map((a) => (
                        <div
                            key={a.id}
                            className="group flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white"
                        >
                            <div className="flex h-28 items-center justify-center p-3" style={CHECKER}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={svgDataUrl(a.svg_source)}
                                    alt={a.name}
                                    className="max-h-full max-w-full object-contain"
                                />
                            </div>
                            <div className="flex flex-col gap-1.5 border-t border-neutral-100 p-2">
                                <input
                                    value={a.name}
                                    onChange={(e) => patch(a.id, { name: e.target.value })}
                                    onBlur={() => void saveMeta(a)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') e.currentTarget.blur();
                                    }}
                                    className="w-full rounded border border-transparent px-1 py-0.5 text-xs font-medium text-neutral-800 hover:border-neutral-200 focus:border-[#4e7e8c] focus:outline-none"
                                    aria-label="Logo name"
                                />
                                <select
                                    value={a.org_id ?? ''}
                                    onChange={(e) => {
                                        const orgId = e.target.value || null;
                                        patch(a.id, { org_id: orgId });
                                        void updateBinderAsset({ id: a.id, name: a.name.trim() || 'logo', orgId });
                                    }}
                                    className="w-full rounded border border-neutral-200 px-1 py-0.5 text-[11px] text-neutral-600 focus:border-[#4e7e8c] focus:outline-none"
                                    aria-label="Client"
                                    title={clientName(a.org_id) ?? 'Unassigned'}
                                >
                                    <option value="">Unassigned</option>
                                    {clients.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.name}
                                        </option>
                                    ))}
                                </select>
                                <div className="flex items-center justify-between pt-0.5">
                                    <span className="text-[10px] text-neutral-400">
                                        {new Date(a.updated_at).toLocaleDateString('en-GB')}
                                    </span>
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => download(a.svg_source, a.name)}
                                            aria-label={`Download ${a.name}`}
                                            className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                                        >
                                            <Download size={13} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void onDelete(a.id)}
                                            aria-label={`Delete ${a.name}`}
                                            className="rounded p-1 text-neutral-300 hover:bg-red-50 hover:text-red-500"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
