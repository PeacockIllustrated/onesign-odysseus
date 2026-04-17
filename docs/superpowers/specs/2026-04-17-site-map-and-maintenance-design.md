# Site-centric map + maintenance visits

*Design spec — 2026-04-17*

## Summary

Two additions that ship together:

1. **A site-centric UK map** at `/admin/map` showing a pin per `org_sites` row with active work. Each pin summarises what's happening at that site (quotes, artwork, production, deliveries, maintenance) and colour-codes by priority. Geocoding via postcodes.io (free, UK-only, no API key); rendering via React-Leaflet + OpenStreetMap tiles (free, no key, no bill).

2. **A lightweight maintenance-visits entity** — `maintenance_visits` table + CRUD + a list page at `/admin/maintenance`. Covers surveys, inspections, repairs, cleaning, and ad-hoc site visits. Feeds the map as a first-class pin badge alongside the existing record types.

## Scope

**In scope**

- Migration 047: `org_sites` gains `latitude` + `longitude` (nullable doubles)
- Migration 048: `maintenance_visits` table
- Server-side geocoding helper calling `postcodes.io/postcodes/{postcode}` on site create/update
- One-shot backfill action `geocodeAllSites()` for existing sites
- `/admin/map` — Leaflet map, one pin per geocoded site, popup with record summary + links
- Pin colour by highest-priority activity (delivery in-transit/overdue → artwork awaiting approval → production active → maintenance scheduled → quotes only)
- Filter toggles: Quotes / Artwork / Production / Deliveries / Maintenance
- `/admin/maintenance` — list page with status filter + create/edit
- Sidebar: "Map" under Production, "Maintenance" under Clients
- Maintenance visits carry `org_id`, `site_id`, `contact_id` (same inheritance pattern as everything else)

**Out of scope**

- Real-time pin updates (page refresh is fine)
- Non-UK postcodes (postcodes.io is UK-only; international can come later via a different geocoder)
- Route planning / driving directions
- Recurring/scheduled maintenance (cron-based auto-creation) — v1 is manual entries, future iteration adds recurrence
- Mobile-optimised map (works on tablet landscape; phone is a future polish pass)

## Data model

### Migration 047 — geocoding columns on `org_sites`

```sql
BEGIN;

ALTER TABLE public.org_sites
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_org_sites_geocoded
  ON public.org_sites(latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

COMMIT;
```

### Migration 048 — `maintenance_visits`

```sql
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

## Geocoding

### How it works

`postcodes.io` is a free, open-source UK postcode lookup API. No API key, no rate limit for reasonable use (single-tenant internal app = fine).

**On site create/update:** after the `org_sites` row is inserted/updated, if `postcode` is non-null and `latitude` is null (or postcode changed), call:

```
GET https://api.postcodes.io/postcodes/{postcode}
```

Response includes `result.latitude` and `result.longitude`. Write them to `org_sites`. If the postcode is invalid (status 404), leave lat/lng null — no crash, site just doesn't appear on the map.

**Backfill:** `geocodeAllSites()` iterates all sites where `latitude IS NULL AND postcode IS NOT NULL`, calls postcodes.io for each (with a 100ms delay between calls to be polite), and writes the results. Run once from the admin console.

### Server actions (`lib/geo/actions.ts`)

```ts
// geocodeSite(siteId) — fetch lat/lng from postcodes.io, write to org_sites
// geocodeAllSites() — backfill all ungeooded sites (one-shot admin action)
```

Both use `createAdminClient()` since they bypass RLS to write lat/lng on any org's site.

### Integration hook

The existing site-create/update server actions in `lib/orgs/` (or wherever `org_sites` rows are created) get a fire-and-forget call to `geocodeSite(siteId)` after the insert/update succeeds. Non-blocking — if postcodes.io is down, the site is created without coords and the map just skips it.

## Map page (`/admin/map`)

### Route

`app/(portal)/admin/map/page.tsx` — server component that loads:

1. All `org_sites` where `latitude IS NOT NULL AND longitude IS NOT NULL`
2. For each site: count of active records by type (via aggregation queries)
3. Passes the data to a client `MapClient.tsx`

### Record counts per site

One query per record type, grouped by `site_id`:

```sql
-- Quotes (draft/sent/accepted)
SELECT site_id, COUNT(*) FROM quotes
WHERE site_id IS NOT NULL AND status IN ('draft', 'sent', 'accepted')
GROUP BY site_id;

