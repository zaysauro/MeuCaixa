-- 0004_product_history.sql
-- Histórico operacional de produtos: criação, edição, baixa lógica e alterações de estoque.

CREATE TABLE IF NOT EXISTS public.product_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('created','updated','deleted')),
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  old_data jsonb,
  new_data jsonb
);

CREATE INDEX IF NOT EXISTS idx_product_history_org
  ON public.product_history(organization_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_history_product
  ON public.product_history(product_id, changed_at DESC);

ALTER TABLE public.product_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_history_member_read" ON public.product_history;
CREATE POLICY "product_history_member_read"
ON public.product_history
FOR SELECT
TO authenticated
USING (public.is_organization_member(organization_id));

CREATE OR REPLACE FUNCTION public.log_product_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.product_history (
      organization_id, product_id, action, changed_by, new_data
    )
    VALUES (
      NEW.organization_id, NEW.id, 'created', auth.uid(), to_jsonb(NEW)
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_action := CASE
      WHEN OLD.active = true AND NEW.active = false THEN 'deleted'
      ELSE 'updated'
    END;

    INSERT INTO public.product_history (
      organization_id, product_id, action, changed_by, old_data, new_data
    )
    VALUES (
      NEW.organization_id,
      NEW.id,
      v_action,
      auth.uid(),
      to_jsonb(OLD),
      to_jsonb(NEW)
    );
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_history_trigger ON public.products;

CREATE TRIGGER products_history_trigger
AFTER INSERT OR UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.log_product_history();

NOTIFY pgrst, 'reload schema';
