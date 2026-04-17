import type { RouteResult, GeocodedPlace } from './types';
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