-- Artwork jobs (draft/in_progress)
SELECT site_id, COUNT(*) FROM artwork_jobs
WHERE site_id IS NOT NULL AND status IN ('draft', 'in_progress')
GROUP BY site_id;

-- Production jobs (active/paused)
SELECT site_id, COUNT(*) FROM production_jobs
WHERE site_id IS NOT NULL AND status IN ('active', 'paused')
GROUP BY site_id;

-- Deliveries (scheduled/in_transit)
SELECT site_id, COUNT(*) FROM deliveries
WHERE site_id IS NOT NULL AND status IN ('scheduled', 'in_transit')
GROUP BY site_id;

-- Maintenance (scheduled/in_progress)
SELECT site_id, COUNT(*) FROM maintenance_visits
WHERE site_id IS NOT NULL AND status IN ('scheduled', 'in_progress')
GROUP BY site_id;
```

Results are merged into a single `SitePin` object per site:

```ts
interface SitePin {
  siteId: string;
  siteName: string;
  orgName: string;
  address: string; // formatted from address fields
  lat: number;
  lng: number;
  quotes: number;
  artwork: number;
  production: number;
  deliveries: number;
  maintenance: number;
}
```

### Pin colour

Computed client-side from the counts:

```ts
function pinColour(pin: SitePin): string {
  if (pin.deliveries > 0) return 'red';      // delivery in transit or scheduled
  if (pin.artwork > 0) return 'amber';        // artwork awaiting approval
  if (pin.production > 0) return 'green';     // production active
  if (pin.maintenance > 0) return 'blue';     // maintenance scheduled
  return 'grey';                               // quotes only
}
```

### Pin popup (on click)

```
┌──────────────────────────────────┐
│ Test-O's HQ                      │
│ 14 High Street, Gateshead NE8 1AA│
│ Client: [DEMO] Test-O's          │
├──────────────────────────────────┤
│ 🟡 2 quotes                      │ → /admin/quotes?site=xxx
│ 🎨 1 artwork                     │ → /admin/artwork?site=xxx
│ ⚙️ 1 production job              │ → /admin/jobs
│ 🚚 1 delivery scheduled          │ → /admin/deliveries
│ 🔧 1 survey due 22 Apr           │ → /admin/maintenance
└──────────────────────────────────┘
```

Each row is a link. Zero-count rows are hidden.

### Filter bar

Above the map, a row of toggle buttons:

```
[Quotes ✓] [Artwork ✓] [Production ✓] [Deliveries ✓] [Maintenance ✓]
```

Deselecting a type removes pins that ONLY have that type. Pins with multiple types stay visible if any selected type has a non-zero count.

### Map defaults

- Centre: UK midpoint (~54.5, -2.5) at zoom 6 (shows all of England, Scotland, Wales)
- Tile layer: `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`
- Attribution: `© OpenStreetMap contributors`

## Maintenance list page (`/admin/maintenance`)

### Route

`app/(portal)/admin/maintenance/page.tsx`

### Layout

Status filter tabs: All / Scheduled / In Progress / Completed / Cancelled

Each row:
- Visit type pill (survey / inspection / repair / cleaning / other)
- Client name (from org)
- Site name + address
- Scheduled date
- Status chip
- Notes (truncated)

### Create / edit

A simple inline form or modal:
- Client (org dropdown)
- Site (filtered to org)
- Contact (filtered to org)
- Visit type dropdown
- Scheduled date
- Notes textarea

### Server actions (`lib/maintenance/actions.ts`)

```ts
createMaintenanceVisit(input) → { id } | { error }
updateMaintenanceVisit(id, patch) → { ok: true } | { error }
completeMaintenanceVisit(id) → { ok: true } | { error }
cancelMaintenanceVisit(id) → { ok: true } | { error }
getMaintenanceVisits(filters?) → MaintenanceVisit[]
```

## Sidebar changes

```ts
// Production group — add Map after Deliveries
{ label: 'Map', href: '/admin/map', icon: MapPin },

