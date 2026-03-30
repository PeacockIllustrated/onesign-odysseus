-- =============================================================================
-- TEST SEED: Full pipeline demo data
-- =============================================================================
-- Purpose: One job per stage to verify the full board, shop floor, and
--          dashboard are working correctly. All test jobs are prefixed
--          "[TEST]" in client_name for easy identification.
--
-- Run AFTER migrations 024 and 025 in Supabase Studio SQL Editor.
-- Requires at least one org to exist.
--
-- TO REMOVE ALL TEST DATA:
--   DELETE FROM public.production_jobs WHERE client_name LIKE '[TEST]%';
--   (Cascades to job_items, job_stage_log, department_instructions via FK)
-- =============================================================================

WITH
stages AS (
    SELECT id, slug, sort_order
    FROM public.production_stages
    WHERE org_id IS NULL
    ORDER BY sort_order
),
target_org AS (
    SELECT id FROM public.orgs LIMIT 1
),

-- -------------------------------------------------------------------------
-- One job per stage — covers all 7 stages with a mix of priorities/statuses
-- -------------------------------------------------------------------------
inserted_jobs AS (
    INSERT INTO public.production_jobs
        (org_id, title, client_name, description, current_stage_id, priority, status, assigned_initials, due_date, total_items)
    VALUES
        -- 1. Design
        (
            (SELECT id FROM target_org),
            'Shop front signage — full rebrand',
            '[TEST] Onesign Demo Co',
            'New fascia lettering, window graphics, and A-board for rebranded high street unit.',
            (SELECT id FROM stages WHERE slug = 'design'),
            'high', 'active', 'MP',
            CURRENT_DATE + 5, 4
        ),

        -- 2. Artwork Approval
        (
            (SELECT id FROM target_org),
            'Site hoarding wrap — phase 2',
            '[TEST] Onesign Demo Co',
            'Full-colour hoarding panels for construction site frontage. Client to approve artwork before print.',
            (SELECT id FROM stages WHERE slug = 'artwork-approval'),
            'urgent', 'active', 'KR',
            CURRENT_DATE + 2, 12
        ),

        -- 3. Print
        (
            (SELECT id FROM target_org),
            'Wayfinding signage — level 3',
            '[TEST] Onesign Demo Co',
            'Directional arrows and room ID plates for third-floor refurb.',
            (SELECT id FROM stages WHERE slug = 'print'),
            'normal', 'active', 'TW',
            CURRENT_DATE + 7, 8
        ),

        -- 4. Fabrication
        (
            (SELECT id FROM target_org),
            'Illuminated totem — dual-post',
            '[TEST] Onesign Demo Co',
            'Internal illumination, aluminium cladding, client logo panel. Two posts, 4m height.',
            (SELECT id FROM stages WHERE slug = 'fabrication'),
            'high', 'active', 'DS',
            CURRENT_DATE + 4, 1
        ),

        -- 5. Finishing
        (
            (SELECT id FROM target_org),
            'Van fleet wrap — 2 vehicles',
            '[TEST] Onesign Demo Co',
            'Full livery on two Ford Transits. Laminate and mount included.',
            (SELECT id FROM stages WHERE slug = 'finishing'),
            'normal', 'paused', 'JH',
            CURRENT_DATE + 9, 2
        ),

        -- 6. QC
        (
            (SELECT id FROM target_org),
            'Reception wall graphics — HQ',
            '[TEST] Onesign Demo Co',
            'Frosted vinyl manifestation and branded feature wall. Check alignment before dispatch.',
            (SELECT id FROM stages WHERE slug = 'qc'),
            'normal', 'active', 'MP',
            CURRENT_DATE + 11, 3
        ),

        -- 7. Dispatch (overdue — tests the red overdue indicator)
        (
            (SELECT id FROM target_org),
            'Plot numbers — Phase 1 handover',
            '[TEST] Onesign Demo Co',
            'Set of 47 plot number plaques, bagged and labelled per plot. Delivery to site required.',
            (SELECT id FROM stages WHERE slug = 'dispatch'),
            'urgent', 'active', 'KR',
            CURRENT_DATE - 1, 47
        )

    RETURNING id, title, current_stage_id
),

