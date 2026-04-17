BEGIN;

CREATE TABLE IF NOT EXISTS public.drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT,
    home_postcode TEXT,
    home_lat DOUBLE PRECISION,
    home_lng DOUBLE PRECISION,
    vehicle_type TEXT NOT NULL DEFAULT 'van'
        CHECK (vehicle_type IN ('van', 'truck', 'car')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drivers_active
    ON public.drivers(is_active) WHERE is_active = TRUE;

CREATE TRIGGER trg_drivers_updated_at
    BEFORE UPDATE ON public.drivers
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage drivers"
    ON public.drivers FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY "Authed users read drivers"
    ON public.drivers FOR SELECT TO authenticated
    USING (auth.uid() IS NOT NULL);

COMMIT;
