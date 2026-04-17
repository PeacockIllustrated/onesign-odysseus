# Route Planning + Traffic ETAs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add traffic-aware route visualisation (polyline + drive time + directions) to the delivery detail page and the site map, and consolidate geocoding onto Mapbox.

**Architecture:** A thin Mapbox client wrapper (`lib/mapbox/client.ts`) makes Directions + Geocoding API calls client-side using the public token. Pure helpers derive traffic status and format distance/duration. Two new UI components — `RouteCard` on the delivery detail page and `RouteLayer` + `RouteInfoBar` on the map page — consume the route data. Geocoding in `lib/geo/actions.ts` is swapped from postcodes.io to Mapbox server-side.

**Tech Stack:** Next.js 16, TypeScript, react-map-gl/Mapbox GL JS, Mapbox Directions API, Mapbox Geocoding API, Vitest, Tailwind 4.

**Reference spec:** `docs/superpowers/specs/2026-04-17-route-planning-design.md`

---

## File map

**New files**

- `lib/mapbox/types.ts` — TypeScript types for route + geocoding results
- `lib/mapbox/client.ts` — `getRoute()`, `geocodeAddress()` fetch wrappers
- `lib/mapbox/utils.ts` — `trafficStatus()`, `formatDuration()`, `formatDistance()`, `ONESIGN_HQ`
- `lib/mapbox/utils.test.ts` — Vitest tests
- `app/(portal)/admin/deliveries/[id]/components/RouteCard.tsx` — sidebar route panel
- `app/(portal)/admin/map/RouteLayer.tsx` — polyline source + layer for the map
- `app/(portal)/admin/map/RouteInfoBar.tsx` — stacked route summaries

**Modified files**

- `lib/geo/actions.ts` — swap postcodes.io for Mapbox Geocoding API
- `lib/deliveries/queries.ts` — include `latitude, longitude` in site select
- `lib/deliveries/types.ts` — add `latitude, longitude` to `delivery_site` type
- `app/(portal)/admin/deliveries/[id]/DeliveryDetail.tsx` — render RouteCard
- `app/(portal)/admin/map/MapClient.tsx` — route state + RouteLayer + RouteInfoBar
- `app/(portal)/admin/map/MapPopup.tsx` — "show route" link + `onShowRoute` callback

---

### Task 1: Mapbox types

**Files:**
- Create: `lib/mapbox/types.ts`

- [ ] **Step 1: Write the types file**

```ts
/**
 * TypeScript types for Mapbox Directions + Geocoding API responses.
 * Only the fields we actually use are typed — the full API responses
 * are much larger.
 */

export interface RouteOrigin {
    lat: number;
    lng: number;
    label: string;
}

export type TrafficStatus = 'normal' | 'moderate' | 'heavy';

export interface RouteStep {
    instruction: string;
    distance: number; // metres
    duration: number; // seconds
}

export interface RouteResult {
    geometry: GeoJSON.LineString;
    duration: number;          // seconds, with traffic
    durationTypical: number;   // seconds, without traffic
    distance: number;          // metres
    steps: RouteStep[];
    trafficStatus: TrafficStatus;
}

export interface GeocodedPlace {
    id: string;
    placeName: string;
    lat: number;
    lng: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/mapbox/types.ts
git commit -m "feat(mapbox): route + geocoding TypeScript types"
```

---

### Task 2: Pure helpers + tests (TDD)

**Files:**
- Create: `lib/mapbox/utils.ts`
- Test: `lib/mapbox/utils.test.ts`

- [ ] **Step 1: Write the tests**

