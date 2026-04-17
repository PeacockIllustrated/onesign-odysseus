# Multi-day delivery planning

*Design spec — 2026-04-17*

## Summary

A weekly planning surface at `/admin/planning` that replaces the spreadsheet/Clarity workflow for scheduling deliveries. Staff see a week view with day columns, drag deliveries between days and drivers, and optimise each driver's daily round via the Mapbox Optimization API. A lightweight `drivers` table stores driver profiles with home postcodes so each round starts from the driver's house.

## Scope

**In scope**

- Migration 049: `drivers` table (name, phone, home_postcode, home_lat, home_lng, vehicle_type, is_active)
- Migration 050: `deliveries.driver_id` FK to `drivers`
- Auto-geocode driver home postcode on save (reuse `geocodeSite` pattern with Mapbox)
- `/admin/planning` — week-view planner with day columns, driver grouping, drag-and-drop between days and drivers
- Mapbox Optimization API integration — per-driver-per-day route optimisation (up to 12 stops, free tier)
- Optimised route visualisation — multi-stop polyline drawn on an embedded map panel per driver-day
- Driver CRUD — small admin page or inline management on the planning page
- Sidebar entry: "Planning" under Production between Deliveries and Map
- Unassigned delivery pool per day with driver-assign dropdown
- Quick ad-hoc support — new deliveries appear in the day column automatically, staff drags onto a driver

**Out of scope**

- Load/weight constraints per vehicle
- Driver availability calendar
- Auto-assignment of deliveries to drivers (manual only)
- Time windows on stops ("deliver between 9am–12pm")
- Persisting optimised route geometry to DB (computed on demand)
- Return-to-depot at end of day (one-way trips — `roundtrip=false`)

## Data model

