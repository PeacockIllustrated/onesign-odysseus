# Unified Deliveries — List + Planning + Map in one page

*Design spec — 2026-04-17*

## Summary

Merge the three separate pages (`/admin/deliveries`, `/admin/planning`, `/admin/map`) into a single unified surface at `/admin/deliveries`. Desktop shows a split layout — data panel on the left, full interactive map on the right. Mobile shows a bottom-tab toggle between List, Plan, and Map views. The standalone Map and Planning sidebar entries are removed.

## Scope

**In scope**

- Restructure `/admin/deliveries` as the unified hub
- Desktop (md+): 45/55 split — left panel (list OR planner) + right panel (map, always visible)
- Mobile (<md): bottom tab bar toggling between List / Plan / Map (one at a time, full screen)
- Left-panel toggle between "List" view (existing delivery list with status tabs) and "Week planner" view (existing planning grid)
- Map panel absorbs ALL functionality from the current `/admin/map`: pins, popups, routes, 3D buildings, filter toggles, route info bar
- Interactive linking: click a delivery row → map flies to its pin; optimise a round → polyline draws on map
- Remove `/admin/map` page + route
- Remove `/admin/planning` page + route
- Remove Map + Planning sidebar entries
- Deliveries sidebar entry stays

**Out of scope**

- New features beyond what already exists — this is a composition change, not a feature add
- Changing the planning or map internals
- Changing the delivery detail page (`/admin/deliveries/[id]`)

## Layout

### Desktop (md+)

```
┌─────────────────────────────────────────────────────────────┐
│ Deliveries                      [List ▪ Plan]  [drivers]    │
├──────────────────────────┬──────────────────────────────────┤
│                          │                                  │
│  LEFT PANEL (45%)        │  MAP PANEL (55%)                 │
│                          │                                  │
│  "List" mode:            │  Full Mapbox map                 │
│  ┌────────────────────┐  │  • delivery pins (colour-coded)  │
│  │ All|Sched|Transit  │  │  • route polylines               │
│  │ [search]           │  │  • 3D buildings                  │
│  │ delivery row       │◀─┼──▶ click row = fly to pin        │
│  │ delivery row       │  │  • filter toggles                │
│  │ delivery row       │  │  • "view in 3D"                  │
│  └────────────────────┘  │  • route info bar at bottom      │
│                          │                                  │
│  "Plan" mode:            │  Map reacts to planner:           │
│  ┌────────────────────┐  │  • optimise = draw polyline       │
│  │ ◂ w/c 21 Apr ▸    │  │  • click driver group = show      │
│  │ Mon | Tue | Wed... │  │    all that driver's pins         │
│  │ 🚚 Dave (3 stops)  │  │                                  │
│  │ 🚚 Keith (2 stops) │  │                                  │
│  │ — unassigned —     │  │                                  │
│  └────────────────────┘  │                                  │
│                          │                                  │
├──────────────────────────┴──────────────────────────────────┤
│ Route: Northside HQ — 12.3 mi · 22 min 🟢 normal     [✕]  │
└─────────────────────────────────────────────────────────────┘
```

### Mobile (<md)

Full-screen single panel with a bottom tab bar:

```
┌─────────────────────────┐
│                         │
│   FULL SCREEN CONTENT   │
│   (whichever tab is     │
│    active)              │
│                         │
│                         │
│                         │
├─────────────────────────┤
│  📋 List  📅 Plan  🗺️ Map │
└─────────────────────────┘
```

- **📋 List** — delivery rows with status tabs, full width. Tapping a row with a geocoded site switches to Map tab focused on that pin.
- **📅 Plan** — week planner grid, horizontally scrollable.
- **🗺️ Map** — full-screen map with all functionality.

Bottom tab bar: fixed to viewport bottom, 48px tall, three equal segments, active tab highlighted.

## Architecture

### Component structure

```
app/(portal)/admin/deliveries/
├── page.tsx                    server component — loads deliveries,
│                                drivers, sites; renders UnifiedDeliveries
├── UnifiedDeliveries.tsx       client component — owns the split layout,
│                                panel toggle state, map-interaction callbacks
├── DeliveryList.tsx            extracted from current DeliveriesClient.tsx
│                                (status tabs, search, delivery rows)
├── PlanningPanel.tsx           extracted from current PlanningClient.tsx
│                                (week grid, day columns, driver groups)
├── MapPanel.tsx                extracted from current MapClient.tsx
│                                (pins, routes, 3D, filters — sized to fill
│                                its container, not a fixed 600px)
├── BottomTabBar.tsx            mobile tab bar (List | Plan | Map)
├── [id]/                       unchanged — delivery detail page stays
│   ├── page.tsx
│   ├── DeliveryDetail.tsx
│   └── components/
│       └── RouteCard.tsx
└── components/                 shared sub-components
```

