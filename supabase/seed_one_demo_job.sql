-- =============================================================================
-- DEMO SEED: One complete end-to-end job through the new flow
-- =============================================================================
-- Creates a single fully-wired demo covering:
--   client (org) + primary contact + delivery site
--   -> quote (accepted) with 3 line items:
--        1. generic production item with sub-items (fascia panel + letters)
--        2. generic production item with only line-level dims (window vinyl)
--        3. service line (fitting)
--   -> production_job + job_items (each prod line becomes one job item)
--   -> artwork_job + artwork_components + artwork_component_items (skeleton
--      populated from the quote spec, just like generateArtworkFromQuote does)
--   -> delivery (scheduled)
--
-- Everything is prefixed with [DEMO] and the org name is "[DEMO] Test-O's"
-- so it's easy to find and remove.
--
-- Run AFTER migrations 001-041 in the Supabase SQL Editor.
-- Requires at least one active pricing_set to exist.
--
-- TO REMOVE ALL DEMO DATA:
--   DELETE FROM public.orgs WHERE name LIKE '[DEMO]%';
--   (Cascades to contacts, sites, quotes, quote_items, production_jobs,
--    job_items, artwork_jobs, artwork_components, artwork_component_items,
--    deliveries via the existing FKs.)
-- =============================================================================

BEGIN;

DO $$
DECLARE
    v_org_id          UUID;
    v_contact_id      UUID;
    v_site_id         UUID;
    v_pricing_set_id  UUID;

    v_quote_id        UUID;
    v_qi_fascia_id    UUID;
    v_qi_vinyl_id     UUID;
    v_qi_fitting_id   UUID;

    v_prod_job_id     UUID;
    v_ji_fascia_id    UUID;
    v_ji_vinyl_id     UUID;

    v_art_job_fascia_id  UUID;
    v_art_job_vinyl_id   UUID;
    v_comp_fascia_id     UUID;
    v_comp_vinyl_id      UUID;

    -- Stage lookups
    s_order_book UUID;
    s_artwork    UUID;
    s_digital    UUID;
    s_vinyl      UUID;
    s_cnc        UUID;
    s_painters   UUID;
    s_assembly   UUID;
    s_goods_out  UUID;
