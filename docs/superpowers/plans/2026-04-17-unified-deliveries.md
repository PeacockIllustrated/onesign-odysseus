# Unified Deliveries — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the Deliveries list, Planning grid, and Map into a single split-layout page at `/admin/deliveries` with mobile bottom-tab toggle, then remove the standalone Map and Planning pages + sidebar entries.

**Architecture:** This is a composition restructure, not a feature build. The existing components (DeliveriesClient, PlanningClient, MapClient, and all their children) are moved into the deliveries directory, then wrapped in a new `UnifiedDeliveries` client component that manages the split layout, panel toggle, and inter-panel callbacks. The server page loads data for all three panels in parallel. No new server actions, no new DB tables.

**Tech Stack:** Next.js 16, TypeScript, Tailwind 4, react-map-gl (existing), @dnd-kit (existing).

**Reference spec:** `docs/superpowers/specs/2026-04-17-unified-deliveries-design.md`

---

## File map

**New files**

- `app/(portal)/admin/deliveries/UnifiedDeliveries.tsx` — client wrapper owning the split layout + panel toggle
- `app/(portal)/admin/deliveries/BottomTabBar.tsx` — mobile tab bar

**Moved files** (content unchanged or minimally adjusted)

- `app/(portal)/admin/map/MapClient.tsx` → `app/(portal)/admin/deliveries/MapPanel.tsx`
- `app/(portal)/admin/map/MapPopup.tsx` → `app/(portal)/admin/deliveries/components/MapPopup.tsx`
- `app/(portal)/admin/map/RouteLayer.tsx` → `app/(portal)/admin/deliveries/components/RouteLayer.tsx`
- `app/(portal)/admin/map/RouteInfoBar.tsx` → `app/(portal)/admin/deliveries/components/RouteInfoBar.tsx`
- `app/(portal)/admin/map/GeocodeBackfillButton.tsx` → `app/(portal)/admin/deliveries/components/GeocodeBackfillButton.tsx`
- `app/(portal)/admin/planning/PlanningClient.tsx` → `app/(portal)/admin/deliveries/PlanningPanel.tsx`
- `app/(portal)/admin/planning/DayColumn.tsx` → `app/(portal)/admin/deliveries/components/DayColumn.tsx`
- `app/(portal)/admin/planning/DriverGroup.tsx` → `app/(portal)/admin/deliveries/components/DriverGroup.tsx`
- `app/(portal)/admin/planning/UnassignedPool.tsx` → `app/(portal)/admin/deliveries/components/UnassignedPool.tsx`
- `app/(portal)/admin/planning/DriverManagerPanel.tsx` → `app/(portal)/admin/deliveries/components/DriverManagerPanel.tsx`

**Renamed files**

- `app/(portal)/admin/deliveries/DeliveriesClient.tsx` → `app/(portal)/admin/deliveries/DeliveryList.tsx`

**Deleted files**

- `app/(portal)/admin/map/page.tsx`
- `app/(portal)/admin/map/MapLoader.tsx`
- `app/(portal)/admin/planning/page.tsx`

**Modified files**

- `app/(portal)/admin/deliveries/page.tsx` — expanded server component loading all data
- `app/(portal)/components/Sidebar.tsx` — remove Map + Planning entries

---

### Task 1: Move map components into deliveries

**Files:**
- Move 5 files from `app/(portal)/admin/map/` to `app/(portal)/admin/deliveries/`

- [ ] **Step 1: Move and rename MapClient → MapPanel**

```bash
mkdir -p "app/(portal)/admin/deliveries/components"
cp "app/(portal)/admin/map/MapClient.tsx" "app/(portal)/admin/deliveries/MapPanel.tsx"
cp "app/(portal)/admin/map/MapPopup.tsx" "app/(portal)/admin/deliveries/components/MapPopup.tsx"
cp "app/(portal)/admin/map/RouteLayer.tsx" "app/(portal)/admin/deliveries/components/RouteLayer.tsx"
cp "app/(portal)/admin/map/RouteInfoBar.tsx" "app/(portal)/admin/deliveries/components/RouteInfoBar.tsx"
cp "app/(portal)/admin/map/GeocodeBackfillButton.tsx" "app/(portal)/admin/deliveries/components/GeocodeBackfillButton.tsx"
```

