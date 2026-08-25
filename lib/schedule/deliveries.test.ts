import { describe, it, expect } from 'vitest';
import {
    applyOptimisedOrder,
    deliveriesByDate,
    deliveryLabel,
    groupByDriver,
    routableStops,
    routeBlocker,
    simplifyLine,
    staticRouteMapUrl,
} from './deliveries';
import type { PlanningDelivery } from '@/lib/planning/utils';
import type { OptimisedWaypoint } from '@/lib/mapbox/types';

let n = 0;
function del(over: Partial<PlanningDelivery> = {}): PlanningDelivery {
    n += 1;
    return {
        id: `d${n}`,
        scheduled_date: '2026-08-17',
        driver_id: 'drv-1',
        driver_name: 'Gary',
        delivery_number: `DEL-${n}`,
        site_name: `Site ${n}`,
        site_lat: 54.9 + n / 100,
        site_lng: -1.6 - n / 100,
        org_name: `Org ${n}`,
        status: 'scheduled',
        ...over,
    };
}

describe('deliveriesByDate', () => {
    it('buckets deliveries by their scheduled date', () => {
        const map = deliveriesByDate([
            del({ scheduled_date: '2026-08-17' }),
            del({ scheduled_date: '2026-08-17' }),
            del({ scheduled_date: '2026-08-18' }),
        ]);
        expect(map.get('2026-08-17')).toHaveLength(2);
        expect(map.get('2026-08-18')).toHaveLength(1);
        expect(map.get('2026-08-19')).toBeUndefined();
    });
});

describe('groupByDriver', () => {
    it('splits a day into one round per driver, alphabetically', () => {
        const rounds = groupByDriver([
            del({ driver_id: 'b', driver_name: 'Zoe' }),
            del({ driver_id: 'a', driver_name: 'Adam' }),
            del({ driver_id: 'b', driver_name: 'Zoe' }),
        ]);
        expect(rounds.map((r) => r.driverName)).toEqual(['Adam', 'Zoe']);
        expect(rounds[1].stops).toHaveLength(2);
    });

    it('puts unassigned stops last under their own heading', () => {
        const rounds = groupByDriver([
            del({ driver_id: null, driver_name: null }),
            del({ driver_id: 'a', driver_name: 'Adam' }),
        ]);
        expect(rounds.map((r) => r.driverName)).toEqual(['Adam', 'Unassigned']);
        expect(rounds[1].driverId).toBeNull();
    });

    it('returns nothing for an empty day', () => {
        expect(groupByDriver([])).toEqual([]);
    });
});

describe('routableStops / routeBlocker', () => {
    it('excludes stops with no coordinates', () => {
        const stops = [del(), del({ site_lat: null, site_lng: null })];
        expect(routableStops(stops)).toHaveLength(1);
    });

    it('needs at least two routable stops', () => {
        expect(routeBlocker([del()])).toBe('too-few');
        expect(routeBlocker([del(), del({ site_lat: null, site_lng: null })])).toBe('too-few');
        expect(routeBlocker([del(), del()])).toBeNull();
    });

    it('rejects more stops than the optimiser accepts', () => {
        expect(routeBlocker(Array.from({ length: 12 }, () => del()))).toBe('too-many');
        expect(routeBlocker(Array.from({ length: 11 }, () => del()))).toBeNull();
    });
});

describe('applyOptimisedOrder', () => {
    it('reorders stops into the driven sequence', () => {
        const a = del(), b = del(), c = del();
        // Input is [origin, a, b, c]; the optimiser says drive c, a, b.
        const waypoints: OptimisedWaypoint[] = [
            { waypointIndex: 0, lat: 0, lng: 0 }, // origin
            { waypointIndex: 2, lat: 0, lng: 0 }, // a is driven 2nd
            { waypointIndex: 3, lat: 0, lng: 0 }, // b is driven 3rd
            { waypointIndex: 1, lat: 0, lng: 0 }, // c is driven 1st
        ];
        expect(applyOptimisedOrder([a, b, c], waypoints).map((s) => s.id)).toEqual([
            c.id, a.id, b.id,
        ]);
    });

    it('leaves the order alone when the waypoints do not match the stops', () => {
        const a = del(), b = del();
        expect(applyOptimisedOrder([a, b], [{ waypointIndex: 0, lat: 0, lng: 0 }])).toEqual([a, b]);
    });

    it('is stable for an already-optimal route', () => {
        const a = del(), b = del();
        const waypoints: OptimisedWaypoint[] = [
            { waypointIndex: 0, lat: 0, lng: 0 },
            { waypointIndex: 1, lat: 0, lng: 0 },
            { waypointIndex: 2, lat: 0, lng: 0 },
        ];
        expect(applyOptimisedOrder([a, b], waypoints).map((s) => s.id)).toEqual([a.id, b.id]);
    });
});

describe('deliveryLabel', () => {
    it('prefers the client, then the site, then the reference', () => {
        expect(deliveryLabel(del({ org_name: 'Robertson' }))).toBe('Robertson');
        expect(deliveryLabel(del({ org_name: null, site_name: 'RVI' }))).toBe('RVI');
        expect(
            deliveryLabel(del({ org_name: null, site_name: null, delivery_number: 'DEL-9' }))
        ).toBe('DEL-9');
    });
});

describe('simplifyLine', () => {
    const line = (count: number): GeoJSON.LineString => ({
        type: 'LineString',
        coordinates: Array.from({ length: count }, (_, i) => [i, i] as [number, number]),
    });

    it('leaves a short line alone', () => {
        const l = line(10);
        expect(simplifyLine(l, 100)).toBe(l);
    });

    it('thins a long line but keeps both ends', () => {
        const out = simplifyLine(line(1000), 50);
        expect(out.coordinates.length).toBeLessThanOrEqual(51);
        expect(out.coordinates[0]).toEqual([0, 0]);
        expect(out.coordinates[out.coordinates.length - 1]).toEqual([999, 999]);
    });
});

describe('staticRouteMapUrl', () => {
    const line: GeoJSON.LineString = {
        type: 'LineString',
        coordinates: [
            [-1.6, 54.9],
            [-1.7, 55.0],
        ],
    };

    it('builds a static map URL when a token is present', () => {
        const url = staticRouteMapUrl(line, 'pk.test');
        expect(url).toContain('api.mapbox.com/styles/v1/mapbox/light-v11/static/');
        expect(url).toContain('access_token=pk.test');
    });

    it('returns null with no token, so the caller can fall back', () => {
        expect(staticRouteMapUrl(line, '')).toBeNull();
    });

    it('returns null for an empty geometry', () => {
        expect(
            staticRouteMapUrl({ type: 'LineString', coordinates: [] }, 'pk.test')
        ).toBeNull();
    });

    it('returns null rather than an over-long URL', () => {
        const huge: GeoJSON.LineString = {
            type: 'LineString',
            coordinates: Array.from({ length: 5000 }, (_, i) => [-1.6 - i / 1e4, 54.9 + i / 1e4]),
        };
        expect(staticRouteMapUrl(huge, 'pk.test')).toBeNull();
    });
});
