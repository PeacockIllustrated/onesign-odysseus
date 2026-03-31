-- =============================================================================
-- TEST SEED: Per-item pipeline demo data (Phase 2 architecture)
-- =============================================================================
-- Purpose: Realistic Onesign production data with job_items as the card unit.
--          Items have stage_routing, work_centre assignments, and are spread
--          across multiple departments. All test data prefixed "[TEST]".
--
-- Run AFTER migrations 024 + 028 (+ 029 if needed) in Supabase SQL Editor.
-- Requires at least one org to exist.
--
-- TO REMOVE ALL TEST DATA:
--   DELETE FROM public.production_jobs WHERE client_name LIKE '[TEST]%';
--   (Cascades to job_items, job_stage_log, department_instructions via FK)
-- =============================================================================

DO $$
DECLARE
    v_org_id UUID;
    -- Stage IDs
    s_order_book UUID;
    s_artwork    UUID;
    s_cut_list   UUID;
    s_laser      UUID;
    s_cnc        UUID;
    s_plastic    UUID;
    s_metal      UUID;
    s_painters   UUID;
    s_lighting   UUID;
    s_vinyl      UUID;
    s_digital    UUID;
    s_assembly   UUID;
    s_goods_out  UUID;
    -- Work centre IDs
    wc_amd    UUID;
    wc_dacon  UUID;
    wc_sparkle UUID;
    -- Job IDs
    j1 UUID; j2 UUID; j3 UUID; j4 UUID; j5 UUID; j6 UUID; j7 UUID;
    -- Item IDs (for stage log)
    i_id UUID;
