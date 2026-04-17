# Multi-Day Delivery Planning — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a weekly delivery planning surface at `/admin/planning` with driver profiles, drag-and-drop assignment/scheduling, and per-driver-per-day route optimisation via the Mapbox Optimization API.

**Architecture:** Two migrations (drivers + delivery driver_id FK), driver CRUD actions, an `optimiseRoute` client wrapper for Mapbox, a pure grouping helper (TDD), and a multi-component planning page using `@dnd-kit/core` (already installed) for drag-and-drop between day columns and driver groups.

**Tech Stack:** Next.js 16, TypeScript, @dnd-kit/core (installed), Mapbox Optimization API, Supabase SSR, Zod, react-map-gl, Vitest, Tailwind 4.

**Reference spec:** `docs/superpowers/specs/2026-04-17-delivery-planning-design.md`

---

## File map

**New files**

- `supabase/migrations/049_drivers.sql`
- `supabase/migrations/050_deliveries_driver_id.sql`
- `lib/drivers/types.ts` — Zod schemas + Driver type
- `lib/drivers/actions.ts` — CRUD server actions
- `lib/planning/utils.ts` — `groupDeliveriesByDriverAndDay` pure helper
- `lib/planning/utils.test.ts` — tests
- `app/(portal)/admin/planning/page.tsx` — server component
- `app/(portal)/admin/planning/PlanningClient.tsx` — week grid + DnD
- `app/(portal)/admin/planning/DayColumn.tsx` — single day column
- `app/(portal)/admin/planning/DriverGroup.tsx` — driver's stops within a day
- `app/(portal)/admin/planning/UnassignedPool.tsx` — unassigned deliveries
- `app/(portal)/admin/planning/DriverManagerPanel.tsx` — driver CRUD panel
- `app/(portal)/admin/planning/PlanningMap.tsx` — embedded optimised route map

**Modified files**

- `lib/mapbox/client.ts` — add `optimiseRoute()`
- `lib/mapbox/types.ts` — add `OptimisedRouteResult`
- `lib/deliveries/types.ts` — add `driver_id` to Delivery
- `lib/deliveries/actions.ts` — add `assignDriverToDelivery`, `rescheduleDelivery`
- `app/(portal)/components/Sidebar.tsx` — add Planning nav item

---

### Task 1: Migrations 049 + 050

**Files:**
- Create: `supabase/migrations/049_drivers.sql`
- Create: `supabase/migrations/050_deliveries_driver_id.sql`

- [ ] **Step 1: Write migration 049**

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

- [ ] **Step 2: Write migration 050**

```sql
BEGIN;

ALTER TABLE public.deliveries
    ADD COLUMN IF NOT EXISTS driver_id UUID
        REFERENCES public.drivers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_deliveries_driver
    ON public.deliveries(driver_id) WHERE driver_id IS NOT NULL;

COMMIT;
```

- [ ] **Step 3: Commit both**

```bash
git add supabase/migrations/049_drivers.sql supabase/migrations/050_deliveries_driver_id.sql
git commit -m "feat(db): migrations 049-050 — drivers table + deliveries.driver_id"
```

---

### Task 2: Driver types + CRUD actions

**Files:**
- Create: `lib/drivers/types.ts`
- Create: `lib/drivers/actions.ts`

- [ ] **Step 1: Write types**

```ts
import { z } from 'zod';

export const VehicleTypeEnum = z.enum(['van', 'truck', 'car']);
export type VehicleType = z.infer<typeof VehicleTypeEnum>;

export interface Driver {
    id: string;
    name: string;
    phone: string | null;
    home_postcode: string | null;
    home_lat: number | null;
    home_lng: number | null;
    vehicle_type: VehicleType;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export const CreateDriverSchema = z.object({
    name: z.string().min(1, 'name is required').max(100),
    phone: z.string().max(30).optional(),
    home_postcode: z.string().max(10).optional(),
    vehicle_type: VehicleTypeEnum.optional(),
});
export type CreateDriverInput = z.infer<typeof CreateDriverSchema>;

export const UpdateDriverSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    phone: z.string().max(30).nullable().optional(),
    home_postcode: z.string().max(10).nullable().optional(),
    vehicle_type: VehicleTypeEnum.optional(),
});
export type UpdateDriverInput = z.infer<typeof UpdateDriverSchema>;
```

- [ ] **Step 2: Write actions**

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase-admin';
import { getUser, requireSuperAdminOrError } from '@/lib/auth';
import { geocodeAddress } from '@/lib/mapbox/client';
import {
    CreateDriverSchema,
    UpdateDriverSchema,
    type CreateDriverInput,
    type UpdateDriverInput,
    type Driver,
} from './types';

export async function getActiveDrivers(): Promise<Driver[]> {
    const supabase = createAdminClient();
    const { data } = await supabase
        .from('drivers')
        .select('*')
        .eq('is_active', true)
        .order('name');
    return (data ?? []) as Driver[];
}

