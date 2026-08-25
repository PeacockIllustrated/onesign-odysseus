/**
 * Deliveries as they appear on the fitting schedule.
 *
 * The board owns fitting work; deliveries belong to the Deliveries module and
 * are rendered here read-only, so the office can see the whole day — vans out
 * fitting and drivers out dropping — on one surface. Nothing here writes.
 *
 * DOM-free and side-effect-free so the grouping and route-ordering logic is
 * Vitest-covered without a browser or a live Mapbox key.
 */

import type { OptimisedWaypoint } from '@/lib/mapbox/types';
import type { PlanningDelivery } from '@/lib/planning/utils';

/** One driver's stops on one day. */
export interface DriverDay {
    /** null when the delivery has no driver assigned yet. */
    driverId: string | null;
    driverName: string;
    stops: PlanningDelivery[];
}

/** `date -> deliveries`, for the board's per-day cells. */
export function deliveriesByDate(
    deliveries: PlanningDelivery[]
): Map<string, PlanningDelivery[]> {
    const map = new Map<string, PlanningDelivery[]>();
    for (const d of deliveries) {
        const arr = map.get(d.scheduled_date);
        if (arr) arr.push(d);
        else map.set(d.scheduled_date, [d]);
    }
    return map;
}

/**
 * Split a day's deliveries into rounds, one per driver. Unassigned stops come
 * last under their own heading — they still have to be someone's problem.
 */
export function groupByDriver(deliveries: PlanningDelivery[]): DriverDay[] {
    const byDriver = new Map<string, DriverDay>();
    const unassigned: PlanningDelivery[] = [];

    for (const d of deliveries) {
        if (!d.driver_id) {
            unassigned.push(d);
            continue;
        }
        const existing = byDriver.get(d.driver_id);
        if (existing) {
            existing.stops.push(d);
        } else {
            byDriver.set(d.driver_id, {
                driverId: d.driver_id,
                driverName: d.driver_name ?? 'Driver',
                stops: [d],
            });
        }
    }

    const rounds = [...byDriver.values()].sort((a, b) =>
        a.driverName.localeCompare(b.driverName)
    );
    if (unassigned.length > 0) {
        rounds.push({ driverId: null, driverName: 'Unassigned', stops: unassigned });
    }
    return rounds;
}

/** Stops that can actually be routed — the rest have no coordinates yet. */
export function routableStops(stops: PlanningDelivery[]): PlanningDelivery[] {
    return stops.filter((s) => s.site_lat != null && s.site_lng != null);
}

/** Mapbox's free tier takes 12 coordinates, one of which is the origin. */
export const MAX_ROUTE_STOPS = 11;

export type RouteBlocker = 'too-few' | 'too-many' | null;

export function routeBlocker(stops: PlanningDelivery[]): RouteBlocker {
    const routable = routableStops(stops);
    if (routable.length < 2) return 'too-few';
    if (routable.length > MAX_ROUTE_STOPS) return 'too-many';
    return null;
}

/**
 * Put the stops into the order the driver should actually drive them.
 *
 * Mapbox returns one waypoint per *input* coordinate, carrying the position it
 * takes in the optimised trip. The input is `[origin, ...stops]`, so stop `i`
 * is waypoint `i + 1`. Sorting by that index is the whole point of optimising
 * — the existing delivery planner asks for a route and then still lists the
 * stops in the order they were entered, which tells the driver nothing.
 */
export function applyOptimisedOrder(
    stops: PlanningDelivery[],
    waypoints: OptimisedWaypoint[]
): PlanningDelivery[] {
    if (waypoints.length !== stops.length + 1) return stops;
    return stops
        .map((stop, i) => ({ stop, order: waypoints[i + 1]?.waypointIndex ?? i + 1 }))
        .sort((a, b) => a.order - b.order)
        .map((x) => x.stop);
}

/** What the card and the route list call a stop. */
export function deliveryLabel(d: PlanningDelivery): string {
    return d.org_name?.trim() || d.site_name?.trim() || d.delivery_number;
}

/**
 * A route drawn by the Mapbox Static Images API — an <img>, so the board gets
 * a picture of the journey without pulling a map canvas onto the page.
 *
 * Returns null when there's no token, or when the encoded geometry would make
 * the URL too long to be served; the caller falls back to the ordered list.
 */
const STATIC_MAP_MAX_URL = 8000;

export function staticRouteMapUrl(
    geometry: GeoJSON.LineString,
    token: string,
    { width = 640, height = 300, colour = '4e7e8c' } = {}
): string | null {
    if (!token) return null;
    if (!geometry?.coordinates?.length) return null;

    const overlay = `geojson(${encodeURIComponent(
        JSON.stringify({
            type: 'Feature',
            properties: { stroke: `#${colour}`, 'stroke-width': 4, 'stroke-opacity': 0.9 },
            geometry,
        })
    )})`;

    const url =
        `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/` +
        `${overlay}/auto/${width}x${height}@2x?padding=30&access_token=${token}`;

    return url.length > STATIC_MAP_MAX_URL ? null : url;
}

/**
 * Drop points from a line until it is coarse enough to fit in a static-map
 * URL. Keeps the first and last coordinate so the route still starts and ends
 * where it should.
 */
export function simplifyLine(
    geometry: GeoJSON.LineString,
    maxPoints = 100
): GeoJSON.LineString {
    const coords = geometry.coordinates;
    if (coords.length <= maxPoints) return geometry;

    const step = Math.ceil(coords.length / maxPoints);
    const out = coords.filter((_, i) => i % step === 0);
    const last = coords[coords.length - 1];
    if (out[out.length - 1] !== last) out.push(last);
    return { ...geometry, coordinates: out };
}
