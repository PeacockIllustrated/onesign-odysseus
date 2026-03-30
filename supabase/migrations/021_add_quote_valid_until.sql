-- Add valid_until date field to quotes
-- Stores the expiry date of the quote (default 30 days from creation)

ALTER TABLE quotes ADD COLUMN valid_until DATE;

-- Backfill existing quotes: set valid_until to 30 days after created_at
UPDATE quotes SET valid_until = (created_at::date + INTERVAL '30 days')::date
WHERE valid_until IS NULL;
