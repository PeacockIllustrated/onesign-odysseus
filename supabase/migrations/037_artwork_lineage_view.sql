-- Migration 037: artwork_job_lineage view
-- Surfaces quote → production_job → artwork trail in one query.

BEGIN;

CREATE OR REPLACE VIEW public.artwork_job_lineage AS
SELECT
  aj.id            AS artwork_job_id,
  aj.job_reference AS artwork_reference,
  aj.org_id,
  ji.id            AS job_item_id,
  pj.id            AS production_job_id,
  pj.job_number    AS production_job_number,
  pj.quote_id,
  q.quote_number
FROM public.artwork_jobs aj
LEFT JOIN public.job_items       ji ON ji.id = aj.job_item_id
LEFT JOIN public.production_jobs pj ON pj.id = ji.job_id
LEFT JOIN public.quotes           q ON q.id = pj.quote_id;

-- Super-admin RLS is inherited through the base tables.
COMMENT ON VIEW public.artwork_job_lineage IS
  'One-hop lineage from artwork_job to originating quote (where applicable).';

COMMIT;