BEGIN
    -- Preconditions
    SELECT id INTO v_pricing_set_id
    FROM public.pricing_sets
    WHERE status = 'active'
    ORDER BY created_at DESC
    LIMIT 1;
    IF v_pricing_set_id IS NULL THEN
        RAISE EXCEPTION '[DEMO] No active pricing_set found — seed quoter data first';
    END IF;

    SELECT id INTO s_order_book FROM public.production_stages WHERE slug = 'order-book'          AND is_default = TRUE;
    SELECT id INTO s_artwork    FROM public.production_stages WHERE slug = 'artwork-approval'     AND is_default = TRUE;
    SELECT id INTO s_digital    FROM public.production_stages WHERE slug = 'digital-print'        AND is_default = TRUE;
    SELECT id INTO s_vinyl      FROM public.production_stages WHERE slug = 'vinyl'                AND is_default = TRUE;
    SELECT id INTO s_cnc        FROM public.production_stages WHERE slug = 'cnc-routing'          AND is_default = TRUE;
    SELECT id INTO s_painters   FROM public.production_stages WHERE slug = 'painters'             AND is_default = TRUE;
    SELECT id INTO s_assembly   FROM public.production_stages WHERE slug = 'assembly'             AND is_default = TRUE;
    SELECT id INTO s_goods_out  FROM public.production_stages WHERE slug = 'goods-out'            AND is_default = TRUE;
    IF s_order_book IS NULL THEN
        RAISE EXCEPTION '[DEMO] production_stages not seeded — run migration 028 first';
    END IF;

    -- =========================================================================
    -- 1. Client (org) + contact + site
    -- =========================================================================
    -- slug must be unique — append a short random suffix so repeat runs
    -- never collide even if the previous [DEMO] org is still present.
    INSERT INTO public.orgs (name, slug, phone, email, business_type, notes, tags)
    VALUES (
        '[DEMO] Test-O''s',
        'demo-test-os-' || substr(md5(random()::text), 1, 8),
        '0191 000 0000',
        'hello@test-os-demo.test',
        'Signage demo client',
        'Demo client — full end-to-end seed for visualising the flow.',
        ARRAY['demo']
    )
    RETURNING id INTO v_org_id;

    INSERT INTO public.contacts
        (org_id, first_name, last_name, email, phone, job_title, contact_type, is_primary)
    VALUES
        (v_org_id, 'Terry', 'Osborne', 'terry@test-os-demo.test',
         '07700 900000', 'Owner', 'primary', TRUE)
    RETURNING id INTO v_contact_id;

    INSERT INTO public.org_sites
        (org_id, name, address_line_1, address_line_2, city, county, postcode,
         site_contact_id, is_primary, is_billing_address, is_delivery_address)
    VALUES
        (v_org_id, 'Test-O''s HQ', '14 High Street', NULL,
         'Gateshead', 'Tyne and Wear', 'NE8 1AA',
         v_contact_id, TRUE, TRUE, TRUE)
    RETURNING id INTO v_site_id;

    -- =========================================================================
    -- 2. Accepted quote with three line items
    -- =========================================================================
    INSERT INTO public.quotes
        (customer_name, customer_email, customer_phone, status, pricing_set_id,
         org_id, contact_id, site_id, project_name, customer_reference,
         notes_internal, notes_client)
    VALUES
        ('Test-O''s',
         'terry@test-os-demo.test', '07700 900000',
         'accepted', v_pricing_set_id,
         v_org_id, v_contact_id, v_site_id,
         '[DEMO] Shop front signage',
         'TST-2026-01',
         '[DEMO] seed — exercises generic items, sub-items, services, and artwork skeleton.',
         'Hi Terry, here''s the quote for your shop fascia and window graphics.')
    RETURNING id INTO v_quote_id;

    -- 2a. Fascia panel with sub-items (panel + vinyl letters on it)
    INSERT INTO public.quote_items (
        quote_id, item_type, input_json, output_json, line_total_pence,
        part_label, description, component_type, is_production_work,
        unit_cost_pence, quantity, markup_percent, discount_percent,
        lighting, spec_notes
    ) VALUES (
        v_quote_id, 'generic',
        jsonb_build_object(
            'width_mm', 2400,
            'height_mm', 400,
            'returns_mm', 50,
            'lighting', 'internal led, halo',
            'spec_notes', 'Signed off by Terry via email 12 Apr.',
            'sub_items', jsonb_build_array(
                jsonb_build_object(
                    'name', 'Fascia substrate',
                    'material', 'Aluminium composite (3mm)',
                    'application_method', 'routed + folded returns',
                    'finish', 'RAL 9010 pure white, satin',
                    'quantity', 1,
                    'width_mm', 2400,
                    'height_mm', 400,
                    'returns_mm', 50
                ),
                jsonb_build_object(
                    'name', 'TEST-O''S letters',
                    'material', 'Oracal 651 gold vinyl',
                    'application_method', 'weeded, stuck to face',
                    'finish', 'gloss gold',
                    'quantity', 7,
                    'width_mm', 180,
                    'height_mm', 220
                )
            )
        ),
        '{}'::jsonb,
        120000, -- £1,200.00
        'Front fascia panel (TEST-O''S)',
        'Main shop fascia — aluminium composite panel with applied vinyl letters, halo lit.',
        'panel', TRUE,
        60000, 1, 15.00, 0.00,
        'internal led, halo',
        'Signed off by Terry via email 12 Apr.'
    )
    RETURNING id INTO v_qi_fascia_id;

    -- 2b. Window vinyl — just line-level dims, no sub-items
    INSERT INTO public.quote_items (
        quote_id, item_type, input_json, output_json, line_total_pence,
        part_label, description, component_type, is_production_work,
        unit_cost_pence, quantity, markup_percent, discount_percent,
        lighting, spec_notes
    ) VALUES (
        v_quote_id, 'generic',
        jsonb_build_object(
            'width_mm', 3200,
            'height_mm', 1800,
            'returns_mm', null,
            'lighting', null,
            'spec_notes', 'Privacy band 1000mm up from floor, 400mm tall.',
            'sub_items', jsonb_build_array()
        ),
        '{}'::jsonb,
        34500, -- £345.00
        'Window manifestation (frosted)',
        'Full-height shop window frosted vinyl with privacy band at eye level.',
        'vinyl', TRUE,
        15000, 1, 15.00, 0.00,
        NULL,
        'Privacy band 1000mm up from floor, 400mm tall.'
    )
    RETURNING id INTO v_qi_vinyl_id;

    -- 2c. Service line — fitting
    INSERT INTO public.quote_items (
        quote_id, item_type, input_json, output_json, line_total_pence,
        part_label, description, component_type, is_production_work,
        unit_cost_pence, quantity, markup_percent, discount_percent,
        lighting, spec_notes
    ) VALUES (
        v_quote_id, 'service',
        jsonb_build_object('sub_items', jsonb_build_array()),
        '{}'::jsonb,
        28000, -- £280.00
        'Fitting',
        'On-site install of fascia + window graphics. Two-person team, half-day.',
        NULL, FALSE,
        14000, 1, 0.00, 0.00,
        NULL, NULL
    )
    RETURNING id INTO v_qi_fitting_id;

    -- =========================================================================
    -- 3. Production job (one job, one job_item per production line item)
    -- =========================================================================
    INSERT INTO public.production_jobs (
        org_id, quote_id, title, client_name, description,
        current_stage_id, priority, status, assigned_initials, due_date,
        total_items, contact_id, site_id
    ) VALUES (
        v_org_id, v_quote_id,
        '[DEMO] Test-O''s — shop front signage',
        '[DEMO] Test-O''s',
        'Demo production job — fascia + window vinyl. Fitting booked separately.',
        s_artwork, 'normal', 'active', 'KR', CURRENT_DATE + 7,
        2, v_contact_id, v_site_id
    )
    RETURNING id INTO v_prod_job_id;

    -- stage_routing mirrors what completeArtworkAndAdvanceItem would build
    -- from the sub-items' target_stage_ids: [order-book, artwork-approval,
    -- ...departments in sort order..., goods-out]. Without this array the
    -- shop-floor "advance" call finds current_stage outside the routing
    -- and short-circuits the item to "completed" (so it disappears).
    INSERT INTO public.job_items
        (job_id, quote_item_id, description, quantity, current_stage_id, status,
         stage_routing)
    VALUES
        (v_prod_job_id, v_qi_fascia_id,
         'Front fascia panel (TEST-O''S)', 1,
         s_artwork, 'in_progress',
         ARRAY[s_order_book, s_artwork, s_cnc, s_vinyl, s_painters, s_assembly, s_goods_out])
    RETURNING id INTO v_ji_fascia_id;

    INSERT INTO public.job_items
        (job_id, quote_item_id, description, quantity, current_stage_id, status,
         stage_routing)
    VALUES
        (v_prod_job_id, v_qi_vinyl_id,
         'Window manifestation (frosted)', 1,
         s_artwork, 'in_progress',
         ARRAY[s_order_book, s_artwork, s_vinyl, s_goods_out])
    RETURNING id INTO v_ji_vinyl_id;

    INSERT INTO public.job_stage_log
        (job_id, from_stage_id, to_stage_id, moved_by_name, notes)
    VALUES
        (v_prod_job_id, NULL, s_artwork, 'System',
         '[DEMO] Quote accepted — production + artwork jobs generated');

    -- =========================================================================
    -- 4. Artwork jobs (one per production-work line item, matching
    --    generateArtworkFromQuote). job_reference is UNIQUE so we build a
    --    demo-timestamped value.
    -- =========================================================================
    INSERT INTO public.artwork_jobs (
        job_name, job_reference, client_name, description, status,
        job_item_id, org_id, contact_id, site_id, is_orphan, created_by
    ) VALUES (
        'Front fascia panel (TEST-O''S)',
        'AWC-DEMO-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-F',
        NULL,
        'Main shop fascia — aluminium composite panel with applied vinyl letters, halo lit.',
        'draft',
        v_ji_fascia_id, v_org_id, v_contact_id, v_site_id, FALSE,
        NULL
    )
    RETURNING id INTO v_art_job_fascia_id;

    INSERT INTO public.artwork_jobs (
        job_name, job_reference, client_name, description, status,
        job_item_id, org_id, contact_id, site_id, is_orphan, created_by
    ) VALUES (
        'Window manifestation (frosted)',
        'AWC-DEMO-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-V',
        NULL,
        'Full-height shop window frosted vinyl with privacy band at eye level.',
        'draft',
        v_ji_vinyl_id, v_org_id, v_contact_id, v_site_id, FALSE,
        NULL
    )
    RETURNING id INTO v_art_job_vinyl_id;

    -- 4a. Fascia artwork component + sub-items copied from quote spec
    -- Component-level target_stage_id + design_signed_off_at are also set
    -- because the ReleaseToProductionButton's client-side gate reads the
    -- component row directly (not just sub-items). The true per-sub-item
    -- routing still lives on artwork_component_items below.
    INSERT INTO public.artwork_components (
        job_id, name, component_type, sort_order, status,
        lighting, notes,
        target_stage_id, design_signed_off_at,
        scale_confirmed, bleed_included, material_confirmed, rip_no_scaling_confirmed
    ) VALUES (
        v_art_job_fascia_id,
        'Front fascia panel (TEST-O''S)',
        'panel', 0, 'design_signed_off',
        'halo', -- artwork_components.lighting is constrained to backlit|halo|edge_lit
        'Signed off by Terry via email 12 Apr. Halo lit (internal LED).',
        s_cnc, now(),
        TRUE, TRUE, TRUE, TRUE
    )
    RETURNING id INTO v_comp_fascia_id;

    -- Sub-items are signed off + routed so the job is release-ready. This
    -- lets the demo exercise the "Release to Production" button end-to-end
    -- without first having to manually sign off each sub-item.
    INSERT INTO public.artwork_component_items
        (component_id, label, sort_order,
         name, material, application_method, finish, quantity,
         width_mm, height_mm, returns_mm,
         target_stage_id,
         design_signed_off_at, production_signed_off_at,
         material_confirmed, rip_no_scaling_confirmed)
    VALUES
        (v_comp_fascia_id, 'A', 0,
         'Fascia substrate', 'Aluminium composite (3mm)',
         'routed + folded returns', 'RAL 9010 pure white, satin',
         1, 2400, 400, 50,
         s_cnc, -- panel routes to CNC first, then painters + assembly
         now(), now(), TRUE, TRUE),
        (v_comp_fascia_id, 'B', 1,
         'TEST-O''S letters', 'Oracal 651 gold vinyl',
         'weeded, stuck to face', 'gloss gold',
         7, 180, 220, NULL,
         s_vinyl, -- letters go straight to vinyl dept
         now(), now(), TRUE, TRUE);

    -- 4b. Vinyl artwork component — no sub-items in quote, so seed one from line-level dims
    INSERT INTO public.artwork_components (
        job_id, name, component_type, sort_order, status,
        notes,
        target_stage_id, design_signed_off_at,
        scale_confirmed, bleed_included, material_confirmed, rip_no_scaling_confirmed
    ) VALUES (
        v_art_job_vinyl_id,
        'Window manifestation (frosted)',
        'vinyl', 0, 'design_signed_off',
        'Privacy band 1000mm up from floor, 400mm tall.',
        s_vinyl, now(),
        TRUE, TRUE, TRUE, TRUE
    )
    RETURNING id INTO v_comp_vinyl_id;

    INSERT INTO public.artwork_component_items
        (component_id, label, sort_order,
         name, quantity, width_mm, height_mm, returns_mm,
         target_stage_id,
         design_signed_off_at, production_signed_off_at,
         material_confirmed, rip_no_scaling_confirmed)
    VALUES
        (v_comp_vinyl_id, 'A', 0,
         'Window manifestation (frosted)',
         1, 3200, 1800, NULL,
         s_vinyl,
         now(), now(), TRUE, TRUE);

    -- =========================================================================
    -- 5. Delivery (scheduled) — so the Deliveries board shows a demo row
    -- =========================================================================
    INSERT INTO public.deliveries (
        org_id, production_job_id, site_id, contact_id,
        status, scheduled_date, driver_name, notes_internal
    ) VALUES (
        v_org_id, v_prod_job_id, v_site_id, v_contact_id,
        'scheduled', CURRENT_DATE + 7,
        NULL,
        '[DEMO] Install booked with fitter for a half-day.'
    );

    RAISE NOTICE '[DEMO] Seed complete — Test-O''s: 1 client, 1 quote (accepted), 1 production job (2 items), 2 artwork jobs (3 sub-items), 1 delivery. Remove with: DELETE FROM orgs WHERE name LIKE ''[DEMO]%%''';
END $$;

COMMIT;
