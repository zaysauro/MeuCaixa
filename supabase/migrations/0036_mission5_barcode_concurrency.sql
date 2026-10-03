-- Serialize barcode claims per tenant. Existing historical duplicates are kept
-- for manual resolution, but concurrent new claims cannot race each other.
CREATE OR REPLACE FUNCTION public.prevent_duplicate_active_barcode()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_key text;
BEGIN
  IF NEW.active AND NEW.barcode IS NOT NULL AND btrim(NEW.barcode) <> '' THEN
    v_key := NEW.organization_id::text || ':' || lower(btrim(NEW.barcode));
    PERFORM pg_advisory_xact_lock(hashtextextended(v_key, 0));
    IF EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.organization_id = NEW.organization_id AND p.active
        AND lower(btrim(p.barcode)) = lower(btrim(NEW.barcode)) AND p.id <> NEW.id
    ) THEN RAISE EXCEPTION 'product_barcode_already_exists'; END IF;
  END IF;
  RETURN NEW;
END; $$;
