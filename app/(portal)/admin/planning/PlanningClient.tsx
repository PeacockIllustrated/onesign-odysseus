'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { groupDeliveriesByDriverAndDay, getWeekDates, type PlanningDelivery } from '@/lib/planning/utils';
import { optimiseRoute } from '@/lib/mapbox/client';
import { ONESIGN_HQ } from '@/lib/mapbox/utils';
import type { Driver } from '@/lib/drivers/types';
import { DayColumn } from './DayColumn';
import { DriverManagerPanel } from './DriverManagerPanel';

interface OptimisationResult {
    distance: number;
    duration: number;
    optimised: boolean;
    geometry?: GeoJSON.LineString;
}

interface Props {
    deliveries: PlanningDelivery[];
    activeDrivers: Driver[];
    allDrivers: Driver[];
    monday: string;
    includeWeekends: boolean;
}

export function PlanningClient({ deliveries, activeDrivers, allDrivers, monday, includeWeekends }: Props) {
    const router = useRouter();
    const [showDrivers, setShowDrivers] = useState(false);
    const [optimisations, setOptimisations] = useState<Record<string, OptimisationResult>>({});
    const [optimisingDriverId, setOptimisingDriverId] = useState<string | null>(null);

    const dates = getWeekDates(monday, includeWeekends);
    const grouped = groupDeliveriesByDriverAndDay(deliveries);

    const prevMonday = new Date(monday + 'T00:00:00');
    prevMonday.setDate(prevMonday.getDate() - 7);
    const nextMonday = new Date(monday + 'T00:00:00');
    nextMonday.setDate(nextMonday.getDate() + 7);

    const handleOptimise = useCallback(async (driverId: string, date: string) => {
        const key = `${driverId}-${date}`;
        const dayDeliveries = grouped[date]?.drivers[driverId] ?? [];
        if (dayDeliveries.length < 2) return;

        const geocoded = dayDeliveries.filter((d) => d.site_lat != null && d.site_lng != null);
        if (geocoded.length < 2) return;

        const driver = allDrivers.find((d) => d.id === driverId);
        const origin = driver?.home_lat && driver?.home_lng
            ? { lng: driver.home_lng, lat: driver.home_lat }
            : { lng: ONESIGN_HQ.lng, lat: ONESIGN_HQ.lat };

        const coords = [origin, ...geocoded.map((d) => ({ lng: d.site_lng!, lat: d.site_lat! }))];
        if (coords.length > 12) return;

        setOptimisingDriverId(driverId);
        try {
            const result = await optimiseRoute(coords);
            setOptimisations((prev) => ({
                ...prev,
                [key]: { distance: result.distance, duration: result.duration, optimised: true, geometry: result.geometry },
            }));
        } catch (err) {
            console.warn('Optimisation failed:', err);
        } finally {
            setOptimisingDriverId(null);
        }
    }, [grouped, allDrivers]);

    const handleShowMap = useCallback((_driverId: string, _date: string) => {
        // Future: open map panel with the optimised route polyline
    }, []);

    return (
        <div className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                    <Link href={`/admin/planning?week=${prevMonday.toISOString().slice(0, 10)}${includeWeekends ? '&weekends=1' : ''}`}
                        className="p-1.5 rounded border border-neutral-200 hover:bg-neutral-50">
                        <ChevronLeft size={16} />
                    </Link>
                    <span className="text-sm font-semibold text-neutral-900">
                        w/c {new Date(monday).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </span>
                    <Link href={`/admin/planning?week=${nextMonday.toISOString().slice(0, 10)}${includeWeekends ? '&weekends=1' : ''}`}
                        className="p-1.5 rounded border border-neutral-200 hover:bg-neutral-50">
                        <ChevronRight size={16} />
                    </Link>
                </div>
                <div className="flex items-center gap-2">
                    <Link href={`/admin/planning?week=${monday}&weekends=${includeWeekends ? '0' : '1'}`}
                        className="text-xs font-semibold px-3 py-1.5 rounded border border-neutral-200 hover:bg-neutral-50">
                        {includeWeekends ? 'Mon-Fri' : 'Mon-Sun'}
                    </Link>
                    <button onClick={() => setShowDrivers(true)} className="btn-secondary inline-flex items-center gap-1 text-sm">
                        <Users size={14} /> manage drivers
                    </button>
                </div>
            </div>

            <div className="flex gap-3 overflow-x-auto pb-4">
                {dates.map((date) => (
                    <DayColumn key={date} date={date} dayGroup={grouped[date] ?? null}
                        drivers={allDrivers} activeDrivers={activeDrivers}
                        optimisations={Object.fromEntries(
                            Object.entries(optimisations)
                                .filter(([k]) => k.endsWith(`-${date}`))
                                .map(([k, v]) => [k.split('-')[0], v])
                        )}
                        optimisingDriverId={optimisingDriverId}
                        onOptimise={(driverId) => handleOptimise(driverId, date)}
                        onShowMap={(driverId) => handleShowMap(driverId, date)}
                    />
                ))}
            </div>

            <DriverManagerPanel drivers={allDrivers} open={showDrivers}
                onClose={() => { setShowDrivers(false); router.refresh(); }} />
        </div>
    );
}