- [ ] **Step 2: Update imports in MapPanel.tsx (was MapClient.tsx)**

Open `app/(portal)/admin/deliveries/MapPanel.tsx`. Fix:
- Remove `import type { SitePin } from './page';` — the `SitePin` type will now be imported from a shared location or defined inline. For simplicity, move the `SitePin` interface into the file itself (copy it from the old `map/page.tsx`).
- Update relative imports: `'./MapPopup'` → `'./components/MapPopup'`, etc.
- Rename the export from `MapClient` to `MapPanel`.
- Remove the fixed `style={{ height: 600 }}` — replace with `style={{ height: '100%' }}` so it fills its container.

- [ ] **Step 3: Update imports in moved component files**

In `components/MapPopup.tsx`: remove `import type { SitePin } from './page';` — import from `'../MapPanel'` instead (where we just defined SitePin).

In `components/RouteLayer.tsx`: no import changes needed (self-contained).

In `components/RouteInfoBar.tsx`: update import `from './RouteLayer'` → `from './RouteLayer'` (same dir, no change).

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Fix any remaining import path issues.

- [ ] **Step 5: Commit**

```bash
git add "app/(portal)/admin/deliveries/MapPanel.tsx" "app/(portal)/admin/deliveries/components/"
git commit -m "refactor(deliveries): move map components into deliveries directory"
```

---

### Task 2: Move planning components into deliveries

**Files:**
- Move 5 files from `app/(portal)/admin/planning/` to `app/(portal)/admin/deliveries/`

- [ ] **Step 1: Copy files**

```bash
cp "app/(portal)/admin/planning/PlanningClient.tsx" "app/(portal)/admin/deliveries/PlanningPanel.tsx"
cp "app/(portal)/admin/planning/DayColumn.tsx" "app/(portal)/admin/deliveries/components/DayColumn.tsx"
cp "app/(portal)/admin/planning/DriverGroup.tsx" "app/(portal)/admin/deliveries/components/DriverGroup.tsx"
cp "app/(portal)/admin/planning/UnassignedPool.tsx" "app/(portal)/admin/deliveries/components/UnassignedPool.tsx"
cp "app/(portal)/admin/planning/DriverManagerPanel.tsx" "app/(portal)/admin/deliveries/components/DriverManagerPanel.tsx"
```

- [ ] **Step 2: Update imports in PlanningPanel.tsx**

Rename export from `PlanningClient` to `PlanningPanel`. Update relative imports for child components: `'./DayColumn'` → `'./components/DayColumn'`, etc.

- [ ] **Step 3: Update imports in moved child components**

In `components/DayColumn.tsx`: `'./DriverGroup'` and `'./UnassignedPool'` stay the same (same dir).

- [ ] **Step 4: Typecheck + commit**

```bash
npx tsc --noEmit
git add "app/(portal)/admin/deliveries/PlanningPanel.tsx" "app/(portal)/admin/deliveries/components/DayColumn.tsx" "app/(portal)/admin/deliveries/components/DriverGroup.tsx" "app/(portal)/admin/deliveries/components/UnassignedPool.tsx" "app/(portal)/admin/deliveries/components/DriverManagerPanel.tsx"
git commit -m "refactor(deliveries): move planning components into deliveries directory"
```

---

### Task 3: Rename DeliveriesClient → DeliveryList

**Files:**
- Rename: `app/(portal)/admin/deliveries/DeliveriesClient.tsx` → `DeliveryList.tsx`

- [ ] **Step 1: Copy + rename export**

```bash
cp "app/(portal)/admin/deliveries/DeliveriesClient.tsx" "app/(portal)/admin/deliveries/DeliveryList.tsx"
```

In `DeliveryList.tsx`: rename `export function DeliveriesClient` → `export function DeliveryList`. Rename the props interface to `DeliveryListProps`.