### Migration 049 — `drivers`

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT,
    home_postcode TEXT,
    home_lat DOUBLE PRECISION,
    home_lng DOUBLE PRECISION,
    vehicle_type TEXT NOT NULL DEFAULT 'van'
        CHECK (vehicle_type IN ('van', 'truck', 'car')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drivers_active
    ON public.drivers(is_active) WHERE is_active = TRUE;

CREATE TRIGGER trg_drivers_updated_at
    BEFORE UPDATE ON public.drivers
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage drivers"
    ON public.drivers FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY "Authed users read drivers"
    ON public.drivers FOR SELECT TO authenticated
    USING (auth.uid() IS NOT NULL);

COMMIT;
```

### Migration 050 — `deliveries.driver_id`

```sql
BEGIN;

ALTER TABLE public.deliveries
    ADD COLUMN IF NOT EXISTS driver_id UUID
        REFERENCES public.drivers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_deliveries_driver
    ON public.deliveries(driver_id) WHERE driver_id IS NOT NULL;

COMMIT;
```

### Derived grouping

A "round" = all deliveries where `scheduled_date = X AND driver_id = Y`. No round table. The planning page queries deliveries for a date range, groups client-side by `(scheduled_date, driver_id)`, and renders each group as a driver card within a day column.

## Mapbox Optimization API

### Request

```
GET https://api.mapbox.com/optimized-trips/v1/mapbox/driving/{coordinates}
    ?source=first
    &destination=last
    &roundtrip=false
    &geometries=geojson
    &overview=full
    &steps=true
    &access_token={token}
```

`{coordinates}` = semicolon-separated `lng,lat` pairs. First coordinate is the driver's home (or HQ fallback). Remaining coordinates are the delivery sites in any order — the API returns the optimal sequence.

### Response fields used

- `trips[0].geometry` — GeoJSON LineString for the full route polyline
- `trips[0].duration` — total seconds
- `trips[0].distance` — total metres
- `waypoints[].waypoint_index` — the optimised order (0 = origin, 1 = first stop, etc.)
- `trips[0].legs[].steps[]` — turn-by-turn per leg

### Constraints

- Free tier: 12 coordinates max per request (1 origin + 11 stops). Enough for any realistic daily round.
- If a driver has more than 11 deliveries in one day (unlikely), surface a warning: "too many stops — split across two drivers or days".

### Client wrapper

```ts
// lib/mapbox/client.ts — add:
export async function optimiseRoute(
    coordinates: Array<{ lng: number; lat: number }>
): Promise<OptimisedRouteResult>
```

Returns: optimised waypoint order, route geometry, total duration, total distance, per-leg steps.

## UX: Planning page

### Route: `/admin/planning`

### Layout

```
┌──────────────────────────────────────────────────────┐
│ ◂ prev week    w/c 21 Apr 2026    next week ▸        │
│                                                      │
│ [manage drivers]               [Mon–Fri ○ Mon–Sun]   │
├──────────────────────────────────────────────────────┤
│ Mon 21    │ Tue 22    │ Wed 23   │ Thu 24   │ Fri 25 │
│           │           │          │          │        │
│ 🚚 Dave   │ 🚚 Dave   │          │ 🚚 Keith │        │
│ 3 stops   │ 2 stops   │          │ 4 stops  │        │
│ 47mi 1h12 │ 23mi 38m  │          │ 61mi 1h4 │        │
│ [optimise]│ [optimise] │          │[optimise]│        │
│ ├ Site A  │ ├ Site D   │          │ ├ Site G │        │
│ ├ Site B  │ └ Site E   │          │ ├ Site H │        │
│ └ Site C  │            │          │ ├ Site I │        │
│           │            │          │ └ Site J │        │
│ ── pool ──│ ── pool ── │          │          │        │
│ Site F    │            │          │          │        │
│ [assign▾] │            │          │          │        │
└───────────────────────────────────────────────────────┘
```

### Day column

Each day column contains:
1. **Driver groups** — one card per driver who has deliveries that day. Shows:
   - Driver name + vehicle icon
   - Stop count + total distance + total duration (from last optimisation, or "not optimised" if never run)
   - **"Optimise route"** button — calls the Optimization API, reorders stops, updates the summary
   - **"Show on map"** button — draws the multi-stop route on an embedded map panel (slides out from the right or renders below the week grid)
   - Ordered list of delivery sites (draggable within the group for manual reorder)

2. **Unassigned pool** — deliveries on this day with no `driver_id`. Each has an **"assign"** dropdown listing active drivers. Selecting a driver moves the delivery into that driver's group.

### Interactions

- **Drag delivery between days** → updates `scheduled_date` via server action
- **Drag delivery between drivers within a day** → updates `driver_id` via server action
- **Drag delivery from pool to a driver group** → sets `driver_id`
- **Optimise route** → calls Optimization API, reorders stops visually (the optimised order is displayed but NOT persisted to the delivery rows — staff can drag to override)
- **Show on map** → renders multi-stop polyline in a map panel. Reuses `MapClient` with route rendering from Phase 1.

### Manage drivers

A **"manage drivers"** button in the header opens a slide-out panel or modal with:
- List of drivers (name, phone, home postcode, vehicle type, active/inactive toggle)
- **"+ add driver"** inline form
- Edit fields inline (same on-blur persist pattern as variant cards)
- Home postcode geocoded on save

### Week navigation

- **◂ prev week / next week ▸** — shifts the date range by 7 days
- **w/c [date]** — shows the Monday of the current week
- **Mon–Fri / Mon–Sun** toggle — includes/excludes weekends

### Optimisation result display

After "optimise route" is clicked:
- Stops reorder visually in the optimised sequence
- Summary updates: total distance + duration
- A small **"optimised ✓"** badge appears on the driver card
- If staff then drag a stop (manual override), the badge changes to **"modified"** and the summary clears (needs re-optimisation)

## Architecture

### New files

- `supabase/migrations/049_drivers.sql`
- `supabase/migrations/050_deliveries_driver_id.sql`
- `lib/drivers/types.ts` — Zod schemas + types
- `lib/drivers/actions.ts` — CRUD server actions (create, update, toggle active, list)
- `lib/mapbox/client.ts` — add `optimiseRoute()` function (extends existing file)
- `lib/mapbox/types.ts` — add `OptimisedRouteResult` type (extends existing file)
- `app/(portal)/admin/planning/page.tsx` — server component, loads deliveries + drivers for the week
- `app/(portal)/admin/planning/PlanningClient.tsx` — client component, week grid + drag-and-drop + optimisation
- `app/(portal)/admin/planning/DayColumn.tsx` — single day's deliveries grouped by driver
- `app/(portal)/admin/planning/DriverGroup.tsx` — one driver's stops within a day
- `app/(portal)/admin/planning/UnassignedPool.tsx` — unassigned deliveries for a day
- `app/(portal)/admin/planning/DriverManagerPanel.tsx` — driver CRUD slide-out
- `app/(portal)/admin/planning/PlanningMap.tsx` — embedded map panel for viewing optimised routes

### Modified files

- `lib/mapbox/client.ts` — add `optimiseRoute()` 
- `lib/mapbox/types.ts` — add `OptimisedRouteResult`
- `lib/deliveries/types.ts` — add `driver_id` to Delivery type
- `lib/deliveries/queries.ts` — include `driver_id` + driver name in delivery queries
- `app/(portal)/components/Sidebar.tsx` — add Planning nav item
- `lib/deliveries/actions.ts` — add `assignDriverToDelivery(deliveryId, driverId)` + `rescheduleDelivery(deliveryId, newDate)` quick-update actions

### Server actions for planning

```ts
// lib/deliveries/actions.ts — add:
assignDriverToDelivery(deliveryId, driverId | null) → { ok } | { error }
rescheduleDelivery(deliveryId, newDate: string) → { ok } | { error }

// lib/drivers/actions.ts — new:
getActiveDrivers() → Driver[]
createDriver(input) → { id } | { error }
updateDriver(id, patch) → { ok } | { error }
toggleDriverActive(id) → { ok } | { error }
```

### Drag-and-drop

Use `@dnd-kit/core` + `@dnd-kit/sortable` (already the standard in React for accessible, performant DnD — same family as what the Job Board kanban likely uses). If the project already uses a DnD library, follow that pattern. Otherwise install `@dnd-kit/core`.

On drop:
- If target is a different day → call `rescheduleDelivery(id, newDate)`
- If target is a different driver → call `assignDriverToDelivery(id, driverId)`
- Both fire-and-forget with `router.refresh()` on success

## Edge cases

- **Driver with no home postcode** — route starts from ONESIGN_HQ. No crash, just a different origin.
- **Day with zero deliveries** — column renders empty with a muted "no deliveries" label.
- **Day with deliveries but all unassigned** — pool shows them all; no driver groups render.
- **More than 11 stops for one driver** — "optimise route" button shows a warning: "12+ stops — split across drivers or days". API call not made.
- **Delivery site not geocoded** — stop appears in the list but is excluded from the optimisation (with a small ⚠ badge: "no coordinates"). Other stops still optimise.
- **Staff drags after optimisation** — "optimised ✓" badge changes to "modified". Summary clears. Staff must re-click optimise if they want fresh numbers.
- **Weekend deliveries** — Mon–Sun toggle shows Sat/Sun columns. Deliveries on weekends are rare but not impossible.

## Testing

- **Pure helpers (Vitest):** `groupDeliveriesByDriverAndDay(deliveries, startDate, endDate)` — verify grouping logic, handle unassigned, handle weekends.
- **Manual smoke:** create 2 drivers (Dave in Durham, Keith in Newcastle). Schedule 6 deliveries across 3 days. Assign 3 to Dave, 2 to Keith, leave 1 unassigned. Click "optimise route" on Dave's Monday group — verify stops reorder + distance/time update. Drag the unassigned delivery onto Keith → verify it moves. Drag a Tuesday delivery to Wednesday → verify date changes.

## Cost

- Mapbox Optimization API: 50 free requests/day (1,500/month). One request per driver-per-day optimisation click. For a team with 2-3 drivers planning weekly: ~15 requests/week = well within limits.
- `@dnd-kit/core`: ~15 KB gzipped. Minimal bundle impact.