BEGIN
    -- Get org
    SELECT id INTO v_org_id FROM public.orgs LIMIT 1;
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'No org found — create one first';
    END IF;

    -- Resolve stage IDs
    SELECT id INTO s_order_book FROM public.production_stages WHERE slug = 'order-book'          AND is_default = TRUE;
    SELECT id INTO s_artwork    FROM public.production_stages WHERE slug = 'artwork-approval'     AND is_default = TRUE;
    SELECT id INTO s_cut_list   FROM public.production_stages WHERE slug = 'cut-list'             AND is_default = TRUE;
    SELECT id INTO s_laser      FROM public.production_stages WHERE slug = 'laser'                AND is_default = TRUE;
    SELECT id INTO s_cnc        FROM public.production_stages WHERE slug = 'cnc-routing'          AND is_default = TRUE;
    SELECT id INTO s_plastic    FROM public.production_stages WHERE slug = 'plastic-fabrication'   AND is_default = TRUE;
    SELECT id INTO s_metal      FROM public.production_stages WHERE slug = 'metal-fabrication'     AND is_default = TRUE;
    SELECT id INTO s_painters   FROM public.production_stages WHERE slug = 'painters'             AND is_default = TRUE;
    SELECT id INTO s_lighting   FROM public.production_stages WHERE slug = 'lighting'             AND is_default = TRUE;
    SELECT id INTO s_vinyl      FROM public.production_stages WHERE slug = 'vinyl'                AND is_default = TRUE;
    SELECT id INTO s_digital    FROM public.production_stages WHERE slug = 'digital-print'        AND is_default = TRUE;
    SELECT id INTO s_assembly   FROM public.production_stages WHERE slug = 'assembly'             AND is_default = TRUE;
    SELECT id INTO s_goods_out  FROM public.production_stages WHERE slug = 'goods-out'            AND is_default = TRUE;

    IF s_order_book IS NULL THEN
        RAISE EXCEPTION 'Stages not found — run migration 028 first';
    END IF;

    -- Resolve work centre IDs
    SELECT id INTO wc_amd     FROM public.work_centres WHERE slug = 'amd'     AND stage_id = s_painters;
    SELECT id INTO wc_dacon   FROM public.work_centres WHERE slug = 'dacon'   AND stage_id = s_painters;
    SELECT id INTO wc_sparkle FROM public.work_centres WHERE slug = 'sparkle' AND stage_id = s_painters;

    -- =========================================================================
    -- JOB 1: Shop front signage — just entered Order Book (3 items)
    -- =========================================================================
    INSERT INTO public.production_jobs
        (org_id, title, client_name, description, current_stage_id, priority, status, assigned_initials, due_date, total_items)
    VALUES
        (v_org_id, 'Shop front signage — full rebrand', '[TEST] Persimmon Homes',
         'New fascia lettering, window graphics, and A-board for rebranded high street unit.',
         s_order_book, 'high', 'active', 'MP', CURRENT_DATE + 5, 3)
    RETURNING id INTO j1;

    INSERT INTO public.job_items (job_id, item_number, description, quantity, current_stage_id, status, stage_routing) VALUES
        (j1, 'A', 'Fascia letters — illuminated channel letters', 1, s_order_book, 'pending',
         ARRAY[s_order_book, s_artwork, s_cut_list, s_metal, s_painters, s_assembly, s_goods_out]),
        (j1, 'B', 'Window graphics — frosted vinyl manifestation', 1, s_order_book, 'pending',
         ARRAY[s_order_book, s_artwork, s_digital, s_vinyl, s_goods_out]),
        (j1, 'C', 'A-board — folding pavement sign', 1, s_order_book, 'pending',
         ARRAY[s_order_book, s_artwork, s_digital, s_assembly, s_goods_out]);

    INSERT INTO public.job_stage_log (job_id, from_stage_id, to_stage_id, moved_by_name, notes)
    VALUES (j1, NULL, s_order_book, 'System', '[TEST] Job created from quote');

    -- =========================================================================
    -- JOB 2: Site hoarding wrap — items at Artwork Approval (urgent)
    -- =========================================================================
    INSERT INTO public.production_jobs
        (org_id, title, client_name, description, current_stage_id, priority, status, assigned_initials, due_date, total_items)
    VALUES
        (v_org_id, 'Site hoarding wrap — phase 2', '[TEST] SKS Construction',
         'Full-colour hoarding panels for construction site frontage. Client to approve artwork before print.',
         s_artwork, 'urgent', 'active', 'KR', CURRENT_DATE + 2, 2)
    RETURNING id INTO j2;

    INSERT INTO public.job_items (job_id, item_number, description, quantity, current_stage_id, status, stage_routing) VALUES
        (j2, 'A', 'Hoarding panels 1–6 (north elevation)', 6, s_artwork, 'in_progress',
         ARRAY[s_order_book, s_artwork, s_digital, s_assembly, s_goods_out]),
        (j2, 'B', 'Hoarding panels 7–12 (east elevation)', 6, s_artwork, 'pending',
         ARRAY[s_order_book, s_artwork, s_digital, s_assembly, s_goods_out]);

    -- Log: moved from Order Book → Artwork
    SELECT id INTO i_id FROM public.job_items WHERE job_id = j2 AND item_number = 'A';
    INSERT INTO public.job_stage_log (job_id, job_item_id, from_stage_id, to_stage_id, moved_by_name, notes)
    VALUES (j2, i_id, s_order_book, s_artwork, 'MP', '[TEST] Artwork drafted, sent to client');
    SELECT id INTO i_id FROM public.job_items WHERE job_id = j2 AND item_number = 'B';
    INSERT INTO public.job_stage_log (job_id, job_item_id, from_stage_id, to_stage_id, moved_by_name, notes)
    VALUES (j2, i_id, s_order_book, s_artwork, 'MP', '[TEST] Artwork drafted, sent to client');

    INSERT INTO public.department_instructions (job_id, stage_id, instruction) VALUES
        (j2, s_artwork, '[TEST] Client contact: Sarah Mellor — sarah@sksconstruction.com. Chase approval if no reply by 9am on due date.'),
        (j2, s_digital, '[TEST] Print at 720dpi on SAV. Laminate with gloss for outdoor durability.');

    -- =========================================================================
    -- JOB 3: Illuminated totem — items in fabrication + painting
    -- =========================================================================
    INSERT INTO public.production_jobs
        (org_id, title, client_name, description, current_stage_id, priority, status, assigned_initials, due_date, total_items)
    VALUES
        (v_org_id, 'Illuminated totem — dual-post', '[TEST] Balfour Beatty',
         'Internal illumination, aluminium cladding, client logo panel. Two posts, 4m height.',
         s_metal, 'high', 'active', 'DS', CURRENT_DATE + 4, 2)
    RETURNING id INTO j3;

    INSERT INTO public.job_items (job_id, item_number, description, quantity, current_stage_id, status, stage_routing, work_centre_id) VALUES
        (j3, 'A', 'Totem frame — welded aluminium 4m', 1, s_metal, 'in_progress',
         ARRAY[s_order_book, s_cut_list, s_metal, s_painters, s_assembly, s_goods_out], NULL),
        (j3, 'B', 'Logo panel — CNC routed acrylic with LED', 1, s_painters, 'in_progress',
         ARRAY[s_order_book, s_artwork, s_cnc, s_painters, s_lighting, s_assembly, s_goods_out], wc_amd);

    -- Log for item A: Order Book → Cut List → Metal Fab
    SELECT id INTO i_id FROM public.job_items WHERE job_id = j3 AND item_number = 'A';
    INSERT INTO public.job_stage_log (job_id, job_item_id, from_stage_id, to_stage_id, moved_by_name, notes) VALUES
        (j3, i_id, s_order_book, s_cut_list, 'TW', '[TEST] Cut list complete'),
        (j3, i_id, s_cut_list, s_metal, 'TW', '[TEST] Cut list passed to metal fab');
    -- Log for item B: Order Book → Artwork → CNC → Painters
    SELECT id INTO i_id FROM public.job_items WHERE job_id = j3 AND item_number = 'B';
    INSERT INTO public.job_stage_log (job_id, job_item_id, from_stage_id, to_stage_id, moved_by_name, notes) VALUES
        (j3, i_id, s_order_book, s_artwork, 'KR', '[TEST] Sent for artwork approval'),
        (j3, i_id, s_artwork, s_cnc, 'KR', '[TEST] Artwork approved — CNC routing'),
        (j3, i_id, s_cnc, s_painters, 'DS', '[TEST] CNC done — to AMD for painting');

    INSERT INTO public.department_instructions (job_id, stage_id, instruction) VALUES
        (j3, s_metal, '[TEST] Use brushed aluminium substrate (not gloss). Double-check logo panel orientation.'),
        (j3, s_painters, '[TEST] RAL 7016 Anthracite Grey. Two coats required. AMD to collect.');

    -- =========================================================================
    -- JOB 4: Wayfinding signage — items spread across departments
    -- =========================================================================
    INSERT INTO public.production_jobs
        (org_id, title, client_name, description, current_stage_id, priority, status, assigned_initials, due_date, total_items)
    VALUES
        (v_org_id, 'Wayfinding signage — level 3', '[TEST] Slick Construction',
         'Directional arrows, room ID plates, and floor numbers for third-floor refurb.',
         s_digital, 'normal', 'active', 'TW', CURRENT_DATE + 7, 3)
    RETURNING id INTO j4;

    INSERT INTO public.job_items (job_id, item_number, description, quantity, current_stage_id, status, stage_routing) VALUES
        (j4, 'A', 'Directional arrow signs — printed aluminium', 8, s_digital, 'in_progress',
         ARRAY[s_order_book, s_artwork, s_digital, s_vinyl, s_goods_out]),
        (j4, 'B', 'Room ID plates — laser engraved acrylic', 15, s_laser, 'in_progress',
         ARRAY[s_order_book, s_artwork, s_laser, s_painters, s_assembly, s_goods_out]),
        (j4, 'C', 'Floor numbers — CNC routed brushed steel', 4, s_cnc, 'in_progress',
         ARRAY[s_order_book, s_artwork, s_cnc, s_painters, s_assembly, s_goods_out]);

    -- Log for item A through to Digital Print
    SELECT id INTO i_id FROM public.job_items WHERE job_id = j4 AND item_number = 'A';
    INSERT INTO public.job_stage_log (job_id, job_item_id, from_stage_id, to_stage_id, moved_by_name, notes) VALUES
        (j4, i_id, s_order_book, s_artwork, 'KR', '[TEST] Artwork sent'),
        (j4, i_id, s_artwork, s_digital, 'KR', '[TEST] Approved — to digital print');

    -- =========================================================================
    -- JOB 5: Van fleet wrap — paused, partially done
    -- =========================================================================
    INSERT INTO public.production_jobs
        (org_id, title, client_name, description, current_stage_id, priority, status, assigned_initials, due_date, total_items)
    VALUES
        (v_org_id, 'Van fleet wrap — 2 vehicles', '[TEST] Onesign & Digital',
         'Full livery on two Ford Transits. Laminate and mount included.',
         s_vinyl, 'normal', 'paused', 'JH', CURRENT_DATE + 9, 2)
    RETURNING id INTO j5;

    INSERT INTO public.job_items (job_id, item_number, description, quantity, current_stage_id, status, stage_routing) VALUES
        (j5, 'A', 'Transit 1 — full vehicle wrap', 1, s_vinyl, 'pending',
         ARRAY[s_order_book, s_artwork, s_digital, s_vinyl, s_goods_out]),
        (j5, 'B', 'Transit 2 — full vehicle wrap', 1, s_digital, 'in_progress',
         ARRAY[s_order_book, s_artwork, s_digital, s_vinyl, s_goods_out]);

    -- =========================================================================
    -- JOB 6: Reception wall graphics — nearly done, items in Assembly
    -- =========================================================================
    INSERT INTO public.production_jobs
        (org_id, title, client_name, description, current_stage_id, priority, status, assigned_initials, due_date, total_items)
    VALUES
        (v_org_id, 'Reception wall graphics — HQ', '[TEST] Persimmon Homes',
         'Frosted vinyl manifestation and branded feature wall. Check alignment before dispatch.',
         s_assembly, 'normal', 'active', 'MP', CURRENT_DATE + 11, 3)
    RETURNING id INTO j6;

    INSERT INTO public.job_items (job_id, item_number, description, quantity, current_stage_id, status, stage_routing, work_centre_id) VALUES
        (j6, 'A', 'Frosted window manifestation', 1, s_assembly, 'in_progress',
         ARRAY[s_order_book, s_vinyl, s_assembly, s_goods_out], NULL),
        (j6, 'B', 'Branded feature wall — printed panel', 1, s_assembly, 'in_progress',
         ARRAY[s_order_book, s_artwork, s_digital, s_assembly, s_goods_out], NULL),
        (j6, 'C', 'Logo plaque — CNC aluminium, painted', 1, s_assembly, 'pending',
         ARRAY[s_order_book, s_cnc, s_painters, s_assembly, s_goods_out], NULL);

    -- =========================================================================
    -- JOB 7: Plot numbers — OVERDUE, at Goods Out
    -- =========================================================================
    INSERT INTO public.production_jobs
        (org_id, title, client_name, description, current_stage_id, priority, status, assigned_initials, due_date, total_items)
    VALUES
        (v_org_id, 'Plot numbers — Phase 1 handover', '[TEST] Bellway Homes',
         'Set of 47 plot number plaques, bagged and labelled per plot. Delivery to site required.',
         s_goods_out, 'urgent', 'active', 'KR', CURRENT_DATE - 1, 2)
    RETURNING id INTO j7;

    INSERT INTO public.job_items (job_id, item_number, description, quantity, current_stage_id, status, stage_routing) VALUES
        (j7, 'A', 'Plot plaques 1–24 (Phase 1A)', 24, s_goods_out, 'completed',
         ARRAY[s_order_book, s_laser, s_painters, s_goods_out]),
        (j7, 'B', 'Plot plaques 25–47 (Phase 1B)', 23, s_goods_out, 'in_progress',
         ARRAY[s_order_book, s_laser, s_painters, s_goods_out]);

    -- Log: full journey for item A
    SELECT id INTO i_id FROM public.job_items WHERE job_id = j7 AND item_number = 'A';
    INSERT INTO public.job_stage_log (job_id, job_item_id, from_stage_id, to_stage_id, moved_by_name, notes) VALUES
        (j7, i_id, s_order_book, s_laser, 'TW', '[TEST] To laser engraving'),
        (j7, i_id, s_laser, s_painters, 'TW', '[TEST] Laser done — Dacon for painting'),
        (j7, i_id, s_painters, s_goods_out, 'DS', '[TEST] Painting complete — goods out');

    RAISE NOTICE '[TEST] Seed complete — 7 jobs, 18 items across 13 departments. Remove with: DELETE FROM production_jobs WHERE client_name LIKE ''[TEST]%%''';
END $$;