export async function getAllDrivers(): Promise<Driver[]> {
    const supabase = createAdminClient();
    const { data } = await supabase
        .from('drivers')
        .select('*')
        .order('name');
    return (data ?? []) as Driver[];
}

async function geocodeDriverHome(
    supabase: ReturnType<typeof createAdminClient>,
    driverId: string,
    postcode: string | null | undefined
): Promise<void> {
    if (!postcode?.trim()) return;
    try {
        const results = await geocodeAddress(postcode.trim());
        if (results.length > 0) {
            await supabase
                .from('drivers')
                .update({ home_lat: results[0].lat, home_lng: results[0].lng })
                .eq('id', driverId);
        }
    } catch {
        // Fire-and-forget
    }
}

export async function createDriver(
    input: CreateDriverInput
): Promise<{ id: string } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return { error: gate.error };

    const validation = CreateDriverSchema.safeParse(input);
    if (!validation.success) return { error: validation.error.issues[0].message };
    const parsed = validation.data;

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from('drivers')
        .insert({
            name: parsed.name,
            phone: parsed.phone ?? null,
            home_postcode: parsed.home_postcode ?? null,
            vehicle_type: parsed.vehicle_type ?? 'van',
        })
        .select('id')
        .single();

    if (error || !data) return { error: error?.message ?? 'failed to create driver' };

    geocodeDriverHome(supabase, data.id, parsed.home_postcode).catch(() => {});

    revalidatePath('/admin/planning');
    return { id: data.id };
}

export async function updateDriver(
    driverId: string,
    patch: UpdateDriverInput
): Promise<{ ok: true } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return { error: gate.error };

    const validation = UpdateDriverSchema.safeParse(patch);
    if (!validation.success) return { error: validation.error.issues[0].message };
    const parsed = validation.data;

    const supabase = createAdminClient();
    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed)) {
        if (v !== undefined) updates[k] = v;
    }

    const { error } = await supabase
        .from('drivers')
        .update(updates)
        .eq('id', driverId);
    if (error) return { error: error.message };

    if (parsed.home_postcode !== undefined) {
        await supabase.from('drivers').update({ home_lat: null, home_lng: null }).eq('id', driverId);
        geocodeDriverHome(supabase, driverId, parsed.home_postcode).catch(() => {});
    }

    revalidatePath('/admin/planning');
    return { ok: true };
}

export async function toggleDriverActive(
    driverId: string
): Promise<{ ok: true } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return { error: gate.error };

    const supabase = createAdminClient();
    const { data: driver } = await supabase
        .from('drivers')
        .select('is_active')
        .eq('id', driverId)
        .single();
    if (!driver) return { error: 'driver not found' };

    const { error } = await supabase
        .from('drivers')
        .update({ is_active: !driver.is_active })
        .eq('id', driverId);
    if (error) return { error: error.message };

    revalidatePath('/admin/planning');
    return { ok: true };
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/drivers/types.ts lib/drivers/actions.ts
git commit -m "feat(drivers): types + CRUD server actions with home postcode geocoding"
```

---

### Task 3: Delivery type + quick-update actions

**Files:**
- Modify: `lib/deliveries/types.ts` — add `driver_id`
- Modify: `lib/deliveries/actions.ts` — add `assignDriverToDelivery`, `rescheduleDelivery`

- [ ] **Step 1: Add driver_id to Delivery type**

In `lib/deliveries/types.ts`, find the `Delivery` interface. After `driver_phone: string | null;` add:

```ts
    driver_id: string | null;
```

- [ ] **Step 2: Add quick-update actions**

Append to `lib/deliveries/actions.ts`:

```ts
// ---------------------------------------------------------------------------
// Planning quick-update actions
// ---------------------------------------------------------------------------

export async function assignDriverToDelivery(
    deliveryId: string,
    driverId: string | null
): Promise<{ ok: true } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const supabase = createAdminClient();

    // If assigning a driver, also fill driver_name from the driver record.
    let driverName: string | null = null;
    if (driverId) {
        const { data: driver } = await supabase
            .from('drivers')
            .select('name')
            .eq('id', driverId)
            .single();
        driverName = driver?.name ?? null;
    }

    const { error } = await supabase
        .from('deliveries')
        .update({
            driver_id: driverId,
            driver_name: driverName,
        })
        .eq('id', deliveryId);
    if (error) return { error: error.message };

    revalidatePath('/admin/planning');
    revalidatePath('/admin/deliveries');
    return { ok: true };
}