// Clients group — add Maintenance after Approvals
{ label: 'Maintenance', href: '/admin/maintenance', icon: Wrench },
```

## Architecture

### File layout

**New files**

- `supabase/migrations/047_org_sites_geocoding.sql`
- `supabase/migrations/048_maintenance_visits.sql`
- `lib/geo/actions.ts` — geocodeSite, geocodeAllSites
- `lib/maintenance/actions.ts` — CRUD actions
- `lib/maintenance/types.ts` — Zod schemas + types
- `app/(portal)/admin/map/page.tsx` — server component
- `app/(portal)/admin/map/MapClient.tsx` — Leaflet map (client component, dynamic import with `ssr: false`)
- `app/(portal)/admin/map/MapPopup.tsx` — pin popup content
- `app/(portal)/admin/maintenance/page.tsx` — list page
- `app/(portal)/admin/maintenance/MaintenanceClient.tsx` — client component with filters + create modal

**Modified files**

- `app/(portal)/components/Sidebar.tsx` — add Map + Maintenance nav items
- Site create/update actions (wherever `org_sites` rows are created) — call `geocodeSite` after save

### Leaflet + Next.js

React-Leaflet requires client-side rendering (no SSR). Use Next.js dynamic import:

```tsx
const MapClient = dynamic(() => import('./MapClient').then(m => m.MapClient), {
  ssr: false,
  loading: () => <div className="h-[600px] bg-neutral-100 animate-pulse rounded-lg" />,
});
```

Leaflet CSS imported in MapClient via `import 'leaflet/dist/leaflet.css'`.

### npm dependencies

```bash
npm install react-leaflet leaflet
npm install -D @types/leaflet
```

## Edge cases

- **Site with no postcode:** no geocoding attempted, no pin. Silent skip.
- **Invalid postcode:** postcodes.io returns 404. lat/lng stay null. No pin.
- **Site with postcode but geocoding failed (network):** lat/lng stay null. Next site save retries.
- **Site with active records but no lat/lng:** doesn't appear on the map. The list pages still show all records — the map is additive, not a replacement.
- **Multiple sites at the same postcode:** Leaflet clustering handles overlapping markers. Or offset slightly (~10m) to prevent perfect overlap. v1: just let them overlap; Leaflet's popup still works.
- **Zero active records on a site:** pin not shown (no point pinning an inactive site). If all record counts are zero, the site is filtered out before rendering.

## Testing

- **Pure function tests (Vitest):** `pinColour(pin)` — verify priority ordering. `formatSiteAddress(site)` — verify address assembly.
- **Geocoding:** manual test — call `geocodeSite` on the demo seed site (NE8 1AA) and verify lat/lng are written. `geocodeAllSites` backfill on a few rows.
- **Map rendering:** manual smoke in the browser — verify pins show, popups open, filters toggle, zoom/pan works.
- **Maintenance CRUD:** manual smoke — create, edit, complete, cancel, verify list filters.

## Risks

- **postcodes.io availability:** free service, no SLA. If it's down during a site save, lat/lng stay null and the map just skips that site. The save itself always succeeds — geocoding is fire-and-forget.
- **Leaflet bundle size:** ~40 KB gzipped for leaflet + react-leaflet. Acceptable for an internal admin tool. Dynamic import means it only loads on the map page.
- **OSM tile usage:** OpenStreetMap's tile usage policy asks that heavy users set up their own tile server. For a single-tenant app with <10 concurrent users, this is well within fair use.
