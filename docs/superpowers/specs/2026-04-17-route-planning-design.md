# Route planning + traffic ETAs (Mapbox Phase 1)

*Design spec — 2026-04-17*

## Summary

Add route visualisation to the delivery detail page and the site map. Every delivery gets a visual polyline from origin (Onesign HQ by default, overridable) to the delivery site, with real-time traffic-aware drive time, distance in miles, traffic status pill (normal / moderate / heavy), and collapsible turn-by-turn directions. On the map page, multiple routes can be drawn simultaneously for spatial planning. Geocoding is consolidated onto Mapbox's Geocoding API, replacing postcodes.io.

## Scope

**In scope**

- Mapbox Directions API integration (`driving-traffic` profile) for single-origin → single-destination routes
- Mapbox Geocoding API integration replacing postcodes.io in `geocodeSite` / `geocodeAllSites` and powering the "change start" address input
- Delivery detail page: new Route card in the right sidebar with embedded map, route info, traffic pill, turn-by-turn directions
- Map page: "show route" link in each delivery pin popup, polyline overlay, info bar, multi-route support, "clear routes" button
- Pure helper functions for traffic status derivation, distance/duration formatting (testable)
- Onesign HQ as the system default origin constant

**Out of scope**

- Multi-stop route optimisation (Phase 3)
- Saved routes / per-driver origin profiles
- Fuel cost estimation
- 3D building visualisation (Phase 4)
- Route caching (traffic data is time-sensitive)

## Origin model

```ts
const ONESIGN_HQ = {
    lat: 54.9453,
    lng: -1.5920,
    label: 'Onesign HQ, Team Valley',
};
```

Default origin for every route. Overridable per-route via a text input that geocodes on-the-fly via Mapbox. The override is ephemeral (client-side state only — not persisted to DB). When Phase 3 (multi-day delivery planning) arrives, the first leg's origin will be configurable per driver/day; subsequent legs chain from the previous stop's coordinates.

## Mapbox API calls

### Directions

```
GET https://api.mapbox.com/directions/v5/mapbox/driving-traffic/{origin_lng},{origin_lat};{dest_lng},{dest_lat}
  ?geometries=geojson
  &overview=full
  &steps=true
  &annotations=duration,distance
  &access_token={NEXT_PUBLIC_MAPBOX_TOKEN}
```

Response fields used:
- `routes[0].geometry` — GeoJSON LineString for the polyline
- `routes[0].duration` — seconds, traffic-aware
- `routes[0].duration_typical` — seconds, without live traffic (for comparison)
- `routes[0].distance` — metres
- `routes[0].legs[0].steps[]` — turn-by-turn instructions

### Geocoding

```
GET https://api.mapbox.com/geocoding/v5/mapbox.places/{query}.json
  ?country=gb
  &types=postcode,address,place
  &limit=5
  &access_token={NEXT_PUBLIC_MAPBOX_TOKEN}
```

Used in two places:
1. "Change start" input on the route card (client-side, debounced 300ms)
2. `geocodeSite` / `geocodeAllSites` server actions (replaces postcodes.io)

## Traffic status derivation

```ts
function trafficStatus(
    durationWithTraffic: number,
    durationTypical: number
): 'normal' | 'moderate' | 'heavy' {
    if (durationTypical <= 0) return 'normal';
    const ratio = durationWithTraffic / durationTypical;
    if (ratio < 1.15) return 'normal';
    if (ratio < 1.4) return 'moderate';
    return 'heavy';
}
```

Rendered as a colour-coded pill: green (normal), amber (moderate), red (heavy).

## UX: Delivery detail page

### Route card

New component in the right sidebar of `/admin/deliveries/[id]`, below the existing delivery info cards.

```
┌─────────────────────────────────────┐
│ ROUTE TO SITE                       │
│                                     │
│ From: [Onesign HQ, Team Valley  ▾] │  ← editable, geocode on type
│                                     │
│ ┌─────────────────────────────────┐ │
│ │                                 │ │
│ │        embedded Mapbox map      │ │  ← ~300px tall, shows polyline
│ │        with route polyline      │ │
│ │                                 │ │
│ └─────────────────────────────────┘ │
│                                     │
│ 34.2 mi · 48 min  🟡 moderate      │  ← distance, time, traffic pill
│                                     │
│ ▸ turn-by-turn directions (12 steps)│  ← collapsible
└─────────────────────────────────────┘
```

- Map shows origin marker (Onesign teal), destination marker (delivery colour), and the route polyline.
- "From" input defaults to "Onesign HQ, Team Valley". Typing triggers Mapbox Geocoding with a 300ms debounce; selecting a result re-fetches the route.
- Route data is fetched client-side (the Directions API call uses the public token, no server round-trip needed).
- Turn-by-turn is collapsed by default. Each step shows the instruction + distance.

### When no site is geocoded

If the delivery's site has no lat/lng, the route card shows: "Delivery site has no coordinates — add a postcode to the client's site to see the route."

## UX: Map page

### Show route from a pin

Each delivery pin's popup (`MapPopup`) gains a **"show route →"** link on the delivery row. Clicking it:

1. Calls the Directions API (HQ → pin's lat/lng)
2. Draws the polyline on the map as a `Source` + `Layer` (GeoJSON line)
3. Shows an info bar above the map: `Route to [site name] — 34 mi · 48 min 🟡 moderate [✕ clear]`
4. Fits the map bounds to include both origin and destination

### Multiple routes

Multiple routes can be active simultaneously. Each uses a distinct colour (cycle through a palette: `#4e7e8c`, `#dc2626`, `#16a34a`, `#d97706`, `#7c3aed`). The info bar stacks entries. A **"Clear all routes"** button appears in the filter bar when any routes are drawn.

### Route state

Routes are client-side state only — an array of `{ siteId, siteName, geometry, duration, distance, trafficStatus }`. Navigating away clears them. No persistence needed.

## Architecture

### New files

- `lib/mapbox/client.ts` — `getRoute(origin, dest): Promise<RouteResult>`, `geocodeAddress(query): Promise<GeocodedPlace[]>`. Client-safe (uses public token). Thin fetch wrappers with typed responses.
- `lib/mapbox/types.ts` — `RouteResult`, `GeocodedPlace`, `TrafficStatus`, `RouteOrigin`
- `lib/mapbox/utils.ts` — `trafficStatus()`, `formatDuration()`, `formatDistance()`, `ONESIGN_HQ` constant. Pure, testable.
- `lib/mapbox/utils.test.ts` — Vitest tests for the pure helpers
- `app/(portal)/admin/deliveries/[id]/components/RouteCard.tsx` — the sidebar route panel (client component, fetches route on mount)
- `app/(portal)/admin/map/RouteLayer.tsx` — draws polyline(s) on the Mapbox map via react-map-gl `Source` + `Layer`
- `app/(portal)/admin/map/RouteInfoBar.tsx` — stacked route summaries above the map

### Modified files

- `lib/geo/actions.ts` — replace postcodes.io calls with Mapbox Geocoding API in `geocodeSite` and `geocodeAllSites`
- `app/(portal)/admin/map/MapClient.tsx` — add route state, render `RouteLayer` + `RouteInfoBar`, handle "show route" callback from popups
- `app/(portal)/admin/map/MapPopup.tsx` — add "show route →" link on delivery rows, accept `onShowRoute` callback prop
- `app/(portal)/admin/deliveries/[id]/page.tsx` — render `RouteCard` in sidebar, pass delivery site coordinates

## Data flow

### Delivery detail route

```
page.tsx (server)
  → loads delivery + site lat/lng
  → passes to RouteCard (client)
      → on mount: fetch Directions API (HQ → site)
      → renders map + polyline + info + directions
      → "change start" input: geocode → re-fetch route
```

### Map page route

```
MapPopup (client)
  → user clicks "show route →"
  → calls onShowRoute(pin) callback up to MapClient
      → MapClient fetches Directions API (HQ → pin)
      → appends to routes[] state
      → RouteLayer renders polyline(s)
      → RouteInfoBar renders summary(ies)
```

No server actions involved — all Mapbox calls are client-side using the public token.

## Geocoding consolidation (postcodes.io → Mapbox)

`lib/geo/actions.ts` currently calls `api.postcodes.io`. Replace with Mapbox Geocoding:

```ts
const res = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(postcode)}.json` +
    `?country=gb&types=postcode&limit=1&access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}`
);
const json = await res.json();
const [lng, lat] = json.features?.[0]?.center ?? [null, null];
```

Same fire-and-forget pattern on site create/update. Same backfill action. Just a different API endpoint. Benefits: one fewer external dependency, handles full addresses (not just postcodes), international-ready if Onesign ever works outside the UK.

**Server-side note:** `NEXT_PUBLIC_MAPBOX_TOKEN` is accessible server-side too (Next.js exposes `NEXT_PUBLIC_*` to both client and server). No separate server token needed.

## Edge cases

- **Site without coordinates:** RouteCard shows "add a postcode to see the route". Map popup hides the "show route" link for non-geocoded pins.
- **Directions API failure (network, rate limit):** RouteCard shows "couldn't load route — try again". Map popup reverts the link. Console warning logged.
- **Invalid custom origin:** Geocoding returns no results → "couldn't find that address" inline error. Route stays on previous origin.
- **Very long route (e.g. Scotland to Cornwall):** Directions API handles any UK distance. No special treatment needed.
- **Multiple routes on map overlap:** each polyline has a distinct colour + 3px width. Overlapping sections show the most recently added route on top (z-order by array index).

## Testing

- **Pure helpers (Vitest):** `trafficStatus()` — test all three bands + edge case (zero typical duration). `formatDuration()` — hours/minutes formatting. `formatDistance()` — metres to miles conversion + rounding.
- **Manual smoke:** create a delivery for the Test-O's demo site (NE8 1AA), open the detail page, verify route draws from HQ to Gateshead with ~5 min drive time. On the map page, click "show route" on the pin, verify polyline + info bar. Change the origin to "Newcastle Central Station" and verify the route updates.

## Cost

All within Mapbox free tier:
- Directions API: 100,000 requests/month free
- Geocoding API: 100,000 requests/month free
- Map loads: 50,000/month free

A single-tenant app with ~10-20 deliveries/day and ~5 map page views/day uses <1% of these limits.
