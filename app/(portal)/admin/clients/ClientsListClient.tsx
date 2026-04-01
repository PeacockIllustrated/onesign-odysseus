'use client';

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, Building2, X } from 'lucide-react';
import { getClientListAction } from '@/lib/clients/actions';
import type { ClientSummary } from '@/lib/clients/types';
import { CreateClientModal } from './CreateClientModal';

interface ClientsListClientProps {
    initialClients: ClientSummary[];
}

export function ClientsListClient({ initialClients }: ClientsListClientProps) {
    const router = useRouter();
    const [clients, setClients] = useState(initialClients);
    const [search, setSearch] = useState('');
    const [activeTag, setActiveTag] = useState<string | null>(null);
    const [, startTransition] = useTransition();
    const [showNewModal, setShowNewModal] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // Derive unique tags from all clients
    const allTags = useMemo(() => {
        const tagSet = new Set<string>();
        initialClients.forEach(c => {
            (c.tags || []).forEach(t => tagSet.add(t));
        });
        return Array.from(tagSet).sort();
    }, [initialClients]);

    function handleFilterChange(searchValue: string, tag: string | null) {
        startTransition(async () => {
            const updated = await getClientListAction({
                search: searchValue || undefined,
                tag: tag || undefined,
            });
            setClients(updated);
        });
    }

    function handleSearch(value: string) {
        setSearch(value);
        handleFilterChange(value, activeTag);
    }

    function handleTagClick(tag: string) {
        const newTag = activeTag === tag ? null : tag;
        setActiveTag(newTag);
        handleFilterChange(search, newTag);
    }

    function formatDate(dateStr: string) {
        return new Date(dateStr).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        });
    }

    function getTagColor(tag: string): string {
        if (tag.toLowerCase() === 'customer') {
            return 'bg-[#e8f0f3] text-[#3a5f6a]';
        }
        return 'bg-neutral-100 text-neutral-600';
    }

    return (
        <div className="p-6 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-xl font-semibold text-neutral-900">Clients</h1>
                    <p className="text-sm text-neutral-500 mt-0.5">
                        {clients.length} client{clients.length !== 1 ? 's' : ''}
                    </p>
                </div>
                <button
                    onClick={() => setShowNewModal(true)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-black text-white rounded-[var(--radius-sm)] hover:bg-neutral-800"
                >
                    <Plus size={16} />
                    New Client
                </button>
            </div>

            {errorMessage && (
                <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 mb-4 flex items-center justify-between">
                    <span className="text-sm font-medium">{errorMessage}</span>
                    <button onClick={() => setErrorMessage(null)}>
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
                {allTags.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                        {allTags.map(tag => (
                            <button
                                key={tag}
                                onClick={() => handleTagClick(tag)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                                    activeTag === tag
                                        ? 'bg-black text-white'
                                        : getTagColor(tag)
                                } hover:opacity-80`}
                            >
                                {tag}
                            </button>
                        ))}
                    </div>
                )}
                <div className="relative sm:ml-auto">
                    <Search
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
                    />
                    <input
                        value={search}
                        onChange={e => handleSearch(e.target.value)}
                        placeholder="Search clients..."
                        className="pl-8 pr-3 py-1.5 text-sm border border-neutral-200 rounded-[var(--radius-sm)] w-64 focus:outline-none focus:ring-2 focus:ring-black"
                    />
                </div>
            </div>

            {/* Table */}
            {clients.length === 0 ? (
                <div className="text-center py-16 text-neutral-400">
                    <Building2 size={32} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No clients found</p>
                </div>
            ) : (
                <div className="border border-neutral-200 rounded-[var(--radius-sm)] overflow-hidden overflow-x-auto">
                    <table className="w-full text-sm min-w-[640px]">
                        <thead className="bg-neutral-50 border-b border-neutral-200">
                            <tr>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                                    Company
                                </th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide hidden md:table-cell">
                                    Primary Contact
                                </th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide hidden lg:table-cell">
                                    Sites
                                </th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide hidden md:table-cell">
                                    Tags
                                </th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide hidden lg:table-cell">
                                    Phone
                                </th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide hidden lg:table-cell">
                                    Created
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                            {clients.map(client => (
                                <tr
                                    key={client.id}
                                    onClick={() =>
                                        router.push(`/admin/clients/${client.id}`)
                                    }
                                    className="hover:bg-neutral-50 cursor-pointer transition-colors"
                                >
                                    <td className="px-4 py-3 font-medium text-neutral-900">
                                        {client.name}
                                    </td>
                                    <td className="px-4 py-3 text-neutral-600 hidden md:table-cell">
                                        {client.primary_contact_name || (
                                            <span className="text-neutral-300">
                                                --
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-neutral-600 hidden lg:table-cell">
                                        {client.site_count}
                                    </td>
                                    <td className="px-4 py-3 hidden md:table-cell">
                                        <div className="flex gap-1 flex-wrap">
                                            {(client.tags || []).map(tag => (
                                                <span
                                                    key={tag}
                                                    className={`inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-full ${getTagColor(tag)}`}
                                                >
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-neutral-600 hidden lg:table-cell">
                                        {client.phone || (
                                            <span className="text-neutral-300">
                                                --
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-neutral-500 hidden lg:table-cell">
                                        {formatDate(client.created_at)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* New Client Modal */}
            {showNewModal && (
                <CreateClientModal
                    onClose={() => setShowNewModal(false)}
                    onCreated={id => router.push(`/admin/clients/${id}`)}
                    onError={setErrorMessage}
                />
            )}
        </div>
    );
}
