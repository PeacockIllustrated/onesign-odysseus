BEGIN;

ALTER TABLE public.deliveries
    ADD COLUMN IF NOT EXISTS driver_id UUID
        REFERENCES public.drivers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_deliveries_driver
    ON public.deliveries(driver_id) WHERE driver_id IS NOT NULL;

COMMIT;
