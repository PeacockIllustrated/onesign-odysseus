# Site-Centric Map + Maintenance Visits — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a UK map at `/admin/map` showing a pin per geocoded client site with active work (quotes, artwork, production, deliveries, maintenance), plus a lightweight `maintenance_visits` entity with CRUD at `/admin/maintenance`.

**Architecture:** Two migrations (geocoding columns + maintenance table), a postcodes.io geocoding helper that fires on site create/update, React-Leaflet + OSM for the map surface with marker clustering for overlapping pins, and a simple server-action + list-page for maintenance visits. Sidebar gains two new entries.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase SSR, React-Leaflet + Leaflet + react-leaflet-cluster, postcodes.io (free, no key), Tailwind 4, Zod, Vitest.

**Reference spec:** `docs/superpowers/specs/2026-04-17-site-map-and-maintenance-design.md`

---

## File map

**New files**

- `supabase/migrations/047_org_sites_geocoding.sql`
- `supabase/migrations/048_maintenance_visits.sql`
- `lib/geo/actions.ts` — geocodeSite, geocodeAllSites
- `lib/geo/utils.ts` — pinColour, formatSiteAddress (pure, testable)
- `lib/geo/utils.test.ts`
- `lib/maintenance/types.ts` — Zod schemas
- `lib/maintenance/actions.ts` — CRUD server actions
- `app/(portal)/admin/map/page.tsx` — server component
- `app/(portal)/admin/map/MapClient.tsx` — Leaflet map (client, `ssr: false`)
- `app/(portal)/admin/map/MapPopup.tsx` — pin popup content
- `app/(portal)/admin/maintenance/page.tsx` — server component
- `app/(portal)/admin/maintenance/MaintenanceClient.tsx` — list + create/edit

**Modified files**

- `app/(portal)/components/Sidebar.tsx` — add Map + Maintenance nav items
- `lib/clients/actions.ts` — call `geocodeSite` after site create/update
- `package.json` — add `leaflet`, `react-leaflet`, `react-leaflet-cluster`, `@types/leaflet`

---

### Task 1: npm dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install**

```bash
npm install react-leaflet leaflet react-leaflet-cluster
npm install -D @types/leaflet
```

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add leaflet + react-leaflet + react-leaflet-cluster"
```

---

### Task 2: Migration 047 — geocoding columns on `org_sites`

**Files:**
- Create: `supabase/migrations/047_org_sites_geocoding.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 047: lat/lng on org_sites for map geocoding
-- Populated by postcodes.io on site create/update. Nullable — sites
-- without a valid UK postcode simply don't appear on the map.

BEGIN;