- [ ] **Step 2: Commit**

```bash
npx tsc --noEmit
git add "app/(portal)/admin/deliveries/DeliveryList.tsx"
git commit -m "refactor(deliveries): rename DeliveriesClient to DeliveryList"
```

---

### Task 4: BottomTabBar component

**Files:**
- Create: `app/(portal)/admin/deliveries/BottomTabBar.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { List, Calendar, Map } from 'lucide-react';

export type TabId = 'list' | 'plan' | 'map';

interface Props {
    activeTab: TabId;
    onChangeTab: (tab: TabId) => void;
}

const TABS: Array<{ id: TabId; label: string; icon: typeof List }> = [
    { id: 'list', label: 'List', icon: List },
    { id: 'plan', label: 'Plan', icon: Calendar },
    { id: 'map', label: 'Map', icon: Map },
];

export function BottomTabBar({ activeTab, onChangeTab }: Props) {
    return (
        <nav className="fixed bottom-0 left-0 right-0 z-30 md:hidden bg-white border-t border-neutral-200 flex">
            {TABS.map(({ id, label, icon: Icon }) => {
                const active = activeTab === id;
                return (
                    <button
                        key={id}
                        type="button"
                        onClick={() => onChangeTab(id)}
                        className={`flex-1 flex flex-col items-center justify-center py-2.5 text-[11px] font-semibold transition-colors ${
                            active ? 'text-[#4e7e8c] bg-[#e8f0f3]' : 'text-neutral-500'
                        }`}
                    >
                        <Icon size={18} />
                        <span className="mt-0.5">{label}</span>
                    </button>
                );
            })}
        </nav>
    );
}
```

- [ ] **Step 2: Commit**

```bash
npx tsc --noEmit
git add "app/(portal)/admin/deliveries/BottomTabBar.tsx"
git commit -m "feat(deliveries): BottomTabBar — mobile tab toggle for List/Plan/Map"
```

---

### Task 5: UnifiedDeliveries wrapper

**Files:**
- Create: `app/(portal)/admin/deliveries/UnifiedDeliveries.tsx`

- [ ] **Step 1: Write the component**

This is the core composition layer. It renders:
- Desktop: side-by-side split with panel toggle
- Mobile: single panel with bottom tabs

