'use client';

import type { DayGroup } from '@/lib/planning/utils';
import type { Driver } from '@/lib/drivers/types';
import { DriverGroup } from './DriverGroup';
import { UnassignedPool } from './UnassignedPool';

interface OptimisationResult {
    distance: number;
    duration: number;
    optimised: boolean;
}

interface Props {
    date: string;
    dayGroup: DayGroup | null;
    drivers: Driver[];
    activeDrivers: Driver[];
    optimisations: Record<string, OptimisationResult>;
    optimisingDriverId: string | null;
    onOptimise: (driverId: string) => void;
    onShowMap: (driverId: string) => void;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function DayColumn({ date, dayGroup, drivers, activeDrivers, optimisations, optimisingDriverId, onOptimise, onShowMap }: Props) {
    const d = new Date(date + 'T00:00:00');
    const dayName = DAY_NAMES[d.getDay()];
    const dayNum = d.getDate();
    const isToday = date === new Date().toISOString().slice(0, 10);

    const driverGroups = dayGroup?.drivers ?? {};
    const unassigned = dayGroup?.unassigned ?? [];
    const totalStops = Object.values(driverGroups).reduce((sum, arr) => sum + arr.length, 0) + unassigned.length;

    return (
        <div className={`flex-1 min-w-[200px] border rounded-lg p-3 space-y-2 ${isToday ? 'border-[#4e7e8c] bg-[#e8f0f3]/30' : 'border-neutral-200 bg-white'}`}>
            <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-neutral-900">{dayName} {dayNum}</div>
                {totalStops > 0 && <span className="text-[10px] text-neutral-400">{totalStops} stop{totalStops !== 1 ? 's' : ''}</span>}
            </div>

            {Object.entries(driverGroups).map(([driverId, deliveries]) => {
                const driver = drivers.find((dr) => dr.id === driverId);
                if (!driver) return null;
                return (
                    <DriverGroup key={driverId} driver={driver} deliveries={deliveries}
                        optimisation={optimisations[driverId] ?? null}
                        onOptimise={() => onOptimise(driverId)}
                        onShowMap={() => onShowMap(driverId)}
                        optimising={optimisingDriverId === driverId}
                    />
                );
            })}

            <UnassignedPool deliveries={unassigned} drivers={activeDrivers} />

            {totalStops === 0 && <p className="text-xs text-neutral-400 italic text-center py-4">no deliveries</p>}
        </div>
    );
}