ALTER TABLE public.org_sites
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_org_sites_geocoded
  ON public.org_sites(latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

COMMIT;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/047_org_sites_geocoding.sql
git commit -m "feat(db): migration 047 — lat/lng on org_sites for map geocoding"
```

---

### Task 3: Migration 048 — `maintenance_visits`

**Files:**
- Create: `supabase/migrations/048_maintenance_visits.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 048: maintenance visits — surveys, inspections, repairs, cleaning

BEGIN;

CREATE TABLE IF NOT EXISTS public.maintenance_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  site_id UUID REFERENCES public.org_sites(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  visit_type TEXT NOT NULL DEFAULT 'inspection'
    CHECK (visit_type IN ('survey', 'inspection', 'repair', 'cleaning', 'other')),
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  scheduled_date DATE NOT NULL DEFAULT CURRENT_DATE,
  completed_date DATE,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_visits_org
  ON public.maintenance_visits(org_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_visits_site
  ON public.maintenance_visits(site_id) WHERE site_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_maintenance_visits_status
  ON public.maintenance_visits(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_visits_scheduled
  ON public.maintenance_visits(scheduled_date);

CREATE TRIGGER trg_maintenance_visits_updated_at
  BEFORE UPDATE ON public.maintenance_visits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.maintenance_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage maintenance_visits"
  ON public.maintenance_visits FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Org members read their maintenance_visits"
  ON public.maintenance_visits FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

COMMIT;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/048_maintenance_visits.sql
git commit -m "feat(db): migration 048 — maintenance_visits table"
```

---

### Task 4: Pure utilities — `pinColour` + `formatSiteAddress` (TDD)

**Files:**
- Create: `lib/geo/utils.ts`
- Test: `lib/geo/utils.test.ts`

- [ ] **Step 1: Write the tests**

```ts
import { describe, it, expect } from 'vitest';
import { pinColour, formatSiteAddress } from './utils';

describe('pinColour', () => {
    it('returns red when deliveries > 0', () => {
        expect(pinColour({ deliveries: 1, artwork: 0, production: 0, maintenance: 0, quotes: 0 })).toBe('red');
    });
    it('returns amber when artwork > 0 and no deliveries', () => {
        expect(pinColour({ deliveries: 0, artwork: 2, production: 0, maintenance: 0, quotes: 0 })).toBe('amber');
    });
    it('returns green when production > 0 and no deliveries/artwork', () => {
        expect(pinColour({ deliveries: 0, artwork: 0, production: 1, maintenance: 0, quotes: 0 })).toBe('green');
    });
    it('returns blue when maintenance > 0 and no higher priorities', () => {
        expect(pinColour({ deliveries: 0, artwork: 0, production: 0, maintenance: 3, quotes: 0 })).toBe('blue');
    });
    it('returns grey when only quotes', () => {
        expect(pinColour({ deliveries: 0, artwork: 0, production: 0, maintenance: 0, quotes: 5 })).toBe('grey');
    });
    it('returns red even when all types are present', () => {
        expect(pinColour({ deliveries: 1, artwork: 1, production: 1, maintenance: 1, quotes: 1 })).toBe('red');
    });
});

describe('formatSiteAddress', () => {
    it('formats a full address', () => {
        expect(formatSiteAddress({
            address_line_1: '14 High Street',
            address_line_2: null,
            city: 'Gateshead',
            county: 'Tyne and Wear',
            postcode: 'NE8 1AA',
        })).toBe('14 High Street, Gateshead, Tyne and Wear, NE8 1AA');
    });
    it('skips null fields', () => {
        expect(formatSiteAddress({
            address_line_1: '14 High Street',
            address_line_2: null,
            city: null,
            county: null,
            postcode: 'NE8 1AA',
        })).toBe('14 High Street, NE8 1AA');
    });
    it('returns empty string when all null', () => {
        expect(formatSiteAddress({
            address_line_1: null,
            address_line_2: null,
            city: null,
            county: null,
            postcode: null,
        })).toBe('');
    });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
npm run test -- --run lib/geo/utils.test.ts
```

- [ ] **Step 3: Write implementation**

```ts
/**
 * Pure helpers for the site-centric map. No Supabase, no side effects.
 */

export interface RecordCounts {
    deliveries: number;
    artwork: number;
    production: number;
    maintenance: number;
    quotes: number;
}

/**
 * Pick pin colour by highest-priority active work.
 * Order: delivery (red) > artwork (amber) > production (green) >
 *        maintenance (blue) > quotes (grey).
 */
export function pinColour(counts: RecordCounts): string {
    if (counts.deliveries > 0) return 'red';
    if (counts.artwork > 0) return 'amber';
    if (counts.production > 0) return 'green';
    if (counts.maintenance > 0) return 'blue';
    return 'grey';
}

export interface SiteAddressFields {
    address_line_1: string | null;
    address_line_2: string | null;
    city: string | null;
    county: string | null;
    postcode: string | null;
}

/**
 * Format a site's address fields into a single comma-separated line,
 * skipping any null or empty fields.
 */
export function formatSiteAddress(site: SiteAddressFields): string {
    return [
        site.address_line_1,
        site.address_line_2,
        site.city,
        site.county,
        site.postcode,
    ]
        .filter((s): s is string => !!s)
        .join(', ');
}
```

- [ ] **Step 4: Run tests — expect 9 pass**

```bash
npm run test -- --run lib/geo/utils.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/geo/utils.ts lib/geo/utils.test.ts
git commit -m "feat(geo): pinColour + formatSiteAddress pure helpers with tests"
```

---

### Task 5: Geocoding server actions

**Files:**
- Create: `lib/geo/actions.ts`

- [ ] **Step 1: Write the file**

```ts
'use server';

import { createAdminClient } from '@/lib/supabase-admin';
import { revalidatePath } from 'next/cache';

/**
 * Geocode a single site by calling postcodes.io with its postcode.
 * Writes latitude + longitude to org_sites. Fire-and-forget — never
 * blocks the caller, never throws to the user.
 */
export async function geocodeSite(siteId: string): Promise<void> {
    const supabase = createAdminClient();

    const { data: site } = await supabase
        .from('org_sites')
        .select('id, postcode, latitude')
        .eq('id', siteId)
        .single();

    if (!site?.postcode) return;
    // Already geocoded and postcode hasn't changed — skip.
    if (site.latitude != null) return;

    try {
        const encoded = encodeURIComponent(site.postcode.replace(/\s+/g, ''));
        const res = await fetch(`https://api.postcodes.io/postcodes/${encoded}`, {
            next: { revalidate: 86400 }, // cache 24h
        });
        if (!res.ok) {
            console.warn(`geocodeSite: postcodes.io returned ${res.status} for "${site.postcode}"`);
            return;
        }
        const json = await res.json();
        const lat = json?.result?.latitude;
        const lng = json?.result?.longitude;
        if (lat == null || lng == null) return;

        await supabase
            .from('org_sites')
            .update({ latitude: lat, longitude: lng })
            .eq('id', siteId);
    } catch (err) {
        console.warn('geocodeSite fetch error:', err);
    }
}

/**
 * One-shot backfill: geocode every site that has a postcode but no lat/lng.
 * Polite 100ms delay between calls. Run from an admin console or a button.
 */
export async function geocodeAllSites(): Promise<{ geocoded: number; skipped: number }> {
    const supabase = createAdminClient();

    const { data: sites } = await supabase
        .from('org_sites')
        .select('id, postcode')
        .is('latitude', null)
        .not('postcode', 'is', null)
        .limit(500);

    let geocoded = 0;
    let skipped = 0;

    for (const site of sites ?? []) {
        try {
            const encoded = encodeURIComponent(site.postcode.replace(/\s+/g, ''));
            const res = await fetch(`https://api.postcodes.io/postcodes/${encoded}`);
            if (!res.ok) { skipped++; continue; }
            const json = await res.json();
            const lat = json?.result?.latitude;
            const lng = json?.result?.longitude;
            if (lat == null || lng == null) { skipped++; continue; }

            await supabase
                .from('org_sites')
                .update({ latitude: lat, longitude: lng })
                .eq('id', site.id);
            geocoded++;
        } catch {
            skipped++;
        }
        // Polite delay
        await new Promise((r) => setTimeout(r, 100));
    }

    revalidatePath('/admin/map');
    return { geocoded, skipped };
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add lib/geo/actions.ts
git commit -m "feat(geo): geocodeSite + geocodeAllSites via postcodes.io"
```

---

### Task 6: Wire geocoding into site create/update

**Files:**
- Modify: `lib/clients/actions.ts`

- [ ] **Step 1: Add geocode call to `createSiteAction`**

At the top of `lib/clients/actions.ts`, add:

```ts
import { geocodeSite } from '@/lib/geo/actions';
```

In `createSiteAction`, after the successful insert (after `return { id: data.id }` is prepared but before the return), add:

```ts
    // Fire-and-forget geocoding — never blocks the site save.
    geocodeSite(data.id).catch(() => {});
```

Place it right before `return { id: data.id };` (after the `revalidatePath` calls).

- [ ] **Step 2: Add geocode call to `updateSiteAction`**

In `updateSiteAction`, after the successful update (before `return { success: true }`), add:

```ts
    // Re-geocode if postcode might have changed.
    if (updates.postcode !== undefined) {
        // Clear cached lat/lng so geocodeSite fetches fresh.
        await supabase.from('org_sites').update({ latitude: null, longitude: null }).eq('id', id);
        geocodeSite(id).catch(() => {});
    }
```

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/clients/actions.ts
git commit -m "feat(geo): auto-geocode sites on create/update"
```

---

### Task 7: Maintenance types + Zod schemas

**Files:**
- Create: `lib/maintenance/types.ts`

- [ ] **Step 1: Write the file**

```ts
import { z } from 'zod';

export const VisitTypeEnum = z.enum(['survey', 'inspection', 'repair', 'cleaning', 'other']);
export type VisitType = z.infer<typeof VisitTypeEnum>;

export const VisitStatusEnum = z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']);
export type VisitStatus = z.infer<typeof VisitStatusEnum>;

export interface MaintenanceVisit {
    id: string;
    org_id: string;
    site_id: string | null;
    contact_id: string | null;
    visit_type: VisitType;
    status: VisitStatus;
    scheduled_date: string;
    completed_date: string | null;
    notes: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
    // Joined fields (from queries)
    org_name?: string;
    site_name?: string;
    contact_name?: string;
}

export const CreateMaintenanceVisitSchema = z.object({
    org_id: z.string().uuid(),
    site_id: z.string().uuid().nullable().optional(),
    contact_id: z.string().uuid().nullable().optional(),
    visit_type: VisitTypeEnum,
    scheduled_date: z.string().min(1, 'scheduled date is required'),
    notes: z.string().max(2000).optional(),
});
export type CreateMaintenanceVisitInput = z.infer<typeof CreateMaintenanceVisitSchema>;

export const UpdateMaintenanceVisitSchema = z.object({
    visit_type: VisitTypeEnum.optional(),
    status: VisitStatusEnum.optional(),
    scheduled_date: z.string().optional(),
    completed_date: z.string().nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    site_id: z.string().uuid().nullable().optional(),
    contact_id: z.string().uuid().nullable().optional(),
});
export type UpdateMaintenanceVisitInput = z.infer<typeof UpdateMaintenanceVisitSchema>;
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/maintenance/types.ts
git commit -m "feat(maintenance): Zod schemas + TypeScript types"
```

---

### Task 8: Maintenance server actions

**Files:**
- Create: `lib/maintenance/actions.ts`

- [ ] **Step 1: Write the file**

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase-admin';
import { getUser, requireSuperAdminOrError } from '@/lib/auth';
import {
    CreateMaintenanceVisitSchema,
    UpdateMaintenanceVisitSchema,
    type CreateMaintenanceVisitInput,
    type UpdateMaintenanceVisitInput,
    type MaintenanceVisit,
} from './types';

export async function getMaintenanceVisits(filters?: {
    status?: string;
}): Promise<MaintenanceVisit[]> {
    const supabase = createAdminClient();

    let query = supabase
        .from('maintenance_visits')
        .select(`
            *,
            orgs!inner(name),
            org_sites(name),
            contacts(first_name, last_name)
        `)
        .order('scheduled_date', { ascending: true })
        .limit(200);

    if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
    }

    const { data } = await query;

    return (data ?? []).map((row: any) => ({
        ...row,
        org_name: row.orgs?.name ?? null,
        site_name: row.org_sites?.name ?? null,
        contact_name: row.contacts
            ? `${row.contacts.first_name} ${row.contacts.last_name}`
            : null,
    }));
}

export async function createMaintenanceVisit(
    input: CreateMaintenanceVisitInput
): Promise<{ id: string } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return { error: gate.error };

    const validation = CreateMaintenanceVisitSchema.safeParse(input);
    if (!validation.success) return { error: validation.error.issues[0].message };
    const parsed = validation.data;

    const supabase = createAdminClient();

    const { data, error } = await supabase
        .from('maintenance_visits')
        .insert({
            org_id: parsed.org_id,
            site_id: parsed.site_id ?? null,
            contact_id: parsed.contact_id ?? null,
            visit_type: parsed.visit_type,
            scheduled_date: parsed.scheduled_date,
            notes: parsed.notes ?? null,
            created_by: user.id,
        })
        .select('id')
        .single();

    if (error || !data) return { error: error?.message ?? 'failed to create visit' };

    revalidatePath('/admin/maintenance');
    revalidatePath('/admin/map');
    return { id: data.id };
}

export async function updateMaintenanceVisit(
    visitId: string,
    patch: UpdateMaintenanceVisitInput
): Promise<{ ok: true } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return { error: gate.error };

    const validation = UpdateMaintenanceVisitSchema.safeParse(patch);
    if (!validation.success) return { error: validation.error.issues[0].message };
    const parsed = validation.data;

    const supabase = createAdminClient();

    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed)) {
        if (v !== undefined) updates[k] = v;
    }

    const { error } = await supabase
        .from('maintenance_visits')
        .update(updates)
        .eq('id', visitId);

    if (error) return { error: error.message };

    revalidatePath('/admin/maintenance');
    revalidatePath('/admin/map');
    return { ok: true };
}

export async function completeMaintenanceVisit(
    visitId: string
): Promise<{ ok: true } | { error: string }> {
    return updateMaintenanceVisit(visitId, {
        status: 'completed',
        completed_date: new Date().toISOString().slice(0, 10),
    });
}

export async function cancelMaintenanceVisit(
    visitId: string
): Promise<{ ok: true } | { error: string }> {
    return updateMaintenanceVisit(visitId, { status: 'cancelled' });
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add lib/maintenance/actions.ts
git commit -m "feat(maintenance): CRUD server actions"
```

---

### Task 9: Sidebar — Map + Maintenance nav items

**Files:**
- Modify: `app/(portal)/components/Sidebar.tsx`

- [ ] **Step 1: Add icons + nav items**

Add `MapPin` and `Wrench` to the lucide-react import:

```ts
import { ..., MapPin, Wrench, ... } from 'lucide-react';
```

Add "Map" to the Production group after Deliveries:

```ts
{ label: 'Map', href: '/admin/map', icon: MapPin },
```

Add "Maintenance" to the Clients group after Approvals:

```ts
{ label: 'Maintenance', href: '/admin/maintenance', icon: Wrench },
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add "app/(portal)/components/Sidebar.tsx"
git commit -m "feat(sidebar): add Map + Maintenance nav items"
```

---

### Task 10: Map page — server component + data loader

**Files:**
- Create: `app/(portal)/admin/map/page.tsx`

- [ ] **Step 1: Write the server component**

```tsx
import { requireAdmin } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase-server';
import dynamic from 'next/dynamic';
import { PageHeader } from '@/app/(portal)/components/ui';
import { formatSiteAddress, pinColour, type RecordCounts } from '@/lib/geo/utils';

export const forceDynamic = 'force-dynamic';

const MapClient = dynamic(() => import('./MapClient').then((m) => m.MapClient), {
    ssr: false,
    loading: () => (
        <div className="h-[600px] bg-neutral-100 animate-pulse rounded-lg flex items-center justify-center text-neutral-400 text-sm">
            Loading map…
        </div>
    ),
});

export interface SitePin {
    siteId: string;
    siteName: string;
    orgId: string;
    orgName: string;
    address: string;
    lat: number;
    lng: number;
    quotes: number;
    artwork: number;
    production: number;
    deliveries: number;
    maintenance: number;
    colour: string;
}

export default async function MapPage() {
    await requireAdmin();

    const supabase = await createServerClient();

    // 1. All geocoded sites + their org names.
    const { data: sites } = await supabase
        .from('org_sites')
        .select('id, name, org_id, address_line_1, address_line_2, city, county, postcode, latitude, longitude, orgs!inner(name)')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);

    if (!sites || sites.length === 0) {
        return (
            <div className="p-6 max-w-6xl mx-auto">
                <PageHeader title="Map" description="site-centric overview of active work across the UK" />
                <div className="mt-6 p-8 bg-neutral-50 border border-neutral-200 rounded-lg text-center text-sm text-neutral-500">
                    No geocoded sites yet. Add a postcode to a client site and it will appear here.
                </div>
            </div>
        );
    }

    // 2. Count active records per site.
    const countQuery = async (table: string, statuses: string[]) => {
        const { data } = await supabase
            .from(table)
            .select('site_id')
            .not('site_id', 'is', null)
            .in('status', statuses);
        const counts = new Map<string, number>();
        for (const row of data ?? []) {
            counts.set(row.site_id, (counts.get(row.site_id) ?? 0) + 1);
        }
        return counts;
    };

    const [quoteCounts, artworkCounts, productionCounts, deliveryCounts, maintenanceCounts] =
        await Promise.all([
            countQuery('quotes', ['draft', 'sent', 'accepted']),
            countQuery('artwork_jobs', ['draft', 'in_progress']),
            countQuery('production_jobs', ['active', 'paused']),
            countQuery('deliveries', ['scheduled', 'in_transit']),
            countQuery('maintenance_visits', ['scheduled', 'in_progress']),
        ]);

    // 3. Build pins.
    const pins: SitePin[] = [];
    for (const site of sites as any[]) {
        const counts: RecordCounts = {
            quotes: quoteCounts.get(site.id) ?? 0,
            artwork: artworkCounts.get(site.id) ?? 0,
            production: productionCounts.get(site.id) ?? 0,
            deliveries: deliveryCounts.get(site.id) ?? 0,
            maintenance: maintenanceCounts.get(site.id) ?? 0,
        };
        const total = counts.quotes + counts.artwork + counts.production + counts.deliveries + counts.maintenance;
        if (total === 0) continue; // Skip sites with no active work

        pins.push({
            siteId: site.id,
            siteName: site.name,
            orgId: site.org_id,
            orgName: site.orgs?.name ?? '—',
            address: formatSiteAddress(site),
            lat: site.latitude,
            lng: site.longitude,
            ...counts,
            colour: pinColour(counts),
        });
    }

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <PageHeader
                title="Map"
                description={`${pins.length} site${pins.length !== 1 ? 's' : ''} with active work`}
            />
            <div className="mt-4">
                <MapClient pins={pins} />
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Typecheck (will fail until MapClient exists — create stub)**

Create a minimal stub `app/(portal)/admin/map/MapClient.tsx`:

```tsx
'use client';
import type { SitePin } from './page';
interface Props { pins: SitePin[] }
export function MapClient(_: Props) { return <div data-stub="map" />; }
```

```bash
npx tsc --noEmit
git add "app/(portal)/admin/map"
git commit -m "feat(map): server component + data loader + MapClient stub"
```

---

### Task 11: `MapPopup` component

**Files:**
- Create: `app/(portal)/admin/map/MapPopup.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import Link from 'next/link';
import type { SitePin } from './page';

interface Props {
    pin: SitePin;
}

const ROW_CONFIG = [
    { key: 'quotes' as const, emoji: '📋', label: 'quote', href: '/admin/quotes' },
    { key: 'artwork' as const, emoji: '🎨', label: 'artwork', href: '/admin/artwork' },
    { key: 'production' as const, emoji: '⚙️', label: 'production job', href: '/admin/jobs' },
    { key: 'deliveries' as const, emoji: '🚚', label: 'delivery', href: '/admin/deliveries' },
    { key: 'maintenance' as const, emoji: '🔧', label: 'maintenance', href: '/admin/maintenance' },
] as const;

export function MapPopup({ pin }: Props) {
    return (
        <div style={{ minWidth: 200, fontFamily: 'system-ui, sans-serif' }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{pin.siteName}</div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 2 }}>{pin.address}</div>
            <div style={{ fontSize: 11, color: '#999', marginBottom: 8 }}>
                Client: {pin.orgName}
            </div>
            <div style={{ borderTop: '1px solid #eee', paddingTop: 6 }}>
                {ROW_CONFIG.map(({ key, emoji, label, href }) => {
                    const count = pin[key];
                    if (count === 0) return null;
                    return (
                        <Link
                            key={key}
                            href={href}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                fontSize: 12,
                                padding: '3px 0',
                                color: '#4e7e8c',
                                textDecoration: 'none',
                            }}
                        >
                            <span>{emoji} {count} {label}{count > 1 ? 's' : ''}</span>
                            <span style={{ fontSize: 10, color: '#999' }}>→</span>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
npx tsc --noEmit
git add "app/(portal)/admin/map/MapPopup.tsx"
git commit -m "feat(map): MapPopup — pin popup with record counts + links"
```

---

### Task 12: `MapClient` — Leaflet map with clustering + filters

**Files:**
- Modify: `app/(portal)/admin/map/MapClient.tsx` (replace stub)

- [ ] **Step 1: Write the full component**

```tsx
'use client';

import { useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { SitePin } from './page';
import { MapPopup } from './MapPopup';

// Fix Leaflet's default icon path issue in bundled environments.
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const COLOUR_MAP: Record<string, string> = {
    red: '#dc2626',
    amber: '#d97706',
    green: '#16a34a',
    blue: '#2563eb',
    grey: '#9ca3af',
};

function colourIcon(colour: string) {
    const hex = COLOUR_MAP[colour] ?? COLOUR_MAP.grey;
    return L.divIcon({
        className: '',
        html: `<div style="width:14px;height:14px;border-radius:50%;background:${hex};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3);"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
    });
}

