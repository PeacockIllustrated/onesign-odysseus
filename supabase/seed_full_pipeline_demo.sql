-- =============================================================================
-- FULL PIPELINE DEMO SEED
-- =============================================================================
-- Exercises EVERY feature built across the session:
--   1. Client (org) + 2 contacts + 2 geocoded sites
--   2. Quote (accepted) with generic + service items
--   3. Production job + job items with stage_routing
--   4. Visual approval job with 2 variant options per component
--   5. Production artwork job (as if spawned from visual)
--   6. Delivery (scheduled) with driver assigned
--   7. 2 drivers with home postcodes
--   8. Maintenance visit (survey scheduled)
--   9. Approval record (approved, with client comments)
--
-- Prefixed [PIPELINE] so it doesn't collide with existing [DEMO] data.
-- Run AFTER migrations 001-050 + NEXT_PUBLIC_MAPBOX_TOKEN configured.
--
-- TO REMOVE:
--   DELETE FROM public.maintenance_visits
--    WHERE org_id IN (SELECT id FROM public.orgs WHERE name LIKE '[PIPELINE]%');
--   DELETE FROM public.deliveries
--    WHERE org_id IN (SELECT id FROM public.orgs WHERE name LIKE '[PIPELINE]%');
--   DELETE FROM public.artwork_jobs
--    WHERE org_id IN (SELECT id FROM public.orgs WHERE name LIKE '[PIPELINE]%');
--   DELETE FROM public.production_jobs
--    WHERE org_id IN (SELECT id FROM public.orgs WHERE name LIKE '[PIPELINE]%');
--   DELETE FROM public.quotes
--    WHERE org_id IN (SELECT id FROM public.orgs WHERE name LIKE '[PIPELINE]%');
--   DELETE FROM public.drivers WHERE name LIKE '[PIPELINE]%';
--   DELETE FROM public.orgs WHERE name LIKE '[PIPELINE]%';
-- =============================================================================

BEGIN;

DO $body$
DECLARE
    v_org_id          UUID;
    v_contact_main    UUID;
    v_contact_site    UUID;
    v_site_hq         UUID;
    v_site_branch     UUID;
    v_pricing_set_id  UUID;

    v_quote_id        UUID;
    v_qi_fascia       UUID;
    v_qi_window       UUID;
    v_qi_fitting      UUID;

    v_prod_job_id     UUID;
    v_ji_fascia       UUID;
    v_ji_window       UUID;

    v_visual_job_id   UUID;
    v_visual_comp_id  UUID;

    v_prod_art_job_id UUID;
    v_prod_comp_id    UUID;

    v_delivery_id     UUID;
    v_driver1_id      UUID;
    v_driver2_id      UUID;

    -- Stage IDs
    s_order_book UUID;
    s_artwork    UUID;
    s_cnc        UUID;
    s_vinyl      UUID;
    s_painters   UUID;
    s_assembly   UUID;
    s_goods_out  UUID;