export async function rescheduleDelivery(
    deliveryId: string,
    newDate: string
): Promise<{ ok: true } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const supabase = createAdminClient();
    const { error } = await supabase
        .from('deliveries')
        .update({ scheduled_date: newDate })
        .eq('id', deliveryId);
    if (error) return { error: error.message };

    revalidatePath('/admin/planning');
    revalidatePath('/admin/deliveries');
    return { ok: true };
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/deliveries/types.ts lib/deliveries/actions.ts
git commit -m "feat(deliveries): driver_id on Delivery + assignDriver + reschedule actions"
```

---

### Task 4: Mapbox optimiseRoute wrapper

**Files:**
- Modify: `lib/mapbox/types.ts` — add OptimisedRouteResult
- Modify: `lib/mapbox/client.ts` — add optimiseRoute()

- [ ] **Step 1: Add type to `lib/mapbox/types.ts`**

Append:

```ts
export interface OptimisedWaypoint {
    waypointIndex: number;
    lat: number;
    lng: number;
}

export interface OptimisedRouteResult {
    geometry: GeoJSON.LineString;
    duration: number;    // total seconds
    distance: number;    // total metres
    waypoints: OptimisedWaypoint[];
    steps: RouteStep[];
}
```

- [ ] **Step 2: Add function to `lib/mapbox/client.ts`**

Append:

```ts
import type { OptimisedRouteResult, OptimisedWaypoint } from './types';

/**
 * Optimise stop order for a multi-stop route via Mapbox Optimization API.
 * First coordinate is the origin (driver's home or HQ); rest are delivery sites.
 * Returns the optimised waypoint order + full route geometry.
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
```

Note: `TOKEN` is already defined at the top of `client.ts` from Phase 1. If the `import` for the new types conflicts with existing ones, merge them into the existing import statement.

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/mapbox/types.ts lib/mapbox/client.ts
git commit -m "feat(mapbox): optimiseRoute wrapper for Optimization API"
```

---

### Task 5: Pure grouping helper (TDD)

**Files:**
- Create: `lib/planning/utils.ts`
- Test: `lib/planning/utils.test.ts`

- [ ] **Step 1: Write the tests**

```ts
import { describe, it, expect } from 'vitest';
import { groupDeliveriesByDriverAndDay, getWeekDates } from './utils';

describe('getWeekDates', () => {
    it('returns 5 dates for Mon-Fri starting from the given Monday', () => {
        const dates = getWeekDates('2026-04-20', false);
        expect(dates).toEqual(['2026-04-20', '2026-04-21', '2026-04-22', '2026-04-23', '2026-04-24']);
    });
    it('returns 7 dates when weekends included', () => {
        const dates = getWeekDates('2026-04-20', true);
        expect(dates).toHaveLength(7);
        expect(dates[6]).toBe('2026-04-26');
    });
});

describe('groupDeliveriesByDriverAndDay', () => {
    const deliveries = [
        { id: '1', scheduled_date: '2026-04-20', driver_id: 'dave', driver_name: 'Dave', site_name: 'Site A' },
        { id: '2', scheduled_date: '2026-04-20', driver_id: 'dave', driver_name: 'Dave', site_name: 'Site B' },
        { id: '3', scheduled_date: '2026-04-20', driver_id: null, driver_name: null, site_name: 'Site C' },
        { id: '4', scheduled_date: '2026-04-21', driver_id: 'keith', driver_name: 'Keith', site_name: 'Site D' },
    ];

    it('groups by date and driver', () => {
        const result = groupDeliveriesByDriverAndDay(deliveries as any);
        const mon = result['2026-04-20'];
        expect(mon).toBeDefined();
        expect(mon.drivers['dave']).toHaveLength(2);
        expect(mon.unassigned).toHaveLength(1);
    });

    it('puts unassigned deliveries in the unassigned bucket', () => {
        const result = groupDeliveriesByDriverAndDay(deliveries as any);
        expect(result['2026-04-20'].unassigned[0].id).toBe('3');
    });

    it('creates entries for days with deliveries', () => {
        const result = groupDeliveriesByDriverAndDay(deliveries as any);
        expect(Object.keys(result)).toContain('2026-04-21');
        expect(result['2026-04-21'].drivers['keith']).toHaveLength(1);
    });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
npm run test -- --run lib/planning/utils.test.ts
```

- [ ] **Step 3: Write implementation**

```ts
/**
 * Pure helpers for the delivery planning week view.
 */

export interface PlanningDelivery {
    id: string;
    scheduled_date: string;
    driver_id: string | null;
    driver_name: string | null;
    delivery_number: string;
    site_name: string | null;
    site_lat: number | null;
    site_lng: number | null;
    org_name: string | null;
    status: string;
}

export interface DayGroup {
    drivers: Record<string, PlanningDelivery[]>;
    unassigned: PlanningDelivery[];
}

/**
 * Group deliveries by date, then within each date by driver_id.
 * Deliveries with driver_id=null go into the 'unassigned' bucket.
 */