```tsx
'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { Delivery } from '@/lib/deliveries/types';
import type { Driver } from '@/lib/drivers/types';
import type { PlanningDelivery } from '@/lib/planning/utils';
import { DeliveryList } from './DeliveryList';
import { PlanningPanel } from './PlanningPanel';
import { BottomTabBar, type TabId } from './BottomTabBar';
import type { SitePin } from './MapPanel';

const MapPanel = dynamic(() => import('./MapPanel').then((m) => m.MapPanel), {
    ssr: false,
    loading: () => (
        <div className="h-full bg-neutral-100 animate-pulse rounded-lg flex items-center justify-center text-neutral-400 text-sm">
            Loading map…
        </div>
    ),
});

type DesktopPanel = 'list' | 'plan';

interface Props {
    deliveries: Delivery[];
    planningDeliveries: PlanningDelivery[];
    activeDrivers: Driver[];
    allDrivers: Driver[];
    monday: string;
    includeWeekends: boolean;
    pins: SitePin[];
}

export function UnifiedDeliveries({
    deliveries,
    planningDeliveries,
    activeDrivers,
    allDrivers,
    monday,
    includeWeekends,
    pins,
}: Props) {
    const [desktopPanel, setDesktopPanel] = useState<DesktopPanel>('list');
    const [mobileTab, setMobileTab] = useState<TabId>('list');

    // Callback: delivery list row clicked → could fly map to pin
    // (future enhancement — for now just switches to map on mobile)
    const handleDeliverySelect = useCallback((delivery: Delivery) => {
        // On mobile, auto-switch to map tab when a delivery is tapped
        if (window.innerWidth < 768) {
            setMobileTab('map');
        }
    }, []);

    return (
        <div className="h-[calc(100vh-8rem)]">
            {/* ===== DESKTOP (md+) ===== */}
            <div className="hidden md:flex h-full gap-0">
                {/* Left panel */}
                <div className="w-[45%] border-r border-neutral-200 overflow-y-auto">
                    {/* Panel toggle */}
                    <div className="sticky top-0 z-10 bg-white border-b border-neutral-200 px-4 py-2 flex items-center gap-2">
                        <button
                            onClick={() => setDesktopPanel('list')}
                            className={`px-3 py-1.5 text-xs font-semibold rounded ${
                                desktopPanel === 'list' ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-600'
                            }`}
                        >
                            List
                        </button>
                        <button
                            onClick={() => setDesktopPanel('plan')}
                            className={`px-3 py-1.5 text-xs font-semibold rounded ${
                                desktopPanel === 'plan' ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-600'
                            }`}
                        >
                            Plan
                        </button>
                    </div>

                    <div className="p-4">
                        {desktopPanel === 'list' ? (
                            <DeliveryList initialDeliveries={deliveries} />
                        ) : (
                            <PlanningPanel
                                deliveries={planningDeliveries}
                                activeDrivers={activeDrivers}
                                allDrivers={allDrivers}
                                monday={monday}
                                includeWeekends={includeWeekends}
                            />
                        )}
                    </div>
                </div>

                {/* Right panel — map */}
                <div className="w-[55%] relative">
                    <MapPanel pins={pins} />
                </div>
            </div>

            {/* ===== MOBILE (<md) ===== */}
            <div className="md:hidden h-[calc(100vh-8rem-3rem)]">
                {mobileTab === 'list' && (
                    <div className="h-full overflow-y-auto p-4">
                        <DeliveryList initialDeliveries={deliveries} />
                    </div>
                )}
                {mobileTab === 'plan' && (
                    <div className="h-full overflow-y-auto overflow-x-auto p-4">
                        <PlanningPanel
                            deliveries={planningDeliveries}
                            activeDrivers={activeDrivers}
                            allDrivers={allDrivers}
                            monday={monday}
                            includeWeekends={includeWeekends}
                        />
                    </div>
                )}
                {mobileTab === 'map' && (
                    <div className="h-full">
                        <MapPanel pins={pins} />
                    </div>
                )}
                <BottomTabBar activeTab={mobileTab} onChangeTab={setMobileTab} />
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add "app/(portal)/admin/deliveries/UnifiedDeliveries.tsx"
git commit -m "feat(deliveries): UnifiedDeliveries — split layout wrapper with mobile tabs"
```

---

### Task 6: Rewrite the server page to load all data

**Files:**
- Modify: `app/(portal)/admin/deliveries/page.tsx`

- [ ] **Step 1: Rewrite the page**

The page now loads delivery list data, planning data, AND map pin data in parallel, then passes everything to `UnifiedDeliveries`.

