'use client';

import { Truck } from 'lucide-react';
import { formatDistance, formatDuration } from '@/lib/mapbox/utils';
import type { PlanningDelivery } from '@/lib/planning/utils';
import type { Driver } from '@/lib/drivers/types';

interface OptimisationResult {
    distance: number;
    duration: number;
    optimised: boolean;
}

interface Props {
    driver: Driver;
    deliveries: PlanningDelivery[];
    optimisation: OptimisationResult | null;
    onOptimise: () => void;
    onShowMap: () => void;
    optimising: boolean;
}

export function DriverGroup({ driver, deliveries, optimisation, onOptimise, onShowMap, optimising }: Props) {
    return (
        <div className="border border-neutral-200 rounded-lg bg-white p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <Truck size={14} className="text-neutral-500 shrink-0" />
                    <span className="text-sm font-bold truncate">{driver.name}</span>
                    <span className="text-[10px] text-neutral-400">{deliveries.length} stop{deliveries.length !== 1 ? 's' : ''}</span>
                </div>
                {optimisation && (
                    <div className="text-[10px] text-neutral-500 shrink-0">
                        {formatDistance(optimisation.distance)} · {formatDuration(optimisation.duration)}
                        {optimisation.optimised && <span className="text-green-700 ml-1">✓</span>}
                    </div>
                )}
            </div>

            <ul className="space-y-1">
                {deliveries.map((d, i) => (
                    <li key={d.id} className="text-xs text-neutral-700 flex items-center gap-2 py-1 px-2 rounded bg-neutral-50">
                        <span className="text-neutral-400 font-mono w-4">{i + 1}</span>
                        <span className="truncate">{d.org_name ?? d.site_name ?? d.delivery_number}</span>
                    </li>
                ))}
            </ul>

            <div className="flex gap-1">
                <button type="button" onClick={onOptimise} disabled={optimising || deliveries.length < 2}
                    className="text-[11px] font-semibold text-[#4e7e8c] hover:underline disabled:opacity-40 disabled:no-underline">
                    {optimising ? 'optimising...' : 'optimise route'}
                </button>
                {optimisation?.optimised && (
                    <button type="button" onClick={onShowMap} className="text-[11px] font-semibold text-neutral-600 hover:underline ml-2">
                        show on map
                    </button>
                )}
            </div>

            {deliveries.length > 11 && (
                <p className="text-[10px] text-amber-700 bg-amber-50 rounded px-2 py-1">
                    12+ stops — split across drivers or days for optimisation
                </p>
            )}
        </div>
    );
}
