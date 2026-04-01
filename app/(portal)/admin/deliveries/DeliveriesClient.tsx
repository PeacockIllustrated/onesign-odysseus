'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, Truck, X, AlertTriangle } from 'lucide-react';
import {
    getDeliveryListAction,
} from '@/lib/deliveries/actions';
import {
    DELIVERY_STATUS_LABELS,
    DELIVERY_STATUS_COLORS,
    POD_STATUS_LABELS,
    POD_STATUS_COLORS,
    formatDeliveryDate,
    isDeliveryOverdue,
} from '@/lib/deliveries/utils';
import type { Delivery, DeliveryStatus } from '@/lib/deliveries/types';
import { CreateDeliveryModal } from './CreateDeliveryModal';

const STATUS_TABS = ['all', 'scheduled', 'in_transit', 'delivered', 'failed'] as const;

interface DeliveriesClientProps {
    initialDeliveries: Delivery[];
}

export function DeliveriesClient({ initialDeliveries }: DeliveriesClientProps) {
    const router = useRouter();
    const [deliveries, setDeliveries] = useState(initialDeliveries);
    const [activeStatus, setActiveStatus] = useState('all');
    const [search, setSearch] = useState('');
    const [, startTransition] = useTransition();
    const [showNewModal, setShowNewModal] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    function handleFilterChange(status: string, searchValue: string) {
        startTransition(async () => {
            const updated = await getDeliveryListAction({
                status: status !== 'all' ? status : undefined,
                search: searchValue || undefined,
            });
            setDeliveries(updated);
        });
    }

    function handleStatusTab(status: string) {
        setActiveStatus(status);
        handleFilterChange(status, search);
    }

    function handleSearch(value: string) {
        setSearch(value);
        handleFilterChange(activeStatus, value);
    }

    return (
        <div className="p-6 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-xl font-semibold text-neutral-900">Deliveries</h1>
                    <p className="text-sm text-neutral-500 mt-0.5">
                        {deliveries.length} deliver{deliveries.length !== 1 ? 'ies' : 'y'}
                    </p>
                </div>
                <button
                    onClick={() => setShowNewModal(true)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-black text-white rounded-[var(--radius-sm)] hover:bg-neutral-800"
                >
                    <Plus size={16} />
                    Schedule Delivery
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
                <div className="flex gap-1 flex-wrap">
                    {STATUS_TABS.map((tab) => (
                        <button
                            key={tab}
                            onClick={() => handleStatusTab(tab)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                                activeStatus === tab
                                    ? 'bg-black text-white'
                                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                            }`}
                        >
                            {tab === 'all'
                                ? 'All'
                                : DELIVERY_STATUS_LABELS[tab as DeliveryStatus]}
                        </button>
                    ))}
                </div>
                <div className="relative sm:ml-auto">
                    <Search
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
                    />
                    <input
                        value={search}
                        onChange={(e) => handleSearch(e.target.value)}
                        placeholder="Search deliveries..."
                        className="pl-8 pr-3 py-1.5 text-sm border border-neutral-200 rounded-[var(--radius-sm)] w-64 focus:outline-none focus:ring-2 focus:ring-black"
                    />
                </div>
            </div>

            {/* Table */}
            {deliveries.length === 0 ? (
                <div className="text-center py-16 text-neutral-400">
                    <Truck size={32} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No deliveries found</p>
                </div>
            ) : (
                <div className="border border-neutral-200 rounded-[var(--radius-sm)] overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-neutral-50 border-b border-neutral-200">
                            <tr>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                                    Delivery #
                                </th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                                    Driver
                                </th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide hidden md:table-cell">
                                    Scheduled
                                </th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                                    Status
                                </th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide hidden lg:table-cell">
                                    POD
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                            {deliveries.map((delivery) => {
                                const overdue = isDeliveryOverdue(delivery.scheduled_date, delivery.status);
                                return (
                                    <tr
                                        key={delivery.id}
                                        onClick={() =>
                                            router.push(`/admin/deliveries/${delivery.id}`)
                                        }
                                        className="hover:bg-neutral-50 cursor-pointer transition-colors"
                                    >
                                        <td className="px-4 py-3 font-mono text-xs font-medium text-neutral-900">
                                            {delivery.delivery_number}
                                        </td>
                                        <td className="px-4 py-3 font-medium text-neutral-900">
                                            {delivery.driver_name || <span className="text-neutral-400">Unassigned</span>}
                                        </td>
                                        <td className="px-4 py-3 text-neutral-600 hidden md:table-cell">
                                            <span className={overdue ? 'text-red-600 font-medium' : ''}>
                                                {formatDeliveryDate(delivery.scheduled_date)}
                                                {overdue && (
                                                    <AlertTriangle size={12} className="inline ml-1 -mt-0.5" />
                                                )}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span
                                                className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${DELIVERY_STATUS_COLORS[delivery.status]}`}
                                            >
                                                {DELIVERY_STATUS_LABELS[delivery.status]}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 hidden lg:table-cell">
                                            <span
                                                className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${POD_STATUS_COLORS[delivery.pod_status]}`}
                                            >
                                                {POD_STATUS_LABELS[delivery.pod_status]}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* New Delivery Modal */}
            {showNewModal && (
                <CreateDeliveryModal
                    onClose={() => setShowNewModal(false)}
                    onCreated={(id) => router.push(`/admin/deliveries/${id}`)}
                    onError={setErrorMessage}
                />
            )}
        </div>
    );
}