```ts
import { describe, it, expect } from 'vitest';
import { trafficStatus, formatDuration, formatDistance, ONESIGN_HQ } from './utils';

describe('trafficStatus', () => {
    it('returns normal when ratio < 1.15', () => {
        expect(trafficStatus(100, 100)).toBe('normal');
        expect(trafficStatus(114, 100)).toBe('normal');
    });
    it('returns moderate when ratio 1.15–1.4', () => {
        expect(trafficStatus(115, 100)).toBe('moderate');
        expect(trafficStatus(139, 100)).toBe('moderate');
    });
    it('returns heavy when ratio >= 1.4', () => {
        expect(trafficStatus(140, 100)).toBe('heavy');
        expect(trafficStatus(200, 100)).toBe('heavy');
    });
    it('returns normal when typical is zero', () => {
        expect(trafficStatus(100, 0)).toBe('normal');
    });
});

describe('formatDuration', () => {
    it('formats seconds as minutes only', () => {
        expect(formatDuration(300)).toBe('5 min');
        expect(formatDuration(60)).toBe('1 min');
    });
    it('formats as hours + minutes when >= 60 min', () => {
        expect(formatDuration(3660)).toBe('1 hr 1 min');
        expect(formatDuration(7200)).toBe('2 hr');
    });
    it('handles zero', () => {
        expect(formatDuration(0)).toBe('0 min');
    });
});

describe('formatDistance', () => {
    it('converts metres to miles with one decimal', () => {
        expect(formatDistance(1609.34)).toBe('1.0 mi');
        expect(formatDistance(16093.4)).toBe('10.0 mi');
    });
    it('handles zero', () => {
        expect(formatDistance(0)).toBe('0.0 mi');
    });
});

describe('ONESIGN_HQ', () => {
    it('is in Gateshead', () => {
        expect(ONESIGN_HQ.lat).toBeCloseTo(54.945, 2);
        expect(ONESIGN_HQ.lng).toBeCloseTo(-1.592, 2);
    });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
npm run test -- --run lib/mapbox/utils.test.ts
```

- [ ] **Step 3: Write implementation**

```ts
import type { TrafficStatus, RouteOrigin } from './types';

export const ONESIGN_HQ: RouteOrigin = {
    lat: 54.9453,
    lng: -1.5920,
    label: 'Onesign HQ, Team Valley',
};

/**
 * Derive traffic status by comparing live duration to typical.
 * < 15% slower = normal, 15–40% = moderate, > 40% = heavy.
 */
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

/** Format seconds into "X hr Y min" or "X min". */
export function formatDuration(seconds: number): string {
    const totalMin = Math.round(seconds / 60);
    if (totalMin < 60) return `${totalMin} min`;
    const hrs = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    return mins > 0 ? `${hrs} hr ${mins} min` : `${hrs} hr`;
}

/** Format metres into miles with one decimal place. */
export function formatDistance(metres: number): string {
    const miles = metres / 1609.344;
    return `${miles.toFixed(1)} mi`;
}

export const TRAFFIC_COLOURS: Record<TrafficStatus, string> = {
    normal: '#16a34a',
    moderate: '#d97706',
    heavy: '#dc2626',
};
```

- [ ] **Step 4: Run tests — expect 11 pass**

```bash
npm run test -- --run lib/mapbox/utils.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/mapbox/utils.ts lib/mapbox/utils.test.ts
git commit -m "feat(mapbox): trafficStatus + formatDuration + formatDistance helpers with tests"
```

---

### Task 3: Mapbox client wrapper

**Files:**
- Create: `lib/mapbox/client.ts`

- [ ] **Step 1: Write the client**

```ts
import type { RouteResult, GeocodedPlace } from './types';
import { trafficStatus } from './utils';

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

/**
 * Fetch a driving route with live traffic from the Mapbox Directions API.
 * Client-safe — uses the public token. No server round-trip needed.
 */
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
    if (!res.ok) {
        throw new Error(`Directions API error: ${res.status}`);
    }
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

/**
 * Geocode a free-text query (postcode, address, place name) via
 * Mapbox Geocoding API. Returns up to 5 results, UK-biased.
 */
export async function geocodeAddress(
    query: string
): Promise<GeocodedPlace[]> {
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
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/mapbox/client.ts
git commit -m "feat(mapbox): getRoute + geocodeAddress client wrapper"
```

---

### Task 4: Swap geocoding to Mapbox

**Files:**
- Modify: `lib/geo/actions.ts`

- [ ] **Step 1: Replace postcodes.io calls with Mapbox Geocoding**