```tsx
import { requireAdmin } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase-server';
import { getDeliveries } from '@/lib/deliveries/queries';
import { getActiveDrivers, getAllDrivers } from '@/lib/drivers/actions';
import { getMonday } from '@/lib/planning/utils';
import { formatSiteAddress, pinColour, type RecordCounts } from '@/lib/geo/utils';
import { PageHeader } from '@/app/(portal)/components/ui';
import { UnifiedDeliveries } from './UnifiedDeliveries';

export const dynamic = 'force-dynamic';

interface PageProps {
    searchParams: Promise<{ week?: string; weekends?: string }>;
}

export default async function DeliveriesPage({ searchParams }: PageProps) {
    await requireAdmin();

    const params = await searchParams;
    const today = new Date().toISOString().slice(0, 10);
    const monday = params.week ?? getMonday(today);
    const includeWeekends = params.weekends === '1';

    const endDay = new Date(monday + 'T00:00:00');
    endDay.setDate(endDay.getDate() + (includeWeekends ? 6 : 4));
    const endDate = endDay.toISOString().slice(0, 10);

    const supabase = await createServerClient();

    // Load all three datasets in parallel.
    const [
        deliveries,
        planningRaw,
        sitesRaw,
        activeDrivers,
        allDrivers,
        quoteCounts,
        artworkCounts,
        productionCounts,
        deliveryCounts,
        maintenanceCounts,
    ] = await Promise.all([
        // 1. Delivery list (all statuses)
        getDeliveries(),

        // 2. Planning deliveries (this week, active/in-transit)
        supabase
            .from('deliveries')
            .select(`
                id, delivery_number, scheduled_date, status,
                driver_id, driver_name, site_id,
                org_sites(id, name, latitude, longitude),
                orgs!inner(name)
            `)
            .gte('scheduled_date', monday)
            .lte('scheduled_date', endDate)
            .in('status', ['scheduled', 'in_transit'])
            .order('scheduled_date')
            .then((r) => r.data ?? []),

        // 3. Geocoded sites for map pins
        supabase
            .from('org_sites')
            .select('id, name, org_id, address_line_1, address_line_2, city, county, postcode, latitude, longitude, orgs!inner(name)')
            .not('latitude', 'is', null)
            .not('longitude', 'is', null)
            .then((r) => r.data ?? []),

        // 4. Drivers
        getActiveDrivers(),
        getAllDrivers(),

        // 5. Record counts for map pins
        supabase.from('quotes').select('site_id').not('site_id', 'is', null).in('status', ['draft', 'sent', 'accepted']).then((r) => r.data ?? []),
        supabase.from('artwork_jobs').select('site_id').not('site_id', 'is', null).in('status', ['draft', 'in_progress']).then((r) => r.data ?? []),
        supabase.from('production_jobs').select('site_id').not('site_id', 'is', null).in('status', ['active', 'paused']).then((r) => r.data ?? []),
        supabase.from('deliveries').select('site_id').not('site_id', 'is', null).in('status', ['scheduled', 'in_transit']).then((r) => r.data ?? []),
        supabase.from('maintenance_visits').select('site_id').not('site_id', 'is', null).in('status', ['scheduled', 'in_progress']).then((r) => r.data ?? []),
    ]);

    // Build planning deliveries
    const planningDeliveries = planningRaw.map((d: any) => ({
        id: d.id,
        delivery_number: d.delivery_number,
        scheduled_date: d.scheduled_date,
        status: d.status,
        driver_id: d.driver_id,
        driver_name: d.driver_name,
        site_name: d.org_sites?.name ?? null,
        site_lat: d.org_sites?.latitude ?? null,
        site_lng: d.org_sites?.longitude ?? null,
        org_name: d.orgs?.name ?? null,
    }));

    // Build map pins
    const countMap = (rows: any[]) => {
        const m = new Map<string, number>();
        for (const r of rows) m.set(r.site_id, (m.get(r.site_id) ?? 0) + 1);
        return m;
    };
    const qc = countMap(quoteCounts);
    const ac = countMap(artworkCounts);
    const pc = countMap(productionCounts);
    const dc = countMap(deliveryCounts);
    const mc = countMap(maintenanceCounts);

    const pins = sitesRaw
        .map((site: any) => {
            const counts: RecordCounts = {
                quotes: qc.get(site.id) ?? 0,
                artwork: ac.get(site.id) ?? 0,
                production: pc.get(site.id) ?? 0,
                deliveries: dc.get(site.id) ?? 0,
                maintenance: mc.get(site.id) ?? 0,
            };
            const total = counts.quotes + counts.artwork + counts.production + counts.deliveries + counts.maintenance;
            if (total === 0) return null;
            return {
                siteId: site.id,
                siteName: site.name,
                orgId: site.org_id,
                orgName: site.orgs?.name ?? '—',
                address: formatSiteAddress(site),
                lat: site.latitude as number,
                lng: site.longitude as number,
                ...counts,
                colour: pinColour(counts),
            };
        })
        .filter(Boolean);

    return (
        <div className="p-4 md:p-6 max-w-full mx-auto">
            <PageHeader
                title="Deliveries"
                description="manage deliveries, plan routes, view the map"
            />
            <UnifiedDeliveries
                deliveries={deliveries}
                planningDeliveries={planningDeliveries}
                activeDrivers={activeDrivers}
                allDrivers={allDrivers}
                monday={monday}
                includeWeekends={includeWeekends}
                pins={pins as any}
            />
        </div>
    );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add "app/(portal)/admin/deliveries/page.tsx"
git commit -m "feat(deliveries): unified server page loading list + planning + map data"
```