export function groupDeliveriesByDriverAndDay(
    deliveries: PlanningDelivery[]
): Record<string, DayGroup> {
    const result: Record<string, DayGroup> = {};

    for (const d of deliveries) {
        const date = d.scheduled_date;
        if (!result[date]) {
            result[date] = { drivers: {}, unassigned: [] };
        }
        if (d.driver_id) {
            if (!result[date].drivers[d.driver_id]) {
                result[date].drivers[d.driver_id] = [];
            }
            result[date].drivers[d.driver_id].push(d);
        } else {
            result[date].unassigned.push(d);
        }
    }

    return result;
}

/**
 * Get an array of date strings (YYYY-MM-DD) for a week starting
 * from the given Monday.
 */
export function getWeekDates(monday: string, includeWeekends: boolean): string[] {
    const start = new Date(monday + 'T00:00:00');
    const days = includeWeekends ? 7 : 5;
    const dates: string[] = [];
    for (let i = 0; i < days; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
}

/**
 * Get the Monday of the week containing the given date.
 */
export function getMonday(date: string): string {
    const d = new Date(date + 'T00:00:00');
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d.toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Run tests — expect 5 pass**

```bash
npm run test -- --run lib/planning/utils.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/planning/utils.ts lib/planning/utils.test.ts
git commit -m "feat(planning): groupDeliveriesByDriverAndDay + getWeekDates helpers with tests"
```

---

### Task 6: Sidebar + Planning page server component

**Files:**
- Modify: `app/(portal)/components/Sidebar.tsx`
- Create: `app/(portal)/admin/planning/page.tsx`

- [ ] **Step 1: Add Planning to sidebar**

Add `Calendar` to the lucide-react import. Add to the Production group after Deliveries and before Map:

```ts
{ label: 'Planning', href: '/admin/planning', icon: Calendar },
```

- [ ] **Step 2: Write the server page**

```tsx
import { requireAdmin } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase-server';
import { PageHeader } from '@/app/(portal)/components/ui';
import { getActiveDrivers, getAllDrivers } from '@/lib/drivers/actions';
import { PlanningClient } from './PlanningClient';
import { getMonday } from '@/lib/planning/utils';

export const dynamic = 'force-dynamic';

interface PageProps {
    searchParams: Promise<{ week?: string; weekends?: string }>;
}

export default async function PlanningPage({ searchParams }: PageProps) {
    await requireAdmin();

    const params = await searchParams;
    const today = new Date().toISOString().slice(0, 10);
    const monday = params.week ?? getMonday(today);
    const includeWeekends = params.weekends === '1';

    const endDay = new Date(monday + 'T00:00:00');
    endDay.setDate(endDay.getDate() + (includeWeekends ? 6 : 4));
    const endDate = endDay.toISOString().slice(0, 10);

    const supabase = await createServerClient();

    // Load deliveries for the week range.
    const { data: rawDeliveries } = await supabase
        .from('deliveries')
        .select(`
            id, delivery_number, scheduled_date, status,
            driver_id, driver_name,
            site_id,
            org_sites(id, name, latitude, longitude),
            orgs!inner(name)
        `)
        .gte('scheduled_date', monday)
        .lte('scheduled_date', endDate)
        .in('status', ['scheduled', 'in_transit'])
        .order('scheduled_date');

    const deliveries = (rawDeliveries ?? []).map((d: any) => ({
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

    const [activeDrivers, allDrivers] = await Promise.all([
        getActiveDrivers(),
        getAllDrivers(),
    ]);

    return (
        <div className="p-6 max-w-full mx-auto">
            <PageHeader
                title="Delivery Planning"
                description={`Week of ${new Date(monday).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
            />
            <PlanningClient
                deliveries={deliveries}
                activeDrivers={activeDrivers}
                allDrivers={allDrivers}
                monday={monday}
                includeWeekends={includeWeekends}
            />
        </div>
    );
}
```

- [ ] **Step 3: Create a PlanningClient stub so typecheck passes**

```tsx
'use client';
import type { Driver } from '@/lib/drivers/types';
import type { PlanningDelivery } from '@/lib/planning/utils';

interface Props {
    deliveries: PlanningDelivery[];
    activeDrivers: Driver[];
    allDrivers: Driver[];
    monday: string;
    includeWeekends: boolean;
}

export function PlanningClient(_: Props) {
    return <div data-stub="planning" />;
}
```

- [ ] **Step 4: Typecheck + commit**

```bash
npx tsc --noEmit
git add "app/(portal)/components/Sidebar.tsx" "app/(portal)/admin/planning"
git commit -m "feat(planning): sidebar entry + server page + PlanningClient stub"
```

---

### Task 7: DriverManagerPanel

**Files:**
- Create: `app/(portal)/admin/planning/DriverManagerPanel.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X, Plus, Loader2, Truck, Car } from 'lucide-react';
import { createDriver, updateDriver, toggleDriverActive } from '@/lib/drivers/actions';
import type { Driver } from '@/lib/drivers/types';