-- -------------------------------------------------------------------------
-- Stage log entries — give each job a realistic history of prior stages
-- -------------------------------------------------------------------------
log_entries AS (
    INSERT INTO public.job_stage_log (job_id, from_stage_id, to_stage_id, moved_by_name, notes)

    -- Design job: just created
    SELECT j.id, NULL, j.current_stage_id, 'System', '[TEST] Job created — entering Design'
    FROM inserted_jobs j
    WHERE j.title = 'Shop front signage — full rebrand'

    UNION ALL

    -- Artwork Approval job: came from Design
    SELECT j.id, (SELECT id FROM stages WHERE slug = 'design'), j.current_stage_id,
           'MP', '[TEST] Artwork drafted, sent to client for approval'
    FROM inserted_jobs j
    WHERE j.title = 'Site hoarding wrap — phase 2'

    UNION ALL

    -- Print job: came through Design → Artwork Approval
    SELECT j.id, (SELECT id FROM stages WHERE slug = 'design'), (SELECT id FROM stages WHERE slug = 'artwork-approval'),
           'KR', '[TEST] Moved to artwork approval'
    FROM inserted_jobs j
    WHERE j.title = 'Wayfinding signage — level 3'

    UNION ALL

    SELECT j.id, (SELECT id FROM stages WHERE slug = 'artwork-approval'), j.current_stage_id,
           'KR', '[TEST] Artwork approved by client — ready to print'
    FROM inserted_jobs j
    WHERE j.title = 'Wayfinding signage — level 3'

    UNION ALL

    -- Fabrication job: Design → Artwork Approval → Print → Fabrication
    SELECT j.id, (SELECT id FROM stages WHERE slug = 'print'), j.current_stage_id,
           'TW', '[TEST] Print complete, passed to fabrication team'
    FROM inserted_jobs j
    WHERE j.title = 'Illuminated totem — dual-post'

    UNION ALL

    -- Finishing job: through to Finishing
    SELECT j.id, (SELECT id FROM stages WHERE slug = 'fabrication'), j.current_stage_id,
           'DS', '[TEST] Fabrication signed off, moving to finishing'
    FROM inserted_jobs j
    WHERE j.title = 'Van fleet wrap — 2 vehicles'

    UNION ALL

    -- QC job: through to QC
    SELECT j.id, (SELECT id FROM stages WHERE slug = 'finishing'), j.current_stage_id,
           'JH', '[TEST] Finishing complete, QC check required before dispatch'
    FROM inserted_jobs j
    WHERE j.title = 'Reception wall graphics — HQ'

    UNION ALL

    -- Dispatch job: full journey
    SELECT j.id, (SELECT id FROM stages WHERE slug = 'qc'), j.current_stage_id,
           'MP', '[TEST] Passed QC — ready for dispatch. OVERDUE.'
    FROM inserted_jobs j
    WHERE j.title = 'Plot numbers — Phase 1 handover'
),

-- -------------------------------------------------------------------------
-- Department instructions — show on the Artwork Approval and Fabrication jobs
-- so the shop floor expanded view has visible content
-- -------------------------------------------------------------------------
test_instructions AS (
    INSERT INTO public.department_instructions (job_id, stage_id, instruction, created_by_name)

    SELECT
        j.id,
        (SELECT id FROM stages WHERE slug = 'artwork-approval'),
        '[TEST] Client contact: Sarah Mellor — sarah@democlient.com. Chase approval if no response by 9am on due date.',
        'KR'
    FROM inserted_jobs j
    WHERE j.title = 'Site hoarding wrap — phase 2'

    UNION ALL

    SELECT
        j.id,
        (SELECT id FROM stages WHERE slug = 'fabrication'),
        '[TEST] Use brushed aluminium substrate (not gloss). Double-check logo panel orientation — client had issues last time.',
        'DS'
    FROM inserted_jobs j
    WHERE j.title = 'Illuminated totem — dual-post'
)

SELECT
    '[TEST] Seed complete — ' || count(*) || ' test jobs created across all 7 stages. '
    || 'Remove with: DELETE FROM production_jobs WHERE client_name LIKE ''[TEST]%''' AS result
FROM inserted_jobs;
