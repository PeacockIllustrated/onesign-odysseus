/**
 * TypeScript types for Mapbox Directions + Geocoding API responses.
 * Only the fields we actually use are typed.
 */

export interface RouteOrigin {
    lat: number;
    lng: number;
    label: string;
}

export type TrafficStatus = 'normal' | 'moderate' | 'heavy';

export interface RouteStep {
    instruction: string;
    distance: number;
    duration: number;
}

export interface RouteResult {
    geometry: GeoJSON.LineString;
    duration: number;
    durationTypical: number;
    distance: number;
    steps: RouteStep[];
    trafficStatus: TrafficStatus;
}

export interface GeocodedPlace {
    id: string;
    placeName: string;
    lat: number;
    lng: number;
}

export interface OptimisedWaypoint {
    waypointIndex: number;
    lat: number;
    lng: number;
}

export interface OptimisedRouteResult {
    geometry: GeoJSON.LineString;
    duration: number;
    distance: number;
    waypoints: OptimisedWaypoint[];
    steps: RouteStep[];
}