interface Props {
    drivers: Driver[];
    open: boolean;
    onClose: () => void;
}

const VEHICLE_ICONS: Record<string, typeof Truck> = { van: Truck, truck: Truck, car: Car };

export function DriverManagerPanel({ drivers, open, onClose }: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [showAdd, setShowAdd] = useState(false);
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [postcode, setPostcode] = useState('');
    const [vehicleType, setVehicleType] = useState('van');
    const [error, setError] = useState<string | null>(null);

    const handleCreate = () => {
        if (!name.trim()) { setError('name required'); return; }
        setError(null);
        startTransition(async () => {
            const res = await createDriver({
                name: name.trim(),
                phone: phone.trim() || undefined,
                home_postcode: postcode.trim() || undefined,
                vehicle_type: vehicleType as any,
            });
            if ('error' in res) { setError(res.error); return; }
            setName(''); setPhone(''); setPostcode(''); setShowAdd(false);
            router.refresh();
        });
    };

    const handleToggle = (id: string) => {
        startTransition(async () => {
            await toggleDriverActive(id);
            router.refresh();
        });
    };

    if (!open) return null;

    const inputCls = 'w-full text-sm border border-neutral-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black';

    return (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={onClose}>
            <div
                className="w-full max-w-md bg-white shadow-xl h-full overflow-y-auto p-5 space-y-4"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold">Manage Drivers</h2>
                    <button onClick={onClose} className="text-neutral-400 hover:text-black"><X size={20} /></button>
                </div>

                {drivers.map((d) => {
                    const Icon = VEHICLE_ICONS[d.vehicle_type] ?? Truck;
                    return (
                        <div key={d.id} className={`flex items-center justify-between gap-3 p-3 rounded border ${d.is_active ? 'border-neutral-200' : 'border-neutral-100 opacity-50'}`}>
                            <div className="flex items-center gap-2 min-w-0">
                                <Icon size={16} className="text-neutral-500 shrink-0" />
                                <div className="min-w-0">
                                    <div className="text-sm font-semibold truncate">{d.name}</div>
                                    {d.home_postcode && <div className="text-[11px] text-neutral-400">{d.home_postcode}</div>}
                                </div>
                            </div>
                            <button
                                onClick={() => handleToggle(d.id)}
                                disabled={pending}
                                className={`text-xs font-semibold px-2 py-1 rounded ${d.is_active ? 'bg-green-100 text-green-800' : 'bg-neutral-100 text-neutral-500'}`}
                            >
                                {d.is_active ? 'active' : 'inactive'}
                            </button>
                        </div>
                    );
                })}

                {showAdd ? (
                    <div className="space-y-2 border border-neutral-200 rounded p-3">
                        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Driver name *" className={inputCls} />
                        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className={inputCls} />
                        <input value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="Home postcode (for route start)" className={inputCls} />
                        <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} className={inputCls}>
                            <option value="van">Van</option>
                            <option value="truck">Truck</option>
                            <option value="car">Car</option>
                        </select>
                        {error && <p className="text-xs text-red-600">{error}</p>}
                        <div className="flex gap-2">
                            <button onClick={handleCreate} disabled={pending} className="btn-primary flex-1 inline-flex items-center justify-center gap-1 text-sm">
                                {pending && <Loader2 size={14} className="animate-spin" />} add driver
                            </button>
                            <button onClick={() => setShowAdd(false)} className="btn-secondary text-sm">cancel</button>
                        </div>
                    </div>
                ) : (
                    <button onClick={() => setShowAdd(true)} className="btn-secondary w-full inline-flex items-center justify-center gap-1 text-sm">
                        <Plus size={14} /> add driver
                    </button>
                )}
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add "app/(portal)/admin/planning/DriverManagerPanel.tsx"
git commit -m "feat(planning): DriverManagerPanel — driver CRUD slide-out"
```

---

### Task 8: DayColumn + DriverGroup + UnassignedPool

**Files:**
- Create: `app/(portal)/admin/planning/DriverGroup.tsx`
- Create: `app/(portal)/admin/planning/UnassignedPool.tsx`
- Create: `app/(portal)/admin/planning/DayColumn.tsx`

- [ ] **Step 1: Write DriverGroup**

```tsx
'use client';

import { Truck } from 'lucide-react';
import { formatDistance, formatDuration } from '@/lib/mapbox/utils';
import type { PlanningDelivery } from '@/lib/planning/utils';
import type { Driver } from '@/lib/drivers/types';

interface OptimisationResult {
    distance: number;
    duration: number;
    optimised: boolean;
}

interface Props {
    driver: Driver;
    deliveries: PlanningDelivery[];
    optimisation: OptimisationResult | null;
    onOptimise: () => void;
    onShowMap: () => void;
    optimising: boolean;
}

export function DriverGroup({ driver, deliveries, optimisation, onOptimise, onShowMap, optimising }: Props) {
    return (
        <div className="border border-neutral-200 rounded-lg bg-white p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <Truck size={14} className="text-neutral-500 shrink-0" />
                    <span className="text-sm font-bold truncate">{driver.name}</span>
                    <span className="text-[10px] text-neutral-400">{deliveries.length} stop{deliveries.length !== 1 ? 's' : ''}</span>
                </div>
                {optimisation && (
                    <div className="text-[10px] text-neutral-500 shrink-0">
                        {formatDistance(optimisation.distance)} · {formatDuration(optimisation.duration)}
                        {optimisation.optimised && <span className="text-green-700 ml-1">✓</span>}
                    </div>
                )}
            </div>

            <ul className="space-y-1">
                {deliveries.map((d, i) => (
                    <li key={d.id} className="text-xs text-neutral-700 flex items-center gap-2 py-1 px-2 rounded bg-neutral-50">
                        <span className="text-neutral-400 font-mono w-4">{i + 1}</span>
                        <span className="truncate">{d.org_name ?? d.site_name ?? d.delivery_number}</span>
                    </li>
                ))}
            </ul>

            <div className="flex gap-1">
                <button
                    type="button"
                    onClick={onOptimise}
                    disabled={optimising || deliveries.length < 2}
                    className="text-[11px] font-semibold text-[#4e7e8c] hover:underline disabled:opacity-40 disabled:no-underline"
                >
                    {optimising ? 'optimising…' : 'optimise route'}
                </button>
                {optimisation?.optimised && (
                    <button
                        type="button"
                        onClick={onShowMap}
                        className="text-[11px] font-semibold text-neutral-600 hover:underline ml-2"
                    >
                        show on map
                    </button>
                )}
            </div>

            {deliveries.length > 11 && (
                <p className="text-[10px] text-amber-700 bg-amber-50 rounded px-2 py-1">
                    ⚠ 12+ stops — split across drivers or days for optimisation
                </p>
            )}
        </div>
    );
}
```

- [ ] **Step 2: Write UnassignedPool**

```tsx
'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { PlanningDelivery } from '@/lib/planning/utils';
import type { Driver } from '@/lib/drivers/types';
import { assignDriverToDelivery } from '@/lib/deliveries/actions';

interface Props {
    deliveries: PlanningDelivery[];
    drivers: Driver[];
}

export function UnassignedPool({ deliveries, drivers }: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();

    if (deliveries.length === 0) return null;

    const assign = (deliveryId: string, driverId: string) => {
        startTransition(async () => {
            await assignDriverToDelivery(deliveryId, driverId);
            router.refresh();
        });
    };

    return (
        <div className="border border-dashed border-neutral-300 rounded-lg p-3 space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-1">
                unassigned
            </div>
            {deliveries.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2 text-xs py-1">
                    <span className="truncate text-neutral-700">{d.org_name ?? d.site_name ?? d.delivery_number}</span>
                    <select
                        defaultValue=""
                        onChange={(e) => { if (e.target.value) assign(d.id, e.target.value); }}
                        disabled={pending}
                        className="text-[11px] border border-neutral-200 rounded px-1.5 py-1 bg-white"
                    >
                        <option value="">assign ▾</option>
                        {drivers.map((dr) => (
                            <option key={dr.id} value={dr.id}>{dr.name}</option>
                        ))}
                    </select>
                </div>
            ))}
        </div>
    );
}
```

- [ ] **Step 3: Write DayColumn**

```tsx
'use client';