---

### Task 7: Remove old pages + sidebar entries

**Files:**
- Delete: `app/(portal)/admin/map/page.tsx`, `app/(portal)/admin/map/MapLoader.tsx`
- Delete: `app/(portal)/admin/planning/page.tsx`
- Modify: `app/(portal)/components/Sidebar.tsx`

- [ ] **Step 1: Delete old pages**

```bash
rm "app/(portal)/admin/map/page.tsx"
rm "app/(portal)/admin/map/MapLoader.tsx"
rm "app/(portal)/admin/planning/page.tsx"
```

Don't delete the other map/ and planning/ files yet — they're still imported by the old paths until the moved copies are verified working. They can be cleaned up in a follow-up once everything builds.

- [ ] **Step 2: Remove sidebar entries**

In `app/(portal)/components/Sidebar.tsx`, remove these two nav items from the Production group:

```ts
{ label: 'Planning', href: '/admin/planning', icon: Calendar },
{ label: 'Map', href: '/admin/map', icon: MapPin },
```

Remove `Calendar` and `MapPin` from the lucide-react import if they're no longer used elsewhere in the file.

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add -A
git commit -m "refactor(deliveries): remove standalone map + planning pages and sidebar entries"
```

---

### Task 8: Clean up old directories

**Files:**
- Delete remaining files in `app/(portal)/admin/map/` and `app/(portal)/admin/planning/`

- [ ] **Step 1: Remove old map directory files** (only if the moved copies pass typecheck)

```bash
rm -rf "app/(portal)/admin/map"
rm -rf "app/(portal)/admin/planning"
```

- [ ] **Step 2: Typecheck + test**

```bash
npx tsc --noEmit
npm run test -- --run
```

All existing tests should pass — no test files were in the deleted directories.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove old map + planning directories (absorbed into deliveries)"
```

---

### Task 9: Manual smoke

No code changes.

- [ ] **Step 1: Desktop smoke**

Open `/admin/deliveries`:
- Verify split layout: left panel (~45%) + right map (~55%)
- Toggle List ↔ Plan in the left panel header
- List: status tabs, search, delivery rows work
- Plan: week grid, driver groups, assign, optimise work
- Map: pins render, click popup, "show route from HQ", "view site in 3D", filter toggles

- [ ] **Step 2: Mobile smoke (dev tools ~375px)**

- Bottom tab bar visible (📋 List | 📅 Plan | 🗺️ Map)
- Each tab fills the screen
- Map is interactive (pan, zoom, pinch)
- Switch between tabs smoothly

- [ ] **Step 3: Dead route check**

Navigate to `/admin/map` → should 404 (page deleted).
Navigate to `/admin/planning` → should 404.
Sidebar should NOT have Map or Planning entries.

- [ ] **Step 4: Push**

```bash
git push origin master:main master
```

---

## Self-review

- **Spec coverage:** split layout (Task 5), mobile tabs (Task 4), panel toggle (Task 5), map integration (Tasks 1, 5, 6), planning integration (Tasks 2, 5, 6), list rename (Task 3), page removal (Task 7), cleanup (Task 8), sidebar (Task 7), responsive (Tasks 4, 5), smoke (Task 9). ✓
- **Placeholders:** none. ✓
- **Type consistency:** `SitePin` exported from `MapPanel.tsx`, consumed in `UnifiedDeliveries`. `PlanningDelivery` from `lib/planning/utils`, consumed in `UnifiedDeliveries` + `PlanningPanel`. `TabId` from `BottomTabBar`, consumed in `UnifiedDeliveries`. All consistent. ✓
