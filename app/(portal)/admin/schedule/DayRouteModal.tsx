'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { MapPin, Route, TriangleAlert } from 'lucide-react';
import { optimiseRoute } from '@/lib/mapbox/client';
import { ONESIGN_HQ, formatDistance, formatDuration } from '@/lib/mapbox/utils';
import type { PlanningDelivery } from '@/lib/planning/utils';
import {
    MAX_ROUTE_STOPS,
    applyOptimisedOrder,
    deliveryLabel,
    groupByDriver,
    routableStops,
    routeBlocker,
    simplifyLine,
    staticRouteMapUrl,
    type DriverDay,
} from '@/lib/schedule/deliveries';
import { DAY_NAMES, dayIndex, formatLong } from '@/lib/schedule/utils';

interface RouteState {
    stops: PlanningDelivery[];
    distance: number;
    duration: number;
    mapUrl: string | null;
}

interface Props {
    date: string;
    deliveries: PlanningDelivery[];
    onClose: () => void;
}

/**
 * The driver's day: each round in the order it should actually be driven,
 * with the distance and time it takes.
 *
 * Routing runs through the same Mapbox optimiser the delivery planner uses.
 * The difference is that the result is applied — stops are re-ordered into the
 * driven sequence rather than left in entry order — which is the part that
 * tells a driver anything.
 */
export function DayRouteModal({ date, deliveries, onClose }: Props) {
    const rounds = groupByDriver(deliveries);
    const [routes, setRoutes] = useState<Record<string, RouteState>>({});
    const [busy, setBusy] = useState<string | null>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const key = (r: DriverDay) => r.driverId ?? 'unassigned';

    const optimise = useCallback(async (round: DriverDay) => {
        const k = round.driverId ?? 'unassigned';
        const stops = routableStops(round.stops);
        setBusy(k);
        setErrors((prev) => ({ ...prev, [k]: '' }));
        try {
            // Every round starts from the workshop; the driver's own home
            // origin lives on the delivery planner and isn't loaded here.
            const result = await optimiseRoute([
                { lng: ONESIGN_HQ.lng, lat: ONESIGN_HQ.lat },
                ...stops.map((s) => ({ lng: s.site_lng!, lat: s.site_lat! })),
            ]);
            const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';
            setRoutes((prev) => ({
                ...prev,
                [k]: {
                    stops: applyOptimisedOrder(stops, result.waypoints),
                    distance: result.distance,
                    duration: result.duration,
                    mapUrl: staticRouteMapUrl(simplifyLine(result.geometry), token),
                },
            }));
        } catch {
            setErrors((prev) => ({
                ...prev,
                [k]: 'Could not plan that route — check the Mapbox key and the site postcodes.',
            }));
        } finally {
            setBusy(null);
        }
    }, []);

    // Close on Escape, like the board's other dialogs.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div
            className="sb-overlay"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="sb-modal" style={{ maxWidth: '44rem' }}>
                <div className="sb-mhead">
                    <span>
                        Deliveries · {DAY_NAMES[dayIndex(date)]} {formatLong(date)}
                    </span>
                    <Link href="/admin/deliveries" className="sb-mapbtn">
                        Open Deliveries ↗
                    </Link>
                </div>

                <div style={{ padding: '1.25rem' }}>
                    {rounds.length === 0 && (
                        <p className="sb-note" style={{ margin: 0 }}>
                            No deliveries booked for this day.
                        </p>
                    )}

                    {rounds.map((round) => {
                        const k = key(round);
                        const route = routes[k];
                        const blocker = routeBlocker(round.stops);
                        const shown = route?.stops ?? round.stops;
                        const missing = round.stops.length - routableStops(round.stops).length;

                        return (
                            <section key={k} className="sb-route">
                                <header className="sb-routehead">
                                    <div>
                                        <b>{round.driverName}</b>
                                        <span className="sb-routecount">
                                            {round.stops.length} stop
                                            {round.stops.length === 1 ? '' : 's'}
                                        </span>
                                    </div>
                                    {route ? (
                                        <span className="sb-routetotal">
                                            <Route size={13} /> {formatDistance(route.distance)} ·{' '}
                                            {formatDuration(route.duration)}
                                        </span>
                                    ) : (
                                        <button
                                            className="sb-btn"
                                            disabled={!!blocker || busy === k}
                                            onClick={() => optimise(round)}
                                            title={
                                                blocker === 'too-few'
                                                    ? 'Needs at least two stops with a geocoded postcode'
                                                    : blocker === 'too-many'
                                                      ? `Mapbox plans up to ${MAX_ROUTE_STOPS} stops at once`
                                                      : undefined
                                            }
                                        >
                                            {busy === k ? 'Planning…' : 'Plan route'}
                                        </button>
                                    )}
                                </header>

                                <ol className="sb-routelist">
                                    {shown.map((stop, i) => (
                                        <li key={stop.id}>
                                            <span className="n">{route ? i + 1 : '·'}</span>
                                            <span className="who">{deliveryLabel(stop)}</span>
                                            <span className="where">
                                                {stop.site_name ?? stop.delivery_number}
                                            </span>
                                            {stop.site_lat == null && (
                                                <span className="sb-routewarn" title="No geocoded postcode">
                                                    <MapPin size={11} /> no location
                                                </span>
                                            )}
                                        </li>
                                    ))}
                                </ol>

                                {route?.mapUrl && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        className="sb-routemap"
                                        src={route.mapUrl}
                                        alt={`Route for ${round.driverName}`}
                                        loading="lazy"
                                    />
                                )}

                                {blocker === 'too-many' && (
                                    <p className="sb-routenote">
                                        <TriangleAlert size={12} /> More than {MAX_ROUTE_STOPS}{' '}
                                        stops — split this round across drivers or days to plan it.
                                    </p>
                                )}
                                {blocker === 'too-few' && missing > 0 && (
                                    <p className="sb-routenote">
                                        <TriangleAlert size={12} /> {missing} stop
                                        {missing === 1 ? ' has' : 's have'} no geocoded postcode, so
                                        this round can&rsquo;t be planned yet.
                                    </p>
                                )}
                                {errors[k] && <p className="sb-error">{errors[k]}</p>}
                            </section>
                        );
                    })}
                </div>

                <div className="sb-mfoot">
                    <span className="sb-grow" />
                    <button className="sb-btn primary" onClick={onClose}>
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}