In `geocodeSite`, find the fetch block that calls `api.postcodes.io/postcodes/...` and replace it:

```ts
    try {
        const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
        if (!token) {
            console.warn('geocodeSite: NEXT_PUBLIC_MAPBOX_TOKEN not set');
            return;
        }
        const encoded = encodeURIComponent(site.postcode.trim());
        const res = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json` +
            `?country=gb&types=postcode&limit=1&access_token=${token}`
        );
        if (!res.ok) {
            console.warn(`geocodeSite: Mapbox returned ${res.status} for "${site.postcode}"`);
            return;
        }
        const json = await res.json();
        const feature = json.features?.[0];
        if (!feature?.center) return;
        const [lng, lat] = feature.center;

        await supabase
            .from('org_sites')
            .update({ latitude: lat, longitude: lng })
            .eq('id', siteId);
    } catch (err) {
        console.warn('geocodeSite fetch error:', err);
    }
```

Do the same replacement in `geocodeAllSites` — same pattern but inside the loop. Replace the `api.postcodes.io` call with the Mapbox equivalent:

```ts
        try {
            const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
            if (!token) { skipped++; continue; }
            const encoded = encodeURIComponent(site.postcode.trim());
            const res = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json` +
                `?country=gb&types=postcode&limit=1&access_token=${token}`
            );
            if (!res.ok) { skipped++; continue; }
            const json = await res.json();
            const feature = json.features?.[0];
            if (!feature?.center) { skipped++; continue; }
            const [lng, lat] = feature.center;

            await supabase
                .from('org_sites')
                .update({ latitude: lat, longitude: lng })
                .eq('id', site.id);
            geocoded++;
        } catch {
            skipped++;
        }
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/geo/actions.ts
git commit -m "feat(geo): swap postcodes.io for Mapbox Geocoding API"
```

---

### Task 5: Extend delivery query to include site lat/lng

**Files:**
- Modify: `lib/deliveries/queries.ts`
- Modify: `lib/deliveries/types.ts`

- [ ] **Step 1: Add lat/lng to the site select in `getDeliveryWithItems`**

Find the `.select(...)` on `org_sites` (around line 66):

```ts
'id, name, address_line_1, address_line_2, city, county, postcode, country, phone'
```

Change to:

```ts
'id, name, address_line_1, address_line_2, city, county, postcode, country, phone, latitude, longitude'
```

- [ ] **Step 2: Add lat/lng to the `DeliveryWithItems` type**

In `lib/deliveries/types.ts`, find the `delivery_site` interface (around line 44-49). Add:

```ts
        latitude: number | null; longitude: number | null;
```

After the `phone: string | null;` line.

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/deliveries/queries.ts lib/deliveries/types.ts
git commit -m "feat(deliveries): include site lat/lng in delivery query"
```

---

### Task 6: RouteCard component

**Files:**
- Create: `app/(portal)/admin/deliveries/[id]/components/RouteCard.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Map, { Marker, Source, Layer, NavigationControl } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Navigation, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { getRoute, geocodeAddress } from '@/lib/mapbox/client';
import { ONESIGN_HQ, formatDuration, formatDistance, TRAFFIC_COLOURS } from '@/lib/mapbox/utils';
import type { RouteResult, GeocodedPlace } from '@/lib/mapbox/types';

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

interface Props {
    destLat: number;
    destLng: number;
    siteName: string;
}

export function RouteCard({ destLat, destLng, siteName }: Props) {
    const [origin, setOrigin] = useState(ONESIGN_HQ);
    const [route, setRoute] = useState<RouteResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showSteps, setShowSteps] = useState(false);

    // Custom origin search
    const [originQuery, setOriginQuery] = useState(ONESIGN_HQ.label);
    const [suggestions, setSuggestions] = useState<GeocodedPlace[]>([]);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>();

    const fetchRoute = useCallback(async (o: typeof origin) => {
        setLoading(true);
        setError(null);
        try {
            const result = await getRoute(o.lng, o.lat, destLng, destLat);
            setRoute(result);
        } catch (err) {
            setError('Couldn\'t load route — try again');
            console.warn('RouteCard fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [destLat, destLng]);

    useEffect(() => {
        fetchRoute(origin);
    }, [origin, fetchRoute]);

    const handleOriginInput = (q: string) => {
        setOriginQuery(q);
        clearTimeout(debounceRef.current);
        if (q.length < 2) { setSuggestions([]); return; }
        debounceRef.current = setTimeout(async () => {
            const results = await geocodeAddress(q);
            setSuggestions(results);
        }, 300);
    };

    const selectSuggestion = (place: GeocodedPlace) => {
        setOrigin({ lat: place.lat, lng: place.lng, label: place.placeName });
        setOriginQuery(place.placeName);
        setSuggestions([]);
    };

    if (!TOKEN) return null;

    const trafficColour = route ? TRAFFIC_COLOURS[route.trafficStatus] : '#999';

    // Compute bounds for the map to fit both origin + destination.
    const bounds = route ? {
        minLng: Math.min(origin.lng, destLng) - 0.02,
        maxLng: Math.max(origin.lng, destLng) + 0.02,
        minLat: Math.min(origin.lat, destLat) - 0.02,
        maxLat: Math.max(origin.lat, destLat) + 0.02,
    } : null;

    return (
        <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-100 flex items-center gap-2">
                <Navigation size={14} className="text-[#4e7e8c]" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-600">
                    Route to site
                </h4>
            </div>

            <div className="px-4 py-3">
                {/* Origin input */}
                <div className="relative mb-3">
                    <label className="block text-[11px] font-semibold text-neutral-500 mb-1">From</label>
                    <input
                        value={originQuery}
                        onChange={(e) => handleOriginInput(e.target.value)}
                        className="w-full text-sm border border-neutral-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4e7e8c]"
                        placeholder="Onesign HQ or type an address…"
                    />
                    {suggestions.length > 0 && (
                        <ul className="absolute z-10 left-0 right-0 mt-1 bg-white border border-neutral-200 rounded shadow-lg max-h-40 overflow-y-auto">
                            {suggestions.map((s) => (
                                <li key={s.id}>
                                    <button
                                        type="button"
                                        onClick={() => selectSuggestion(s)}
                                        className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-50 truncate"
                                    >
                                        {s.placeName}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* Map */}
                <div className="rounded border border-neutral-200 overflow-hidden" style={{ height: 280 }}>
                    <Map
                        mapboxAccessToken={TOKEN}
                        mapStyle="mapbox://styles/mapbox/light-v11"
                        initialViewState={bounds ? {
                            bounds: [[bounds.minLng, bounds.minLat], [bounds.maxLng, bounds.maxLat]] as any,
                            fitBoundsOptions: { padding: 40 },
                        } : {
                            latitude: 54.5,
                            longitude: -2.5,
                            zoom: 6,
                        }}
                        style={{ width: '100%', height: '100%' }}
                    >
                        <NavigationControl position="top-right" showCompass={false} />

                        {/* Origin marker */}
                        <Marker latitude={origin.lat} longitude={origin.lng} anchor="center">
                            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#4e7e8c', border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,.3)' }} />
                        </Marker>

                        {/* Destination marker */}
                        <Marker latitude={destLat} longitude={destLng} anchor="center">
                            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#dc2626', border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,.3)' }} />
                        </Marker>

                        {/* Route polyline */}
                        {route && (
                            <Source type="geojson" data={{ type: 'Feature', geometry: route.geometry, properties: {} }}>
                                <Layer
                                    type="line"
                                    paint={{
                                        'line-color': trafficColour,
                                        'line-width': 4,
                                        'line-opacity': 0.8,
                                    }}
                                />
                            </Source>
                        )}
                    </Map>
                </div>

                {/* Route info */}
                {loading && (
                    <div className="flex items-center gap-2 mt-3 text-sm text-neutral-500">
                        <Loader2 size={14} className="animate-spin" /> calculating route…
                    </div>
                )}
                {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
                {route && !loading && (
                    <div className="mt-3 space-y-2">
                        <div className="flex items-center gap-3 text-sm">
                            <span className="font-bold text-neutral-900">{formatDistance(route.distance)}</span>
                            <span className="text-neutral-500">·</span>
                            <span className="font-bold text-neutral-900">{formatDuration(route.duration)}</span>
                            <span
                                className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full text-white"
                                style={{ background: trafficColour }}
                            >
                                {route.trafficStatus}
                            </span>
                        </div>

                        {/* Turn-by-turn */}
                        <button
                            type="button"
                            onClick={() => setShowSteps(!showSteps)}
                            className="text-xs text-neutral-600 hover:text-black flex items-center gap-1"
                        >
                            {showSteps ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            {route.steps.length} step{route.steps.length !== 1 ? 's' : ''}
                        </button>
                        {showSteps && (
                            <ol className="text-xs text-neutral-600 space-y-1 pl-4 list-decimal">
                                {route.steps.map((step, i) => (
                                    <li key={i}>
                                        {step.instruction}
                                        <span className="text-neutral-400 ml-1">
                                            ({formatDistance(step.distance)})
                                        </span>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add "app/(portal)/admin/deliveries/[id]/components/RouteCard.tsx"
git commit -m "feat(deliveries): RouteCard — route map + traffic + directions in sidebar"
```

---

### Task 7: Wire RouteCard into delivery detail page

**Files:**
- Modify: `app/(portal)/admin/deliveries/[id]/DeliveryDetail.tsx`

- [ ] **Step 1: Read the file to find the sidebar/layout structure**

```bash
cat "app/(portal)/admin/deliveries/[id]/DeliveryDetail.tsx" | head -60
```

- [ ] **Step 2: Add the RouteCard**

Import at the top:

```tsx
import { RouteCard } from './components/RouteCard';
```

Find where the delivery site information is rendered (address card or similar). After it, add:

```tsx
{delivery.delivery_site?.latitude != null && delivery.delivery_site?.longitude != null && (
    <RouteCard
        destLat={delivery.delivery_site.latitude}
        destLng={delivery.delivery_site.longitude}
        siteName={delivery.delivery_site.name}
    />
)}
```

If there's no clear sidebar, render it after the delivery info section as a standalone card.

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add "app/(portal)/admin/deliveries/[id]/DeliveryDetail.tsx"
git commit -m "feat(deliveries): wire RouteCard into delivery detail page"
```

---

### Task 8: RouteLayer + RouteInfoBar for the map page

**Files:**
- Create: `app/(portal)/admin/map/RouteLayer.tsx`
- Create: `app/(portal)/admin/map/RouteInfoBar.tsx`

- [ ] **Step 1: Write `RouteLayer.tsx`**

```tsx
'use client';

import { Source, Layer } from 'react-map-gl/mapbox';
import { TRAFFIC_COLOURS } from '@/lib/mapbox/utils';
import type { TrafficStatus } from '@/lib/mapbox/types';

export interface ActiveRoute {
    id: string;
    siteName: string;
    geometry: GeoJSON.LineString;
    distance: number;
    duration: number;
    trafficStatus: TrafficStatus;
    colour: string;
}

const ROUTE_PALETTE = ['#4e7e8c', '#dc2626', '#16a34a', '#d97706', '#7c3aed'];

export function getRouteColour(index: number): string {
    return ROUTE_PALETTE[index % ROUTE_PALETTE.length];
}

interface Props {
    routes: ActiveRoute[];
}

export function RouteLayer({ routes }: Props) {
    return (
        <>
            {routes.map((route) => (
                <Source
                    key={route.id}
                    type="geojson"
                    data={{ type: 'Feature', geometry: route.geometry, properties: {} }}
                >
                    <Layer
                        type="line"
                        paint={{
                            'line-color': route.colour,
                            'line-width': 4,
                            'line-opacity': 0.8,
                        }}
                    />
                </Source>
            ))}
        </>
    );
}
```

- [ ] **Step 2: Write `RouteInfoBar.tsx`**

```tsx
'use client';

import { X } from 'lucide-react';
import { formatDuration, formatDistance, TRAFFIC_COLOURS } from '@/lib/mapbox/utils';
import type { ActiveRoute } from './RouteLayer';

interface Props {
    routes: ActiveRoute[];
    onRemove: (id: string) => void;
    onClearAll: () => void;
}

export function RouteInfoBar({ routes, onRemove, onClearAll }: Props) {
    if (routes.length === 0) return null;

    return (
        <div className="mb-3 space-y-1">
            {routes.map((r) => (
                <div
                    key={r.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded border text-sm"
                    style={{ borderColor: r.colour, borderLeftWidth: 4 }}
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-neutral-900 truncate">{r.siteName}</span>
                        <span className="text-neutral-400">·</span>
                        <span className="text-neutral-700">{formatDistance(r.distance)}</span>
                        <span className="text-neutral-400">·</span>
                        <span className="text-neutral-700">{formatDuration(r.duration)}</span>
                        <span
                            className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full text-white shrink-0"
                            style={{ background: TRAFFIC_COLOURS[r.trafficStatus] }}
                        >
                            {r.trafficStatus}
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={() => onRemove(r.id)}
                        className="text-neutral-400 hover:text-neutral-700 shrink-0"
                        aria-label={`Remove route to ${r.siteName}`}
                    >
                        <X size={14} />
                    </button>
                </div>
            ))}
            {routes.length > 1 && (
                <button
                    type="button"
                    onClick={onClearAll}
                    className="text-xs text-red-600 hover:underline"
                >
                    clear all routes
                </button>
            )}
        </div>
    );
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add "app/(portal)/admin/map/RouteLayer.tsx" "app/(portal)/admin/map/RouteInfoBar.tsx"
git commit -m "feat(map): RouteLayer + RouteInfoBar for multi-route overlays"
```

---

### Task 9: Wire routes into MapClient + MapPopup

**Files:**
- Modify: `app/(portal)/admin/map/MapClient.tsx`
- Modify: `app/(portal)/admin/map/MapPopup.tsx`
- Modify: `app/(portal)/admin/map/page.tsx` (pass `onShowRoute` through `SitePin`)

- [ ] **Step 1: Add "show route" to MapPopup**

Open `app/(portal)/admin/map/MapPopup.tsx`. Add a prop `onShowRoute`:

```tsx
interface Props {
    pin: SitePin;
    onShowRoute?: (pin: SitePin) => void;
}
```

In the delivery row (the one with emoji 🚚), add a "show route →" link after the count:

```tsx
{key === 'deliveries' && count > 0 && onShowRoute && (
    <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onShowRoute(pin); }}
        className="text-[10px] text-[#4e7e8c] hover:underline ml-1"
    >
        show route →
    </button>
)}
```

Actually, simpler: add the "show route" as an extra row at the bottom of the popup, after the record list:

```tsx
{onShowRoute && pin.deliveries > 0 && (
    <button
        type="button"
        onClick={() => onShowRoute(pin)}
        style={{
            display: 'block',
            width: '100%',
            marginTop: 6,
            padding: '6px 0',
            borderTop: '1px solid #eee',
            fontSize: 12,
            fontWeight: 600,
            color: '#4e7e8c',
            background: 'none',
            border: 'none',
            borderTopWidth: 1,
            borderTopStyle: 'solid',
            borderTopColor: '#eee',
            cursor: 'pointer',
            textAlign: 'center',
        }}
    >
        🗺️ show route from HQ →
    </button>
)}
```

- [ ] **Step 2: Add route state + components to MapClient**

Open `app/(portal)/admin/map/MapClient.tsx`. Add imports:

```tsx
import { getRoute } from '@/lib/mapbox/client';
import { ONESIGN_HQ } from '@/lib/mapbox/utils';
import { RouteLayer, getRouteColour, type ActiveRoute } from './RouteLayer';
import { RouteInfoBar } from './RouteInfoBar';
```

Add state:

```tsx
const [routes, setRoutes] = useState<ActiveRoute[]>([]);
```

Add handler:

```tsx
const handleShowRoute = useCallback(async (pin: SitePin) => {
    // Don't add duplicate
    if (routes.some((r) => r.id === pin.siteId)) return;
    try {
        const result = await getRoute(ONESIGN_HQ.lng, ONESIGN_HQ.lat, pin.lng, pin.lat);
        setRoutes((prev) => [
            ...prev,
            {
                id: pin.siteId,
                siteName: pin.siteName,
                geometry: result.geometry,
                distance: result.distance,
                duration: result.duration,
                trafficStatus: result.trafficStatus,
                colour: getRouteColour(prev.length),
            },
        ]);
        setSelectedPin(null); // close popup
    } catch (err) {
        console.warn('Failed to fetch route:', err);
    }
}, [routes]);
```

Pass `onShowRoute` to `MapPopup`:

```tsx
<MapPopup pin={selectedPin} onShowRoute={handleShowRoute} />
```

Render `RouteLayer` inside the `<Map>` component (after the markers):

```tsx
<RouteLayer routes={routes} />
```

Render `RouteInfoBar` above the map (between the filter bar and the map div):

```tsx
<RouteInfoBar
    routes={routes}
    onRemove={(id) => setRoutes((prev) => prev.filter((r) => r.id !== id))}
    onClearAll={() => setRoutes([])}
/>
```

Add a "Clear routes" button to the filter bar when routes are active:

```tsx
{routes.length > 0 && (
    <button
        type="button"
        onClick={() => setRoutes([])}
        className="px-3 py-1.5 text-xs font-semibold rounded-full border border-red-300 text-red-600 hover:bg-red-50"
    >
        clear routes
    </button>
)}
```

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add "app/(portal)/admin/map/MapClient.tsx" "app/(portal)/admin/map/MapPopup.tsx"
git commit -m "feat(map): show route from popup, multi-route state, info bar + clear"
```

---

### Task 10: Manual smoke

No code changes.

- [ ] **Step 1: Ensure Mapbox token is set**

Verify `NEXT_PUBLIC_MAPBOX_TOKEN` is in `.env.local` (for local dev) and in Vercel env vars (for production).

- [ ] **Step 2: Test delivery detail route**

Open `/admin/deliveries/[id]` for a delivery with a geocoded site. Verify:
- Route card appears in sidebar
- Map shows polyline from HQ to delivery site
- Distance + duration + traffic pill displayed
- "Change start" input works — type "Newcastle Central Station", select, route redraws
- Turn-by-turn directions expand/collapse

- [ ] **Step 3: Test map page routes**

Open `/admin/map`. Click a delivery pin → popup opens. Click "show route from HQ →":
- Polyline draws on the map
- Info bar appears above the map with distance/duration/traffic
- Click another pin and show its route → second polyline in a different colour
- Clear individual route (X button) + clear all routes

- [ ] **Step 4: Test geocoding backfill**

If sites still lack lat/lng, click "geocode all sites now" on the map page. Verify pins appear after refresh.

- [ ] **Step 5: Push**

```bash
git push origin master:main master
```

---

## Self-review

- **Spec coverage:** types (Task 1), pure helpers + TDD (Task 2), client wrapper (Task 3), geocoding swap (Task 4), delivery query lat/lng (Task 5), RouteCard (Task 6), delivery detail wiring (Task 7), RouteLayer + RouteInfoBar (Task 8), MapClient + MapPopup wiring (Task 9), smoke (Task 10). All spec sections covered. ✓
- **Placeholders:** none. Every code block is literal. ✓
- **Type consistency:** `RouteResult` defined in Task 1, consumed in Tasks 3 + 6. `ActiveRoute` defined in Task 8, consumed in Tasks 8 + 9. `GeocodedPlace` defined in Task 1, consumed in Tasks 3 + 6. `ONESIGN_HQ` defined in Task 2, consumed in Tasks 6 + 9. `trafficStatus` defined in Task 2, consumed in Task 3. `getRouteColour` defined in Task 8, consumed in Task 9. All consistent. ✓