### What moves where

| Current file | New location | Change |
|---|---|---|
| `app/(portal)/admin/map/MapClient.tsx` | `app/(portal)/admin/deliveries/MapPanel.tsx` | Rename + remove fixed height (fill container) |
| `app/(portal)/admin/map/MapPopup.tsx` | `app/(portal)/admin/deliveries/components/MapPopup.tsx` | Move |
| `app/(portal)/admin/map/RouteLayer.tsx` | `app/(portal)/admin/deliveries/components/RouteLayer.tsx` | Move |
| `app/(portal)/admin/map/RouteInfoBar.tsx` | `app/(portal)/admin/deliveries/components/RouteInfoBar.tsx` | Move |
| `app/(portal)/admin/map/MapLoader.tsx` | Not needed — MapPanel is already 'use client' | Delete |
| `app/(portal)/admin/map/GeocodeBackfillButton.tsx` | `app/(portal)/admin/deliveries/components/GeocodeBackfillButton.tsx` | Move |
| `app/(portal)/admin/map/page.tsx` | Delete | Absorbed |
| `app/(portal)/admin/planning/PlanningClient.tsx` | `app/(portal)/admin/deliveries/PlanningPanel.tsx` | Rename + remove page-level concerns |
| `app/(portal)/admin/planning/DayColumn.tsx` | `app/(portal)/admin/deliveries/components/DayColumn.tsx` | Move |
| `app/(portal)/admin/planning/DriverGroup.tsx` | `app/(portal)/admin/deliveries/components/DriverGroup.tsx` | Move |
| `app/(portal)/admin/planning/UnassignedPool.tsx` | `app/(portal)/admin/deliveries/components/UnassignedPool.tsx` | Move |
| `app/(portal)/admin/planning/DriverManagerPanel.tsx` | `app/(portal)/admin/deliveries/components/DriverManagerPanel.tsx` | Move |
| `app/(portal)/admin/planning/page.tsx` | Delete | Absorbed |
| Existing `DeliveriesClient.tsx` | `DeliveryList.tsx` | Rename to avoid confusion with the new wrapper |

### Server page data loading

The unified `page.tsx` needs data for all three panels:

```ts
// Deliveries (all statuses for the list)
const deliveries = await getDeliveries(filters);

// Planning data (week range)
const planningDeliveries = await getPlanningDeliveries(monday, endDate);
const [activeDrivers, allDrivers] = await Promise.all([...]);

// Map data (geocoded sites + record counts)
const sitePins = await getSitePins(); // extracted from current map/page.tsx
```

These three queries are independent and can run in parallel.

### Map interaction callbacks

`UnifiedDeliveries` (the client wrapper) exposes callbacks that bridge the panels:

```ts
// List → Map: clicking a delivery row
onDeliverySelect(delivery) → map.flyTo(pin) + highlight

// Plan → Map: optimising a round
onRouteOptimised(geometry, stops) → map.drawPolyline()

// Map → List: clicking a pin popup "view delivery"
onPinSelect(deliveryId) → scroll list to that row + highlight
```

### Sidebar changes

```ts
// Remove these two entries:
// { label: 'Planning', href: '/admin/planning', icon: Calendar },
// { label: 'Map', href: '/admin/map', icon: MapPin },

// Keep:
{ label: 'Deliveries', href: '/admin/deliveries', icon: Truck },
```

Remove `Calendar` and `MapPin` from the lucide imports if unused elsewhere.

## Responsive breakpoints

- **md+ (≥768px):** side-by-side split. Left panel `w-[45%]`, right panel `w-[55%]`. Map fills its container height (calc(100vh - header)).
- **<md:** single panel + bottom tab bar. Active tab gets `h-[calc(100vh-header-tabbar)]`. Tab bar is `fixed bottom-0` with `z-30`.

## Edge cases

- **No geocoded sites:** map panel shows the "no geocoded sites" empty state with the backfill button. List/planner still work fine.
- **Delivery without a site:** row is clickable but doesn't fly to a pin (no coordinates). No crash.
- **Mobile landscape:** map panel fills the viewport; the bottom tabs stay visible.
- **Deep link to `/admin/deliveries?view=plan&week=2026-04-21`:** URL params control which panel mode is active + the planning week. Shareable.

## Testing

- **Manual smoke — desktop:** open `/admin/deliveries`, toggle between List and Plan modes, click a delivery row and verify map flies to pin, optimise a round and verify polyline draws, click "view in 3D" on a pin.
- **Manual smoke — mobile (dev tools ~375px):** verify bottom tab bar renders, switch between tabs, verify each fills the screen, verify the map is interactive (pinch zoom, tap pins).
- **Route check:** navigate to `/admin/map` → should 404 or redirect to `/admin/deliveries`. Same for `/admin/planning`.
