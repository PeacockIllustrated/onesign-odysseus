-- Seed: Realistic production test data for development
-- Run AFTER migration 024 in Supabase Studio SQL Editor.
-- Requires at least one org to exist. Update org UUIDs to match your dev database.

-- =============================================================================
-- HELPER: get stage IDs by slug
-- =============================================================================
-- This seed uses CTEs to avoid hardcoding UUIDs.

WITH
stages AS (
    SELECT id, slug FROM public.production_stages WHERE org_id IS NULL
),
-- Replace this with a real org UUID from your dev database:
-- SELECT id, name FROM public.orgs;
target_org AS (
    SELECT id FROM public.orgs LIMIT 1
),

-- Insert jobs
inserted_jobs AS (
    INSERT INTO public.production_jobs
        (org_id, title, client_name, description, current_stage_id, priority, status, assigned_initials, due_date, total_items)
    VALUES
        -- Design stage
        ((SELECT id FROM target_org), 'Plot signage — Whitburn Meadows Ph.3',          'Persimmon Homes',    'Phase 3 plot numbers and street signs',         (SELECT id FROM stages WHERE slug = 'design'),          'urgent', 'active', 'MP', CURRENT_DATE + 3,  12),
        ((SELECT id FROM target_org), 'Reception desk lettering — brushed steel',       'Balfour Beatty',     'Fabricated steel lettering for HQ reception',   (SELECT id FROM stages WHERE slug = 'design'),          'high',   'active', 'KR', CURRENT_DATE + 7,   1),
        ((SELECT id FROM target_org), 'Links with Nature — batch 4 interpretation',    'NHS RVI',            '4 interpretation boards, outdoor grade',         (SELECT id FROM stages WHERE slug = 'design'),          'normal', 'active', 'JH', CURRENT_DATE + 14,  4),

        -- Artwork Approval stage
        ((SELECT id FROM target_org), 'Site hoarding panels — A1 corridor',            'SKS Construction',   'Full-wrap hoarding for roadworks corridor',      (SELECT id FROM stages WHERE slug = 'artwork-approval'), 'urgent', 'active', 'DS', CURRENT_DATE + 2,  24),
        ((SELECT id FROM target_org), 'Forecourt canopy fascia — rebrand',              'Slick Construction', 'Replace faded teal fascia with new brand',       (SELECT id FROM stages WHERE slug = 'artwork-approval'), 'high',   'active', 'MP', CURRENT_DATE + 5,   6),

        -- Print stage
        ((SELECT id FROM target_org), 'Victoria MSCP — Level 3 wayfinding',            'Sunderland Council', 'Directional signs and floor markers',            (SELECT id FROM stages WHERE slug = 'print'),           'normal', 'active', 'TW', CURRENT_DATE + 6,   8),
        ((SELECT id FROM target_org), 'Office directory board — brushed aluminium',    'Mapleleaf',          'A-board style floor-standing directory',          (SELECT id FROM stages WHERE slug = 'print'),           'normal', 'active', 'JH', CURRENT_DATE + 10,  1),

        -- Fabrication stage
        ((SELECT id FROM target_org), 'Heritage trail waymarkers — set of 6',          'Sunderland Council', 'Cast aluminium effect waymarker posts',          (SELECT id FROM stages WHERE slug = 'fabrication'),     'normal', 'active', 'DS', CURRENT_DATE + 8,   6),
        ((SELECT id FROM target_org), 'Site entrance totem — dual-post',                'Halman Thompson',    'Illuminated totem with logo panel',               (SELECT id FROM stages WHERE slug = 'fabrication'),     'high',   'active', 'KR', CURRENT_DATE + 4,   1),

        -- Finishing stage
        ((SELECT id FROM target_org), 'Vehicle fleet graphics — 3 vans',               'SKS Construction',   'Full wrap livery on Transit fleet',               (SELECT id FROM stages WHERE slug = 'finishing'),       'normal', 'active', 'MP', CURRENT_DATE + 9,   3),

        -- QC stage
        ((SELECT id FROM target_org), 'Retail fascia — unit 14 rebrand',               'Persimmon Homes',    'ACM fascia panels, push-through letters',         (SELECT id FROM stages WHERE slug = 'qc'),              'normal', 'active', 'TW', CURRENT_DATE + 11,  4),

        -- Dispatch stage (overdue — test alert)
        ((SELECT id FROM target_org), 'Temporary site hoardings — batch 2',            'Balfour Beatty',     'Replacement hoarding after weather damage',       (SELECT id FROM stages WHERE slug = 'dispatch'),        'high',   'active', 'DS', CURRENT_DATE - 1,   8)

    RETURNING id, title, current_stage_id
),

-- Add some initial stage log entries
log_entries AS (
    INSERT INTO public.job_stage_log (job_id, from_stage_id, to_stage_id, moved_by_name, notes)
    SELECT
        j.id,
        NULL,
        j.current_stage_id,
        'System',
        'Job created'
    FROM inserted_jobs j
)

SELECT 'Seed complete — ' || count(*) || ' jobs created' FROM inserted_jobs;