const FILTER_KEYS = ['quotes', 'artwork', 'production', 'deliveries', 'maintenance'] as const;
type FilterKey = typeof FILTER_KEYS[number];

const FILTER_LABELS: Record<FilterKey, string> = {
    quotes: 'Quotes',
    artwork: 'Artwork',
    production: 'Production',
    deliveries: 'Deliveries',
    maintenance: 'Maintenance',
};

interface Props {
    pins: SitePin[];
}

export function MapClient({ pins }: Props) {
    const [filters, setFilters] = useState<Record<FilterKey, boolean>>({
        quotes: true,
        artwork: true,
        production: true,
        deliveries: true,
        maintenance: true,
    });

    const toggle = (key: FilterKey) => {
        setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const visiblePins = useMemo(() => {
        return pins.filter((pin) => {
            // Show pin if ANY enabled filter has a non-zero count.
            return FILTER_KEYS.some((k) => filters[k] && pin[k] > 0);
        });
    }, [pins, filters]);

    // UK centre
    const centre: [number, number] = [54.5, -2.5];

    return (
        <div>
            {/* Filter bar */}
            <div className="flex flex-wrap gap-2 mb-3">
                {FILTER_KEYS.map((key) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => toggle(key)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
                            filters[key]
                                ? 'bg-black text-white border-black'
                                : 'bg-white text-neutral-500 border-neutral-300'
                        }`}
                    >
                        {FILTER_LABELS[key]}
                    </button>
                ))}
                <span className="text-xs text-neutral-400 self-center ml-2">
                    {visiblePins.length} site{visiblePins.length !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Map */}
            <div className="rounded-lg overflow-hidden border border-neutral-200" style={{ height: 600 }}>
                <MapContainer
                    center={centre}
                    zoom={6}
                    scrollWheelZoom={true}
                    style={{ height: '100%', width: '100%' }}
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <MarkerClusterGroup chunkedLoading>
                        {visiblePins.map((pin) => (
                            <Marker
                                key={pin.siteId}
                                position={[pin.lat, pin.lng]}
                                icon={colourIcon(pin.colour)}
                            >
                                <Popup>
                                    <MapPopup pin={pin} />
                                </Popup>
                            </Marker>
                        ))}
                    </MarkerClusterGroup>
                </MapContainer>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add "app/(portal)/admin/map/MapClient.tsx"
git commit -m "feat(map): MapClient — Leaflet map with clustering, colour-coded pins, filter toggles"
```

---

### Task 13: Maintenance list page

**Files:**
- Create: `app/(portal)/admin/maintenance/page.tsx`
- Create: `app/(portal)/admin/maintenance/MaintenanceClient.tsx`

- [ ] **Step 1: Write the server page**

```tsx
import { requireAdmin } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase-server';
import { getMaintenanceVisits } from '@/lib/maintenance/actions';
import { PageHeader } from '@/app/(portal)/components/ui';
import { MaintenanceClient } from './MaintenanceClient';

export const dynamic = 'force-dynamic';

export default async function MaintenancePage() {
    await requireAdmin();

    const visits = await getMaintenanceVisits();

    const supabase = await createServerClient();
    const [orgsRes, contactsRes, sitesRes] = await Promise.all([
        supabase.from('orgs').select('id, name').order('name').limit(200),
        supabase.from('contacts').select('id, org_id, first_name, last_name').order('first_name'),
        supabase.from('org_sites').select('id, org_id, name').order('name'),
    ]);

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <PageHeader
                title="Maintenance"
                description="surveys, inspections, repairs, and site visits"
            />
            <MaintenanceClient
                initialVisits={visits}
                orgs={orgsRes.data ?? []}
                contacts={(contactsRes.data ?? []) as any}
                sites={(sitesRes.data ?? []) as any}
            />
        </div>
    );
}
```

- [ ] **Step 2: Write the client component**

```tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Loader2, X, CheckCircle, XCircle } from 'lucide-react';
import { Card, Chip } from '@/app/(portal)/components/ui';
import { createMaintenanceVisit, completeMaintenanceVisit, cancelMaintenanceVisit } from '@/lib/maintenance/actions';
import type { MaintenanceVisit } from '@/lib/maintenance/types';

interface Props {
    initialVisits: MaintenanceVisit[];
    orgs: { id: string; name: string }[];
    contacts: { id: string; org_id: string; first_name: string; last_name: string }[];
    sites: { id: string; org_id: string; name: string }[];
}

const STATUS_TABS = ['all', 'scheduled', 'in_progress', 'completed', 'cancelled'] as const;
const TYPE_LABELS: Record<string, string> = {
    survey: 'Survey',
    inspection: 'Inspection',
    repair: 'Repair',
    cleaning: 'Cleaning',
    other: 'Other',
};
const STATUS_VARIANTS: Record<string, 'draft' | 'active' | 'approved' | 'paused'> = {
    scheduled: 'draft',
    in_progress: 'active',
    completed: 'approved',
    cancelled: 'paused',
};

export function MaintenanceClient({ initialVisits, orgs, contacts, sites }: Props) {
    const router = useRouter();
    const [tab, setTab] = useState<string>('all');
    const [showCreate, setShowCreate] = useState(false);
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    // Create form state
    const [orgId, setOrgId] = useState('');
    const [siteId, setSiteId] = useState('');
    const [contactId, setContactId] = useState('');
    const [visitType, setVisitType] = useState('inspection');
    const [scheduledDate, setScheduledDate] = useState(new Date().toISOString().slice(0, 10));
    const [notes, setNotes] = useState('');

    const orgContacts = orgId ? contacts.filter((c) => c.org_id === orgId) : [];
    const orgSites = orgId ? sites.filter((s) => s.org_id === orgId) : [];

    const filteredVisits = tab === 'all'
        ? initialVisits
        : initialVisits.filter((v) => v.status === tab);

    const handleCreate = () => {
        if (!orgId) { setError('select a client'); return; }
        setError(null);
        startTransition(async () => {
            const res = await createMaintenanceVisit({
                org_id: orgId,
                site_id: siteId || null,
                contact_id: contactId || null,
                visit_type: visitType as any,
                scheduled_date: scheduledDate,
                notes: notes || undefined,
            });
            if ('error' in res) { setError(res.error); return; }
            setShowCreate(false);
            setOrgId(''); setSiteId(''); setContactId('');
            setVisitType('inspection'); setNotes('');
            router.refresh();
        });
    };

    const handleComplete = (id: string) => {
        startTransition(async () => {
            await completeMaintenanceVisit(id);
            router.refresh();
        });
    };

    const handleCancel = (id: string) => {
        startTransition(async () => {
            await cancelMaintenanceVisit(id);
            router.refresh();
        });
    };

    const inputCls = 'w-full text-sm border border-neutral-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black';

    return (
        <div className="mt-4 space-y-4">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-1">
                    {STATUS_TABS.map((s) => (
                        <button
                            key={s}
                            onClick={() => setTab(s)}
                            className={`px-3 py-1.5 text-xs font-semibold rounded ${
                                tab === s ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-600'
                            }`}
                        >
                            {s === 'all' ? 'All' : s.replace('_', ' ')}
                        </button>
                    ))}
                </div>
                <button
                    onClick={() => setShowCreate(true)}
                    className="btn-primary inline-flex items-center gap-2 text-sm"
                >
                    <Plus size={14} /> new visit
                </button>
            </div>

            {/* Create modal */}
            {showCreate && (
                <Card className="space-y-3">
                    <div className="flex justify-between items-center">
                        <h3 className="text-sm font-bold">Schedule a maintenance visit</h3>
                        <button onClick={() => setShowCreate(false)} className="text-neutral-400 hover:text-black"><X size={16} /></button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-medium text-neutral-600">Client *</label>
                            <select value={orgId} onChange={(e) => { setOrgId(e.target.value); setSiteId(''); setContactId(''); }} className={inputCls}>
                                <option value="">— select —</option>
                                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-neutral-600">Type</label>
                            <select value={visitType} onChange={(e) => setVisitType(e.target.value)} className={inputCls}>
                                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                        </div>
                        {orgId && (
                            <>
                                <div>
                                    <label className="text-xs font-medium text-neutral-600">Site</label>
                                    <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className={inputCls}>
                                        <option value="">— none —</option>
                                        {orgSites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-neutral-600">Contact</label>
                                    <select value={contactId} onChange={(e) => setContactId(e.target.value)} className={inputCls}>
                                        <option value="">— none —</option>
                                        {orgContacts.map((c) => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                                    </select>
                                </div>
                            </>
                        )}
                        <div>
                            <label className="text-xs font-medium text-neutral-600">Scheduled date *</label>
                            <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} className={inputCls} />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-medium text-neutral-600">Notes</label>
                        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} placeholder="e.g. annual sign inspection, check illumination" />
                    </div>
                    {error && <p className="text-sm text-red-600">{error}</p>}
                    <div className="flex justify-end">
                        <button onClick={handleCreate} disabled={pending} className="btn-primary inline-flex items-center gap-2">
                            {pending && <Loader2 size={14} className="animate-spin" />} schedule visit
                        </button>
                    </div>
                </Card>
            )}

            {/* List */}
            {filteredVisits.length === 0 ? (
                <Card>
                    <p className="text-sm text-neutral-500 text-center py-8">
                        No {tab === 'all' ? '' : tab.replace('_', ' ') + ' '}maintenance visits.
                    </p>
                </Card>
            ) : (
                <div className="border border-neutral-200 rounded-lg overflow-hidden bg-white">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-neutral-50 border-b border-neutral-200 text-left">
                                <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Type</th>
                                <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Client</th>
                                <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Site</th>
                                <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Scheduled</th>
                                <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Status</th>
                                <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Notes</th>
                                <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                            {filteredVisits.map((v) => (
                                <tr key={v.id} className="hover:bg-neutral-50">
                                    <td className="px-4 py-3">
                                        <span className="text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-neutral-100 text-neutral-700">
                                            {TYPE_LABELS[v.visit_type] ?? v.visit_type}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-xs font-medium">{v.org_name ?? '—'}</td>
                                    <td className="px-4 py-3 text-xs text-neutral-600">{v.site_name ?? '—'}</td>
                                    <td className="px-4 py-3 text-xs">{v.scheduled_date}</td>
                                    <td className="px-4 py-3">
                                        <Chip variant={STATUS_VARIANTS[v.status] ?? 'draft'}>
                                            {v.status.replace('_', ' ')}
                                        </Chip>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-neutral-500 max-w-[200px] truncate" title={v.notes ?? ''}>
                                        {v.notes ?? '—'}
                                    </td>
                                    <td className="px-4 py-3">
                                        {v.status === 'scheduled' || v.status === 'in_progress' ? (
                                            <div className="flex gap-1">
                                                <button
                                                    onClick={() => handleComplete(v.id)}
                                                    disabled={pending}
                                                    className="p-1 text-green-700 hover:bg-green-50 rounded"
                                                    title="Complete"
                                                >
                                                    <CheckCircle size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleCancel(v.id)}
                                                    disabled={pending}
                                                    className="p-1 text-red-700 hover:bg-red-50 rounded"
                                                    title="Cancel"
                                                >
                                                    <XCircle size={16} />
                                                </button>
                                            </div>
                                        ) : null}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add "app/(portal)/admin/maintenance"
git commit -m "feat(maintenance): list page with filters, create form, complete/cancel actions"
```

---

### Task 14: Manual smoke test

Human verification — no code changes.

- [ ] **Step 1: Apply migrations 047 + 048 in Supabase SQL editor**

- [ ] **Step 2: Backfill geocoding**

Open the browser dev console on any admin page and run:
```js
// Or create a temporary button — the geocodeAllSites action is a server action.
```

Alternatively, add a temporary "Geocode all sites" button on the map page for the backfill. Or run the SQL directly:

```sql
-- Quick check: do any sites have postcodes?
SELECT id, name, postcode, latitude FROM public.org_sites WHERE postcode IS NOT NULL;
```

If the Test-O's seed site has postcode NE8 1AA, its lat/lng should be populated after geocoding (~54.96, -1.60).

- [ ] **Step 3: Test the map**

Navigate to `/admin/map`:
- Pins visible for geocoded sites with active work
- Click a pin → popup shows site name, client, record counts
- Filter toggles hide/show pins correctly
- Cluster bubbles appear when pins overlap at same postcode
- Zoom/pan works smoothly

- [ ] **Step 4: Test maintenance**

Navigate to `/admin/maintenance`:
- Click "new visit" → create a survey for the Test-O's demo client
- Verify it appears in the list
- Click the green ✓ to complete it
- Status changes to "completed"
- Switch to `/admin/map` — verify the maintenance count appears (or disappears if completed)

- [ ] **Step 5: Push**

```bash
git push origin master:main master
```

---

## Self-review

- **Spec coverage:** migrations 047+048 (Tasks 2-3), geocoding (Tasks 5-6), pure helpers + tests (Task 4), map page + client + popup + clustering (Tasks 10-12), maintenance CRUD + types (Tasks 7-8), maintenance list page (Task 13), sidebar (Task 9), npm deps (Task 1), smoke (Task 14). All spec sections have tasks. ✓
- **Placeholders:** none. Every code block is literal. ✓
- **Type consistency:** `SitePin` defined in Task 10 page.tsx, consumed in Tasks 11 (MapPopup) and 12 (MapClient). `RecordCounts` defined in Task 4, consumed in Task 10. `MaintenanceVisit` defined in Task 7, consumed in Task 13. `CreateMaintenanceVisitInput` defined in Task 7, consumed in Task 8. All consistent. ✓
- **Marker clustering:** `react-leaflet-cluster` installed in Task 1, used in Task 12. ✓
- **Edge case — multiple pins at same location:** handled by MarkerClusterGroup in Task 12. ✓
