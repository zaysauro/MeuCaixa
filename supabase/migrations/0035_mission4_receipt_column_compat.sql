-- Canonical published name is paper_width; handle old installations that still use width.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='receipt_settings' AND column_name='width')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='receipt_settings' AND column_name='paper_width') THEN
    ALTER TABLE public.receipt_settings RENAME COLUMN width TO paper_width;
  END IF;
END $$;
