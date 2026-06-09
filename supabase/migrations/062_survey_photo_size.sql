-- Migration 062: per-photo quick size for the simplified survey flow.
--
-- The survey UX was simplified to be photo-first: the surveyor takes a photo,
-- draws the sizes on it, and optionally types one quick Width × Height for the
-- office. That W×H lives on the photo (mm), alongside the annotation markup —
-- there's no longer a structured per-item measurement form.
--
-- (NB: width_px/height_px on this table are the IMAGE pixel dimensions used to
-- align the annotation overlay; sign_width_mm/sign_height_mm are the real-world
-- sign size the surveyor measured.)

ALTER TABLE public.survey_photos
    ADD COLUMN IF NOT EXISTS sign_width_mm NUMERIC,
    ADD COLUMN IF NOT EXISTS sign_height_mm NUMERIC;
