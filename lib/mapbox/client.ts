import type { RouteResult, GeocodedPlace, OptimisedRouteResult, OptimisedWaypoint } from './types';
import { trafficStatus } from './utils';

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

export async function getRoute(
    originLng: number,
    originLat: number,
    destLng: number,
    destLat: number
): Promise<RouteResult> {
    const url =
        `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/` +
        `${originLng},${originLat};${destLng},${destLat}` +
        `?geometries=geojson&overview=full&steps=true&access_token=${TOKEN}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Directions API error: ${res.status}`);
    const json = await res.json();
    const route = json.routes?.[0];
    if (!route) throw new Error('No route found');

    const duration = route.duration ?? 0;
    const durationTypical = route.duration_typical ?? route.duration ?? 0;

    return {
        geometry: route.geometry,
        duration,
        durationTypical,
        distance: route.distance ?? 0,
        steps: (route.legs?.[0]?.steps ?? []).map((s: any) => ({
            instruction: s.maneuver?.instruction ?? '',
            distance: s.distance ?? 0,
            duration: s.duration ?? 0,
        })),
        trafficStatus: trafficStatus(duration, durationTypical),
    };
}

export async function geocodeAddress(query: string): Promise<GeocodedPlace[]> {
    if (!query.trim()) return [];
    const url =
        `https://api.mapbox.com/geocoding/v5/mapbox.places/` +
        `${encodeURIComponent(query)}.json` +
        `?country=gb&types=postcode,address,place&limit=5&access_token=${TOKEN}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    return (json.features ?? []).map((f: any) => ({
        id: f.id,
        placeName: f.place_name,
        lat: f.center[1],
        lng: f.center[0],
    }));
}

/**
 * Optimise stop order for a multi-stop route via Mapbox Optimization API.
 * First coordinate is the origin (driver's home or HQ); rest are delivery sites.
 * Free tier: max 12 coordinates per request.
 */
export async function optimiseRoute(
    coordinates: Array<{ lng: number; lat: number }>
): Promise<OptimisedRouteResult> {
    if (coordinates.length < 2) {
        throw new Error('Need at least 2 coordinates (origin + 1 stop)');
    }
    if (coordinates.length > 12) {
        throw new Error('Max 12 coordinates per optimisation request (free tier)');
    }

    const coords = coordinates.map((c) => `${c.lng},${c.lat}`).join(';');
    const url =
        `https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coords}` +
        `?source=first&roundtrip=false&geometries=geojson&overview=full&steps=true` +
        `&access_token=${TOKEN}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Optimization API error: ${res.status}`);
    const json = await res.json();

    const trip = json.trips?.[0];
    if (!trip) throw new Error('No optimised trip found');

    const waypoints: OptimisedWaypoint[] = (json.waypoints ?? []).map((wp: any) => ({
        waypointIndex: wp.waypoint_index,
        lat: wp.location[1],
        lng: wp.location[0],
    }));

    const allSteps: Array<{ instruction: string; distance: number; duration: number }> = [];
    for (const leg of trip.legs ?? []) {
        for (const step of leg.steps ?? []) {
            allSteps.push({
                instruction: step.maneuver?.instruction ?? '',
                distance: step.distance ?? 0,
                duration: step.duration ?? 0,
            });
        }
    }

    return {
        geometry: trip.geometry,
        duration: trip.duration ?? 0,
        distance: trip.distance ?? 0,
        waypoints,
        steps: allSteps,
    };
}
