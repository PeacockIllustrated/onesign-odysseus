-- Seed data for portal testing
-- Run in Supabase SQL Editor

-- Your org ID: a7d374f8-442c-45a7-826c-cf4cfef51279

-- ============================================================================
-- SUBSCRIPTION
-- ============================================================================

INSERT INTO public.subscriptions (org_id, package_key, term_months, ad_spend_included, status, start_date)
VALUES (
    'a7d374f8-442c-45a7-826c-cf4cfef51279',
    'scale',
    6,
    50000,  -- £500 in pence
    'active',
    CURRENT_DATE - INTERVAL '2 months'
);

-- ============================================================================
-- ACCELERATORS
-- ============================================================================

INSERT INTO public.subscription_accelerators (org_id, accelerator_key, status, start_date)
VALUES 
    ('a7d374f8-442c-45a7-826c-cf4cfef51279', 'video_content_boost', 'active', CURRENT_DATE - INTERVAL '1 month'),
    ('a7d374f8-442c-45a7-826c-cf4cfef51279', 'landing_page_starter', 'active', CURRENT_DATE - INTERVAL '2 months');

-- ============================================================================
-- DELIVERABLES (This Month)
-- ============================================================================

INSERT INTO public.deliverables (org_id, month, title, description, status, due_date)
VALUES 
    ('a7d374f8-442c-45a7-826c-cf4cfef51279', DATE_TRUNC('month', CURRENT_DATE), 'Facebook Ad Campaign Setup', 'Initial campaign structure with 3 ad sets targeting different audiences.', 'approved', CURRENT_DATE - INTERVAL '5 days'),
    ('a7d374f8-442c-45a7-826c-cf4cfef51279', DATE_TRUNC('month', CURRENT_DATE), 'Instagram Story Creatives', '4x story ads for January promotion.', 'submitted', CURRENT_DATE + INTERVAL '2 days'),
    ('a7d374f8-442c-45a7-826c-cf4cfef51279', DATE_TRUNC('month', CURRENT_DATE), 'Monthly Performance Report', 'January analytics and insights.', 'in_progress', CURRENT_DATE + INTERVAL '7 days'),
    ('a7d374f8-442c-45a7-826c-cf4cfef51279', DATE_TRUNC('month', CURRENT_DATE), 'Landing Page A/B Test', 'Testing headline variations for conversion optimization.', 'draft', CURRENT_DATE + INTERVAL '14 days'),
    ('a7d374f8-442c-45a7-826c-cf4cfef51279', DATE_TRUNC('month', CURRENT_DATE), 'Video Ad Editing', '2x 15-second video ads for retargeting.', 'in_progress', CURRENT_DATE + INTERVAL '5 days');

-- ============================================================================
-- DELIVERABLE UPDATES (Comments)
-- ============================================================================

-- Add comments to the submitted deliverable
INSERT INTO public.deliverable_updates (deliverable_id, comment)
SELECT id, 'Creatives uploaded and ready for review. Please check the messaging aligns with brand guidelines.'
FROM public.deliverables WHERE title = 'Instagram Story Creatives' LIMIT 1;

INSERT INTO public.deliverable_updates (deliverable_id, comment)
SELECT id, 'Updated based on feedback - reduced text overlay and adjusted CTA button color.'
FROM public.deliverables WHERE title = 'Instagram Story Creatives' LIMIT 1;

-- ============================================================================
-- REPORTS (Past Months)
-- ============================================================================

INSERT INTO public.reports (org_id, month, title, summary)
VALUES 
    ('a7d374f8-442c-45a7-826c-cf4cfef51279', DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month'), 'December 2025 Performance Report', 
     '{"impressions": "45,230", "clicks": "1,847", "ctr": "4.1%", "conversions": "23"}'),
    ('a7d374f8-442c-45a7-826c-cf4cfef51279', DATE_TRUNC('month', CURRENT_DATE - INTERVAL '2 months'), 'November 2025 Performance Report', 
     '{"impressions": "38,120", "clicks": "1,522", "ctr": "4.0%", "conversions": "18"}');

-- ============================================================================
-- DONE! Refresh /app/dashboard to see the data
-- ============================================================================
