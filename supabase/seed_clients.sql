-- =============================================================================
-- TEST SEED: Clients, contacts & sites
-- =============================================================================
-- Purpose: Realistic Onesign client data with multiple contacts and sites.
--          All test data uses real-sounding construction/retail client names.
--
-- Run AFTER migration 034 in Supabase SQL Editor.
-- Requires at least one org to exist (seeds contacts + sites onto existing orgs
-- and creates new orgs for missing clients).
--
-- TO REMOVE ALL TEST DATA:
--   DELETE FROM public.contacts WHERE org_id IN (SELECT id FROM public.orgs WHERE 'test-seed' = ANY(tags));
--   DELETE FROM public.org_sites WHERE org_id IN (SELECT id FROM public.orgs WHERE 'test-seed' = ANY(tags));
--   UPDATE public.orgs SET tags = array_remove(tags, 'test-seed') WHERE 'test-seed' = ANY(tags);
-- =============================================================================

DO $$
DECLARE
    v_org1 UUID;
    v_org2 UUID;
    v_org3 UUID;
    v_org4 UUID;
    v_org5 UUID;
    v_org6 UUID;
    v_contact UUID;
BEGIN

    -- =========================================================================
    -- CLIENT 1: Persimmon Homes (house builder — multiple sites)
    -- =========================================================================
    INSERT INTO public.orgs (name, slug, phone, email, website, business_type, account_number, company_reg_number, vat_number, tax_code, currency, payment_terms_days, sales_discount_percent, notes, tags)
    VALUES (
        'Persimmon Homes', 'persimmon-homes',
        '01onal 987 6543', 'signage@persimmonhomes.com', 'https://www.persimmonhomes.com',
        'House Builder', 'ACC-001', '01234567', 'GB 123 4567 89', 'T1 (20%)', 'GBP', 30, 5.00,
        'Major house builder account. Multiple developments across the North East. Standard 5% discount on all signage.',
        ARRAY['customer', 'house-builder', 'test-seed']
    )
    ON CONFLICT (slug) DO UPDATE SET
        phone = EXCLUDED.phone, email = EXCLUDED.email, website = EXCLUDED.website,
        business_type = EXCLUDED.business_type, account_number = EXCLUDED.account_number,
        company_reg_number = EXCLUDED.company_reg_number, vat_number = EXCLUDED.vat_number,
        payment_terms_days = EXCLUDED.payment_terms_days, sales_discount_percent = EXCLUDED.sales_discount_percent,
        notes = EXCLUDED.notes, tags = EXCLUDED.tags
    RETURNING id INTO v_org1;

    -- Contacts
    INSERT INTO public.contacts (org_id, first_name, last_name, email, phone, mobile, job_title, contact_type, is_primary) VALUES
        (v_org1, 'Sarah', 'Mellor', 'sarah.mellor@persimmonhomes.com', '0191 222 3344', '07700 900001', 'Marketing Manager', 'primary', TRUE),
        (v_org1, 'David', 'Thompson', 'david.thompson@persimmonhomes.com', '0191 222 3345', '07700 900002', 'Site Manager — Elvet Meadows', 'site', FALSE),
        (v_org1, 'Karen', 'Hughes', 'karen.hughes@persimmonhomes.com', '0191 222 3300', NULL, 'Accounts Payable', 'billing', FALSE)
    ON CONFLICT DO NOTHING;

    -- Sites
    INSERT INTO public.org_sites (org_id, name, address_line_1, address_line_2, city, county, postcode, phone, is_primary, is_billing_address, is_delivery_address, notes) VALUES
        (v_org1, 'Head Office', 'Persimmon House', 'Fulford', 'York', 'North Yorkshire', 'YO19 4FE', '01904 642199', TRUE, TRUE, FALSE, 'All invoices to head office'),
        (v_org1, 'Elvet Meadows Development', 'Plot 1-47, Elvet Meadows', 'Durham Road', 'Durham', 'County Durham', 'DH1 3QR', NULL, FALSE, FALSE, TRUE, 'Active development — delivery gate on Durham Road'),
        (v_org1, 'Brunton Village Phase 3', 'Brunton Lane', 'Kingston Park', 'Newcastle upon Tyne', 'Tyne and Wear', 'NE13 8AF', NULL, FALSE, FALSE, TRUE, 'Phase 3 plots. Site office near the show homes.')
    ON CONFLICT DO NOTHING;

    -- =========================================================================
    -- CLIENT 2: SKS Construction (construction — multi-site)
    -- =========================================================================
    INSERT INTO public.orgs (name, slug, phone, email, website, business_type, account_number, vat_number, payment_terms_days, notes, tags)
    VALUES (
        'SKS Construction', 'sks-construction',
        '01onal 456 7890', 'orders@sksconstruction.co.uk', 'https://www.sksconstruction.co.uk',
        'Civil Engineering', 'ACC-002', 'GB 987 6543 21', 45,
        'Long-standing client. Hoarding and safety signage for highway projects.',
        ARRAY['customer', 'construction', 'test-seed']
    )
    ON CONFLICT (slug) DO UPDATE SET
        phone = EXCLUDED.phone, email = EXCLUDED.email, business_type = EXCLUDED.business_type,
        payment_terms_days = EXCLUDED.payment_terms_days, notes = EXCLUDED.notes, tags = EXCLUDED.tags
    RETURNING id INTO v_org2;

    INSERT INTO public.contacts (org_id, first_name, last_name, email, phone, mobile, job_title, contact_type, is_primary) VALUES
        (v_org2, 'Mark', 'Patterson', 'mark.p@sksconstruction.co.uk', '0191 555 1234', '07700 900010', 'Contracts Director', 'primary', TRUE),
        (v_org2, 'Lisa', 'Graham', 'lisa.g@sksconstruction.co.uk', '0191 555 1235', NULL, 'Procurement', 'billing', FALSE)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.org_sites (org_id, name, address_line_1, city, county, postcode, phone, is_primary, is_billing_address, is_delivery_address) VALUES
        (v_org2, 'Head Office', 'Tankersley Business Park', 'Barnsley', 'South Yorkshire', 'S75 3DH', '01226 747121', TRUE, TRUE, FALSE),
        (v_org2, 'A1 Corridor Works', 'Temporary Site Compound', 'Gateshead', 'Tyne and Wear', 'NE11 0QY', NULL, FALSE, FALSE, TRUE),
        (v_org2, 'Sunderland City Centre', 'Fawcett Street', 'Sunderland', 'Tyne and Wear', 'SR1 1RH', NULL, FALSE, FALSE, TRUE)
    ON CONFLICT DO NOTHING;

    -- =========================================================================
    -- CLIENT 3: Balfour Beatty (national — single contact point)
    -- =========================================================================
    INSERT INTO public.orgs (name, slug, phone, email, website, business_type, account_number, vat_number, payment_terms_days, sales_discount_percent, notes, tags)
    VALUES (
        'Balfour Beatty', 'balfour-beatty',
        '020 7216 6800', 'ne.signage@balfourbeatty.com', 'https://www.balfourbeatty.com',
        'Infrastructure', 'ACC-003', 'GB 111 2222 33', 60, 0,
        'National contractor. 60-day payment terms. All POs must reference their order number.',
        ARRAY['customer', 'construction', 'test-seed']
    )
    ON CONFLICT (slug) DO UPDATE SET
        phone = EXCLUDED.phone, email = EXCLUDED.email, payment_terms_days = EXCLUDED.payment_terms_days,
        notes = EXCLUDED.notes, tags = EXCLUDED.tags
    RETURNING id INTO v_org3;

    INSERT INTO public.contacts (org_id, first_name, last_name, email, phone, mobile, job_title, contact_type, is_primary) VALUES
        (v_org3, 'James', 'Robson', 'james.robson@balfourbeatty.com', '0191 444 5566', '07700 900020', 'Regional Procurement', 'primary', TRUE)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.org_sites (org_id, name, address_line_1, city, county, postcode, is_primary, is_billing_address, is_delivery_address) VALUES
        (v_org3, 'North East Regional Office', 'St James Gate', 'Newcastle upon Tyne', 'Tyne and Wear', 'NE1 4AD', TRUE, TRUE, TRUE)
    ON CONFLICT DO NOTHING;

    -- =========================================================================
    -- CLIENT 4: Slick Construction (small builder — single site)
    -- =========================================================================
    INSERT INTO public.orgs (name, slug, phone, email, business_type, payment_terms_days, tags)
    VALUES (
        'Slick Construction', 'slick-construction',
        '0191 333 4455', 'info@slickconstruction.co.uk',
        'General Builder', 30,
        ARRAY['customer', 'construction', 'test-seed']
    )
    ON CONFLICT (slug) DO UPDATE SET
        phone = EXCLUDED.phone, email = EXCLUDED.email, tags = EXCLUDED.tags
    RETURNING id INTO v_org4;

    INSERT INTO public.contacts (org_id, first_name, last_name, email, phone, mobile, job_title, contact_type, is_primary) VALUES
        (v_org4, 'Tony', 'Reeder', 'tony@slickconstruction.co.uk', '0191 333 4455', '07700 900030', 'Director', 'primary', TRUE)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.org_sites (org_id, name, address_line_1, city, county, postcode, is_primary, is_billing_address, is_delivery_address) VALUES
        (v_org4, 'Office', 'Unit 12, Follingsby Park', 'Gateshead', 'Tyne and Wear', 'NE10 8YG', TRUE, TRUE, TRUE)
    ON CONFLICT DO NOTHING;

    -- =========================================================================
    -- CLIENT 5: Bellway Homes (house builder — prospect, not yet customer)
    -- =========================================================================
    INSERT INTO public.orgs (name, slug, phone, email, website, business_type, notes, tags)
    VALUES (
        'Bellway Homes', 'bellway-homes',
        '0191 217 0717', 'enquiries@bellway.co.uk', 'https://www.bellway.co.uk',
        'House Builder',
        'Prospect — quoted for plot signage but not yet confirmed.',
        ARRAY['prospect', 'house-builder', 'test-seed']
    )
    ON CONFLICT (slug) DO UPDATE SET
        phone = EXCLUDED.phone, email = EXCLUDED.email, notes = EXCLUDED.notes, tags = EXCLUDED.tags
    RETURNING id INTO v_org5;

    INSERT INTO public.contacts (org_id, first_name, last_name, email, phone, job_title, contact_type, is_primary) VALUES
        (v_org5, 'Rachel', 'Dixon', 'rachel.dixon@bellway.co.uk', '0191 217 0720', 'Marketing Coordinator', 'primary', TRUE)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.org_sites (org_id, name, address_line_1, city, county, postcode, is_primary, is_billing_address, is_delivery_address) VALUES
        (v_org5, 'Northern HQ', 'Woolsington House', 'Newcastle upon Tyne', 'Tyne and Wear', 'NE13 8BF', TRUE, TRUE, FALSE)
    ON CONFLICT DO NOTHING;

    -- =========================================================================
    -- CLIENT 6: Onesign & Digital (internal — for own branding/vehicle wraps)
    -- =========================================================================
    INSERT INTO public.orgs (name, slug, phone, email, website, business_type, notes, tags)
    VALUES (
        'Onesign & Digital', 'onesign-digital',
        '0191 482 0444', 'hello@onesignanddigital.com', 'https://onesignanddigital.com',
        'Signage & Digital',
        'Internal account for Onesign own branding, vehicle wraps, and office signage.',
        ARRAY['customer', 'internal', 'test-seed']
    )
    ON CONFLICT (slug) DO UPDATE SET
        phone = EXCLUDED.phone, email = EXCLUDED.email, notes = EXCLUDED.notes, tags = EXCLUDED.tags
    RETURNING id INTO v_org6;

    INSERT INTO public.contacts (org_id, first_name, last_name, email, phone, job_title, contact_type, is_primary) VALUES
        (v_org6, 'Mak', 'Sheridan', 'mak@onesignanddigital.com', '0191 482 0444', 'Managing Director', 'primary', TRUE)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.org_sites (org_id, name, address_line_1, address_line_2, city, county, postcode, phone, is_primary, is_billing_address, is_delivery_address) VALUES
        (v_org6, 'Workshop', 'Unit 6', 'Team Valley Trading Estate, Earlsway', 'Gateshead', 'Tyne and Wear', 'NE11 0QH', '0191 482 0444', TRUE, TRUE, TRUE)
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Client seed complete — 6 clients, ~11 contacts, ~10 sites. Remove with: UPDATE orgs SET tags = array_remove(tags, ''test-seed'') WHERE ''test-seed'' = ANY(tags); then delete contacts/sites manually.';
END $$;