BEGIN
    -- Preconditions
    SELECT id INTO v_pricing_set_id
    FROM public.pricing_sets WHERE status = 'active'
    ORDER BY created_at DESC LIMIT 1;
    IF v_pricing_set_id IS NULL THEN
        RAISE EXCEPTION '[PIPELINE] No active pricing_set — seed quoter data first';
    END IF;

    SELECT id INTO s_order_book FROM public.production_stages WHERE slug = 'order-book' AND is_default = TRUE;
    SELECT id INTO s_artwork FROM public.production_stages WHERE slug = 'artwork-approval' AND is_default = TRUE;
    SELECT id INTO s_cnc FROM public.production_stages WHERE slug = 'cnc-routing' AND is_default = TRUE;
    SELECT id INTO s_vinyl FROM public.production_stages WHERE slug = 'vinyl' AND is_default = TRUE;
    SELECT id INTO s_painters FROM public.production_stages WHERE slug = 'painters' AND is_default = TRUE;
    SELECT id INTO s_assembly FROM public.production_stages WHERE slug = 'assembly' AND is_default = TRUE;
    SELECT id INTO s_goods_out FROM public.production_stages WHERE slug = 'goods-out' AND is_default = TRUE;
    IF s_order_book IS NULL THEN
        RAISE EXCEPTION '[PIPELINE] production_stages not seeded — run migration 028';
    END IF;

    -- =========================================================================
    -- 1. Client + contacts + geocoded sites
    -- =========================================================================
    INSERT INTO public.orgs (name, slug, phone, email, business_type, notes, tags)
    VALUES (
        '[PIPELINE] Northside Barbers',
        'pipeline-northside-' || substr(md5(random()::text), 1, 8),
        '0191 555 0101',
        'info@northside-barbers.test',
        'Barber shop',
        'Full pipeline demo — exercises every feature.',
        ARRAY['demo', 'pipeline']
    )
    RETURNING id INTO v_org_id;

    INSERT INTO public.contacts (org_id, first_name, last_name, email, phone, job_title, contact_type, is_primary)
    VALUES (v_org_id, 'Jake', 'Northside', 'jake@northside-barbers.test', '07700 111111', 'Owner', 'primary', TRUE)
    RETURNING id INTO v_contact_main;

    INSERT INTO public.contacts (org_id, first_name, last_name, email, phone, job_title, contact_type, is_primary)
    VALUES (v_org_id, 'Sam', 'Northside', 'sam@northside-barbers.test', '07700 222222', 'Manager', 'site', FALSE)
    RETURNING id INTO v_contact_site;

    -- HQ site — central Newcastle (geocoded coords for NE1 5DW)
    INSERT INTO public.org_sites
        (org_id, name, address_line_1, city, county, postcode,
         site_contact_id, is_primary, is_billing_address, is_delivery_address,
         latitude, longitude)
    VALUES
        (v_org_id, 'Northside HQ', '42 Grainger Street', 'Newcastle upon Tyne',
         'Tyne and Wear', 'NE1 5DW', v_contact_main, TRUE, TRUE, TRUE,
         54.9714, -1.6174)
    RETURNING id INTO v_site_hq;

    -- Branch site — Jesmond (geocoded coords for NE2 1DB)
    INSERT INTO public.org_sites
        (org_id, name, address_line_1, city, county, postcode,
         site_contact_id, is_primary, is_billing_address, is_delivery_address,
         latitude, longitude)
    VALUES
        (v_org_id, 'Northside Jesmond', '15 Acorn Road', 'Newcastle upon Tyne',
         'Tyne and Wear', 'NE2 1DB', v_contact_site, FALSE, FALSE, TRUE,
         54.9808, -1.6048)
    RETURNING id INTO v_site_branch;

    -- =========================================================================
    -- 2. Accepted quote with 3 line items
    -- =========================================================================
    INSERT INTO public.quotes
        (customer_name, customer_email, customer_phone, status, pricing_set_id,
         org_id, contact_id, site_id, project_name, customer_reference,
         notes_internal, notes_client)
    VALUES
        ('Northside Barbers', 'jake@northside-barbers.test', '07700 111111',
         'accepted', v_pricing_set_id,
         v_org_id, v_contact_main, v_site_hq,
         '[PIPELINE] Shop front rebrand',
         'NSB-2026-01',
         '[PIPELINE] full demo — fascia + window + fitting.',
         'Hi Jake, here''s the quote for your shop front rebrand.')
    RETURNING id INTO v_quote_id;

    -- Fascia panel with sub-items
    INSERT INTO public.quote_items (
        quote_id, item_type, input_json, output_json, line_total_pence,
        part_label, description, component_type, is_production_work,
        unit_cost_pence, quantity, markup_percent, discount_percent,
        lighting, spec_notes
    ) VALUES (
        v_quote_id, 'generic',
        jsonb_build_object(
            'width_mm', 3000, 'height_mm', 500, 'returns_mm', 60,
            'lighting', 'halo',
            'spec_notes', 'Gold vinyl letters on black ACM.',
            'sub_items', jsonb_build_array(
                jsonb_build_object(
                    'name', 'Fascia substrate', 'material', 'ACM 3mm black',
                    'application_method', 'routed + folded returns',
                    'finish', 'Matt black', 'quantity', 1,
                    'width_mm', 3000, 'height_mm', 500, 'returns_mm', 60
                ),
                jsonb_build_object(
                    'name', 'NORTHSIDE letters', 'material', 'Oracal 651 gold',
                    'application_method', 'weeded, stuck to face',
                    'finish', 'Gloss gold', 'quantity', 9,
                    'width_mm', 200, 'height_mm', 250
                )
            )
        ),
        '{}'::jsonb, 180000,
        'Front fascia panel (NORTHSIDE)',
        'Black ACM panel with gold vinyl letters, halo illuminated.',
        'panel', TRUE, 80000, 1, 15.00, 0.00, 'halo',
        'Gold vinyl letters on black ACM.'
    )
    RETURNING id INTO v_qi_fascia;

    -- Window vinyl
    INSERT INTO public.quote_items (
        quote_id, item_type, input_json, output_json, line_total_pence,
        part_label, description, component_type, is_production_work,
        unit_cost_pence, quantity, markup_percent, discount_percent
    ) VALUES (
        v_quote_id, 'generic',
        jsonb_build_object(
            'width_mm', 2400, 'height_mm', 1600,
            'sub_items', jsonb_build_array()
        ),
        '{}'::jsonb, 28000,
        'Window manifestation',
        'Frosted vinyl privacy band with cut logo.',
        'vinyl', TRUE, 12000, 1, 15.00, 0.00
    )
    RETURNING id INTO v_qi_window;

    -- Service: fitting
    INSERT INTO public.quote_items (
        quote_id, item_type, input_json, output_json, line_total_pence,
        part_label, description, component_type, is_production_work,
        unit_cost_pence, quantity
    ) VALUES (
        v_quote_id, 'service',
        jsonb_build_object('sub_items', jsonb_build_array()),
        '{}'::jsonb, 35000,
        'Fitting', 'On-site install — two fitters, full day.',
        NULL, FALSE, 17500, 1
    )
    RETURNING id INTO v_qi_fitting;

    -- =========================================================================
    -- 3. Production job + job items with routing
    -- =========================================================================
    INSERT INTO public.production_jobs (
        org_id, quote_id, title, client_name, description,
        current_stage_id, priority, status, assigned_initials, due_date,
        total_items, contact_id, site_id
    ) VALUES (
        v_org_id, v_quote_id,
        '[PIPELINE] Northside Barbers — shop front',
        '[PIPELINE] Northside Barbers',
        'Fascia + window vinyl. Fitting booked separately.',
        s_artwork, 'normal', 'active', 'KR', CURRENT_DATE + 10,
        2, v_contact_main, v_site_hq
    )
    RETURNING id INTO v_prod_job_id;

    INSERT INTO public.job_items
        (job_id, quote_item_id, description, quantity, current_stage_id, status, stage_routing)
    VALUES
        (v_prod_job_id, v_qi_fascia,
         'Front fascia panel (NORTHSIDE)', 1, s_artwork, 'in_progress',
         ARRAY[s_order_book, s_artwork, s_cnc, s_vinyl, s_painters, s_assembly, s_goods_out])
    RETURNING id INTO v_ji_fascia;

    INSERT INTO public.job_items
        (job_id, quote_item_id, description, quantity, current_stage_id, status, stage_routing)
    VALUES
        (v_prod_job_id, v_qi_window,
         'Window manifestation', 1, s_artwork, 'in_progress',
         ARRAY[s_order_book, s_artwork, s_vinyl, s_goods_out])
    RETURNING id INTO v_ji_window;

    -- =========================================================================
    -- 4. Visual approval job with 2 variants (pre-production concepts)
    -- =========================================================================
    INSERT INTO public.artwork_jobs (
        job_name, job_reference, description, status, job_type,
        org_id, contact_id, site_id, quote_id, is_orphan, created_by
    ) VALUES (
        'Northside fascia concepts',
        'AWC-PIPE-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-V',
        'Two concept options for the fascia — gold or silver lettering.',
        'completed', 'visual_approval',
        v_org_id, v_contact_main, v_site_hq, v_quote_id, FALSE, NULL
    )
    RETURNING id INTO v_visual_job_id;

    INSERT INTO public.artwork_components (
        job_id, name, component_type, sort_order, status,
        lighting, notes,
        scale_confirmed, bleed_included, material_confirmed, rip_no_scaling_confirmed
    ) VALUES (
        v_visual_job_id, 'Front fascia panel', 'panel', 0, 'design_signed_off',
        'halo', 'Client chose gold option.',
        FALSE, FALSE, FALSE, FALSE
    )
    RETURNING id INTO v_visual_comp_id;

    -- Variant A: Gold (chosen)
    INSERT INTO public.artwork_variants (
        component_id, label, sort_order, name, description,
        material, finish, width_mm, height_mm,
        is_chosen, chosen_at
    ) VALUES (
        v_visual_comp_id, 'A', 0, 'Gold foil letters',
        'Classic gold vinyl on matt black — premium barber look.',
        'Oracal 651 gold', 'Gloss gold', 3000, 500,
        TRUE, now()
    );

    -- Variant B: Silver (not chosen)
    INSERT INTO public.artwork_variants (
        component_id, label, sort_order, name, description,
        material, finish, width_mm, height_mm,
        is_chosen
    ) VALUES (
        v_visual_comp_id, 'B', 1, 'Silver chrome letters',
        'Chrome vinyl on matt black — modern minimalist.',
        'Oracal 352 silver chrome', 'Gloss chrome', 3000, 500,
        FALSE
    );

    -- =========================================================================
    -- 5. Production artwork job (as if spawned from the visual)
    -- =========================================================================
    INSERT INTO public.artwork_jobs (
        job_name, job_reference, description, status, job_type,
        parent_visual_job_id, job_item_id,
        org_id, contact_id, site_id, quote_id, is_orphan, created_by
    ) VALUES (
        'Front fascia panel (NORTHSIDE)',
        'AWC-PIPE-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-P',
        'Production artwork — gold option approved by Jake.',
        'draft', 'production',
        v_visual_job_id, v_ji_fascia,
        v_org_id, v_contact_main, v_site_hq, v_quote_id, FALSE, NULL
    )
    RETURNING id INTO v_prod_art_job_id;

    INSERT INTO public.artwork_components (
        job_id, name, component_type, sort_order, status,
        lighting, notes,
        target_stage_id, design_signed_off_at,
        scale_confirmed, bleed_included, material_confirmed, rip_no_scaling_confirmed
    ) VALUES (
        v_prod_art_job_id, 'Front fascia panel (NORTHSIDE)', 'panel', 0,
        'pending_design', 'halo',
        'Gold option from visual approval. Client chose variant A.',
        s_cnc, NULL,
        FALSE, FALSE, FALSE, FALSE
    )
    RETURNING id INTO v_prod_comp_id;

    -- Sub-item seeded from chosen variant
    INSERT INTO public.artwork_component_items (
        component_id, label, sort_order,
        name, material, application_method, finish, quantity,
        width_mm, height_mm, returns_mm
    ) VALUES (
        v_prod_comp_id, 'A', 0,
        'Gold foil letters', 'Oracal 651 gold',
        'weeded, stuck to face', 'Gloss gold',
        9, 200, 250, NULL
    );

    -- =========================================================================
    -- 6. Drivers
    -- =========================================================================
    INSERT INTO public.drivers (name, phone, home_postcode, home_lat, home_lng, vehicle_type)
    VALUES ('Dave [PIPELINE]', '07700 333333', 'DH1 3EL', 54.7753, -1.5849, 'van')
    RETURNING id INTO v_driver1_id;

    INSERT INTO public.drivers (name, phone, home_postcode, home_lat, home_lng, vehicle_type)
    VALUES ('Keith [PIPELINE]', '07700 444444', 'NE1 7RU', 54.9690, -1.6115, 'van')
    RETURNING id INTO v_driver2_id;

    -- =========================================================================
    -- 7. Delivery (scheduled, assigned to Dave, with items + POD token)
    -- =========================================================================
    INSERT INTO public.deliveries (
        org_id, production_job_id, site_id, contact_id,
        status, scheduled_date, driver_name, driver_id,
        notes_internal, pod_token, pod_status
    ) VALUES (
        v_org_id, v_prod_job_id, v_site_hq, v_contact_main,
        'scheduled', CURRENT_DATE + 10,
        'Dave [PIPELINE]', v_driver1_id,
        '[PIPELINE] Install booked for a full day. Two fitters.',
        'pipeline-pod-' || encode(gen_random_bytes(16), 'hex'),
        'pending'
    )
    RETURNING id INTO v_delivery_id;

    INSERT INTO public.delivery_items (delivery_id, job_item_id, description, quantity, sort_order)
    VALUES
        (v_delivery_id, v_ji_fascia, 'Front fascia panel (NORTHSIDE)', 1, 0),
        (v_delivery_id, v_ji_window, 'Window manifestation', 1, 1);

    -- =========================================================================
    -- 8. Maintenance visit (survey at the branch site)
    -- =========================================================================
    INSERT INTO public.maintenance_visits (
        org_id, site_id, contact_id,
        visit_type, status, scheduled_date, notes
    ) VALUES (
        v_org_id, v_site_branch, v_contact_site,
        'survey', 'scheduled', CURRENT_DATE + 5,
        '[PIPELINE] Survey the Jesmond branch for a potential second rebrand.'
    );

    -- =========================================================================
    -- 9. Approval record (client approved the visual, with comments)
    -- =========================================================================
    INSERT INTO public.artwork_approvals (
        job_id, token, status, expires_at,
        client_name, client_email, client_company,
        signature_data, client_comments, approved_at
    ) VALUES (
        v_visual_job_id,
        'pipeline-approval-' || encode(gen_random_bytes(16), 'hex'),
        'approved',
        now() + interval '7 days',
        'Jake Northside', 'jake@northside-barbers.test', 'Northside Barbers',
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'Love the gold option — go with that. Can we make the letters slightly larger though? Maybe 220mm height instead of 200.',
        now()
    );

    RAISE NOTICE '[PIPELINE] Seed complete — Northside Barbers: 1 client, 2 sites (geocoded), 2 contacts, 1 quote, 1 production job, 1 visual approval (approved w/ 2 variants), 1 production artwork, 2 drivers, 1 delivery (assigned to Dave), 1 maintenance survey, 1 approval with comments.';
END $body$;

COMMIT;
