import type { TrafficStatus, RouteOrigin } from './types';

export const ONESIGN_HQ: RouteOrigin = {
    lat: 54.9453,
    lng: -1.5920,
    label: 'Onesign HQ, Team Valley',
};

export function trafficStatus(
    durationWithTraffic: number,
    durationTypical: number
): TrafficStatus {
    if (durationTypical <= 0) return 'normal';
    const ratio = durationWithTraffic / durationTypical;
    if (ratio < 1.15) return 'normal';
    if (ratio < 1.4) return 'moderate';
    return 'heavy';
}

export function formatDuration(seconds: number): string {
    const totalMin = Math.round(seconds / 60);
    if (totalMin < 60) return `${totalMin} min`;
    const hrs = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    return mins > 0 ? `${hrs} hr ${mins} min` : `${hrs} hr`;
}

export function formatDistance(metres: number): string {
    const miles = metres / 1609.344;
    return `${miles.toFixed(1)} mi`;
}

export const TRAFFIC_COLOURS: Record<TrafficStatus, string> = {
    normal: '#16a34a',
    moderate: '#d97706',
    heavy: '#dc2626',
};