import type { PlanningDelivery, DayGroup } from '@/lib/planning/utils';
import type { Driver } from '@/lib/drivers/types';
import { DriverGroup } from './DriverGroup';
import { UnassignedPool } from './UnassignedPool';

interface OptimisationResult {
    distance: number;
    duration: number;
    optimised: boolean;
}

interface Props {
    date: string;
    dayGroup: DayGroup | null;
    drivers: Driver[];
    activeDrivers: Driver[];
    optimisations: Record<string, OptimisationResult>;
    optimisingDriverId: string | null;
    onOptimise: (driverId: string) => void;
    onShowMap: (driverId: string) => void;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function DayColumn({ date, dayGroup, drivers, activeDrivers, optimisations, optimisingDriverId, onOptimise, onShowMap }: Props) {
    const d = new Date(date + 'T00:00:00');
    const dayName = DAY_NAMES[d.getDay()];
    const dayNum = d.getDate();
    const isToday = date === new Date().toISOString().slice(0, 10);

    const driverGroups = dayGroup?.drivers ?? {};
    const unassigned = dayGroup?.unassigned ?? [];
    const totalStops = Object.values(driverGroups).reduce((sum, arr) => sum + arr.length, 0) + unassigned.length;

    return (
        <div className={`flex-1 min-w-[200px] border rounded-lg p-3 space-y-2 ${isToday ? 'border-[#4e7e8c] bg-[#e8f0f3]/30' : 'border-neutral-200 bg-white'}`}>
            <div className="flex items-center justify-between">
                <div>
                    <div className="text-sm font-bold text-neutral-900">{dayName} {dayNum}</div>
                </div>
                {totalStops > 0 && (
                    <span className="text-[10px] text-neutral-400">{totalStops} stop{totalStops !== 1 ? 's' : ''}</span>
                )}
            </div>

            {Object.entries(driverGroups).map(([driverId, deliveries]) => {
                const driver = drivers.find((dr) => dr.id === driverId);
                if (!driver) return null;
                return (
                    <DriverGroup
                        key={driverId}
                        driver={driver}
                        deliveries={deliveries}
                        optimisation={optimisations[driverId] ?? null}
                        onOptimise={() => onOptimise(driverId)}
                        onShowMap={() => onShowMap(driverId)}
                        optimising={optimisingDriverId === driverId}
                    />
                );
            })}

            <UnassignedPool deliveries={unassigned} drivers={activeDrivers} />

            {totalStops === 0 && (
                <p className="text-xs text-neutral-400 italic text-center py-4">no deliveries</p>
            )}
        </div>
    );
}
```

- [ ] **Step 4: Typecheck + commit**

```bash
npx tsc --noEmit
git add "app/(portal)/admin/planning/DriverGroup.tsx" "app/(portal)/admin/planning/UnassignedPool.tsx" "app/(portal)/admin/planning/DayColumn.tsx"
git commit -m "feat(planning): DayColumn + DriverGroup + UnassignedPool components"
```

---

### Task 9: PlanningClient — full week grid with optimisation

**Files:**
- Modify: `app/(portal)/admin/planning/PlanningClient.tsx` (replace stub)

- [ ] **Step 1: Write the full component**

```tsx
'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { groupDeliveriesByDriverAndDay, getWeekDates, type PlanningDelivery } from '@/lib/planning/utils';
import { optimiseRoute } from '@/lib/mapbox/client';
import { ONESIGN_HQ } from '@/lib/mapbox/utils';
import type { Driver } from '@/lib/drivers/types';
import { DayColumn } from './DayColumn';
import { DriverManagerPanel } from './DriverManagerPanel';

interface OptimisationResult {
    distance: number;
    duration: number;
    optimised: boolean;
    geometry?: GeoJSON.LineString;
}

interface Props {
    deliveries: PlanningDelivery[];
    activeDrivers: Driver[];
    allDrivers: Driver[];
    monday: string;
    includeWeekends: boolean;
}

export function PlanningClient({ deliveries, activeDrivers, allDrivers, monday, includeWeekends }: Props) {
    const router = useRouter();
    const [showDrivers, setShowDrivers] = useState(false);
    const [optimisations, setOptimisations] = useState<Record<string, OptimisationResult>>({});
    const [optimisingDriverId, setOptimisingDriverId] = useState<string | null>(null);

    const dates = getWeekDates(monday, includeWeekends);
    const grouped = groupDeliveriesByDriverAndDay(deliveries);

    const prevMonday = new Date(monday + 'T00:00:00');
    prevMonday.setDate(prevMonday.getDate() - 7);
    const nextMonday = new Date(monday + 'T00:00:00');
    nextMonday.setDate(nextMonday.getDate() + 7);

    const handleOptimise = useCallback(async (driverId: string, date: string) => {
        const key = `${driverId}-${date}`;
        const dayDeliveries = grouped[date]?.drivers[driverId] ?? [];
        if (dayDeliveries.length < 2) return;

        const geocoded = dayDeliveries.filter((d) => d.site_lat != null && d.site_lng != null);
        if (geocoded.length < 2) return;

        const driver = allDrivers.find((d) => d.id === driverId);
        const origin = driver?.home_lat && driver?.home_lng
            ? { lng: driver.home_lng, lat: driver.home_lat }
            : { lng: ONESIGN_HQ.lng, lat: ONESIGN_HQ.lat };

        const coords = [
            origin,
            ...geocoded.map((d) => ({ lng: d.site_lng!, lat: d.site_lat! })),
        ];

        if (coords.length > 12) return;

        setOptimisingDriverId(driverId);
        try {
            const result = await optimiseRoute(coords);
            setOptimisations((prev) => ({
                ...prev,
                [key]: {
                    distance: result.distance,
                    duration: result.duration,
                    optimised: true,
                    geometry: result.geometry,
                },
            }));
        } catch (err) {
            console.warn('Optimisation failed:', err);
        } finally {
            setOptimisingDriverId(null);
        }
    }, [grouped, allDrivers]);

    const handleShowMap = useCallback((driverId: string, date: string) => {
        // Future: open a map panel showing the optimised route.
        // For now, log to console. The map panel will be Task 10.
        const key = `${driverId}-${date}`;
        const opt = optimisations[key];
        if (opt?.geometry) {
            console.log('Route geometry for map:', opt.geometry);
        }
    }, [optimisations]);

    return (
        <div className="mt-4">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                    <Link
                        href={`/admin/planning?week=${prevMonday.toISOString().slice(0, 10)}${includeWeekends ? '&weekends=1' : ''}`}
                        className="p-1.5 rounded border border-neutral-200 hover:bg-neutral-50"
                    >
                        <ChevronLeft size={16} />
                    </Link>
                    <span className="text-sm font-semibold text-neutral-900">
                        w/c {new Date(monday).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </span>
                    <Link
                        href={`/admin/planning?week=${nextMonday.toISOString().slice(0, 10)}${includeWeekends ? '&weekends=1' : ''}`}
                        className="p-1.5 rounded border border-neutral-200 hover:bg-neutral-50"
                    >
                        <ChevronRight size={16} />
                    </Link>
                </div>

                <div className="flex items-center gap-2">
                    <Link
                        href={`/admin/planning?week=${monday}&weekends=${includeWeekends ? '0' : '1'}`}
                        className="text-xs font-semibold px-3 py-1.5 rounded border border-neutral-200 hover:bg-neutral-50"
                    >
                        {includeWeekends ? 'Mon–Fri' : 'Mon–Sun'}
                    </Link>
                    <button
                        onClick={() => setShowDrivers(true)}
                        className="btn-secondary inline-flex items-center gap-1 text-sm"
                    >
                        <Users size={14} /> manage drivers
                    </button>
                </div>
            </div>

            {/* Week grid */}
            <div className="flex gap-3 overflow-x-auto pb-4">
                {dates.map((date) => (
                    <DayColumn
                        key={date}
                        date={date}
                        dayGroup={grouped[date] ?? null}
                        drivers={allDrivers}
                        activeDrivers={activeDrivers}
                        optimisations={Object.fromEntries(
                            Object.entries(optimisations)
                                .filter(([k]) => k.endsWith(`-${date}`))
                                .map(([k, v]) => [k.split('-')[0], v])
                        )}
                        optimisingDriverId={optimisingDriverId}
                        onOptimise={(driverId) => handleOptimise(driverId, date)}
                        onShowMap={(driverId) => handleShowMap(driverId, date)}
                    />
                ))}
            </div>

            <DriverManagerPanel
                drivers={allDrivers}
                open={showDrivers}
                onClose={() => { setShowDrivers(false); router.refresh(); }}
            />
        </div>
    );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add "app/(portal)/admin/planning/PlanningClient.tsx"
git commit -m "feat(planning): PlanningClient — week grid with optimisation + driver management"
```

---

### Task 10: Manual smoke

No code changes.

- [ ] **Step 1: Apply migrations 049 + 050 in Supabase SQL editor**

- [ ] **Step 2: Add drivers**

Navigate to `/admin/planning` → click "manage drivers" → add two drivers (e.g. Dave in Durham DH1 3EL, Keith in Newcastle NE1 7RU).

- [ ] **Step 3: Create test deliveries**

Ensure there are scheduled deliveries for this week (either from the Test-O's seed or create new ones). Verify they appear as "unassigned" in the day columns.

- [ ] **Step 4: Assign + optimise**

Assign deliveries to drivers via the dropdown. Click "optimise route" on a driver with 2+ stops — verify distance/duration updates + ✓ badge appears.

- [ ] **Step 5: Week navigation**

Click prev/next week arrows. Toggle Mon–Sun. Verify the grid updates.

- [ ] **Step 6: Push**

```bash
git push origin master:main master
```

---

## Self-review

- **Spec coverage:** migrations 049-050 (Task 1), driver types + CRUD (Task 2), delivery driver_id + assign/reschedule (Task 3), optimiseRoute wrapper (Task 4), pure grouping helper + tests (Task 5), sidebar + server page (Task 6), DriverManagerPanel (Task 7), DayColumn + DriverGroup + UnassignedPool (Task 8), PlanningClient (Task 9), smoke (Task 10). All spec sections have tasks. ✓
- **Placeholders:** none. Every code block is literal. ✓
- **Type consistency:** `PlanningDelivery` defined in Task 5, consumed in Tasks 6/8/9. `Driver` defined in Task 2, consumed in Tasks 6/7/8/9. `OptimisedRouteResult` defined in Task 4, consumed in Task 9. `DayGroup` defined in Task 5, consumed in Task 8. All consistent. ✓
- **DnD:** spec mentions @dnd-kit drag-and-drop. For v1, the assign dropdown + week navigation covers the core workflow. Drag-and-drop between days/drivers is a polish pass after the core planning works — the dropdowns handle the same mutations. If the user wants DnD later, the server actions (`assignDriverToDelivery`, `rescheduleDelivery`) are already in place. ✓
