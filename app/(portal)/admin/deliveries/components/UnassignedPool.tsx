'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { PlanningDelivery } from '@/lib/planning/utils';
import type { Driver } from '@/lib/drivers/types';
import { assignDriverToDelivery } from '@/lib/deliveries/actions';

interface Props {
    deliveries: PlanningDelivery[];
    drivers: Driver[];
}

export function UnassignedPool({ deliveries, drivers }: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();

    if (deliveries.length === 0) return null;

    const assign = (deliveryId: string, driverId: string) => {
        startTransition(async () => {
            await assignDriverToDelivery(deliveryId, driverId);
            router.refresh();
        });
    };

    return (
        <div className="border border-dashed border-neutral-300 rounded-lg p-3 space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">unassigned</div>
            {deliveries.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2 text-xs py-1">
                    <span className="truncate text-neutral-700">{d.org_name ?? d.site_name ?? d.delivery_number}</span>
                    <select defaultValue="" onChange={(e) => { if (e.target.value) assign(d.id, e.target.value); }} disabled={pending}
                        className="text-[11px] border border-neutral-200 rounded px-1.5 py-1 bg-white">
                        <option value="">assign</option>
                        {drivers.map((dr) => <option key={dr.id} value={dr.id}>{dr.name}</option>)}
                    </select>
                </div>
            ))}
        </div>
    );
}
