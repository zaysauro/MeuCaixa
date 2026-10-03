-- 0027_internal_rpc_boundary_hardening.sql
-- Fecha RPCs internos e exige vínculo com a organização para ler configuração.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_operator_discount_limit(p_organization_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_organization_member(p_organization_id) THEN
    RAISE EXCEPTION 'organization_access_denied';
  END IF;

  SELECT oss.operator_discount_limit
    INTO v_limit
  FROM public.organization_security_settings oss
  WHERE oss.organization_id = p_organization_id;

  RETURN COALESCE(v_limit, 5.00);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finance_entry_settled_amount(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_finance_entry_status(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.next_stock_transfer_number(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_operator_discount_limit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_operator_discount_limit(uuid) TO authenticated;

COMMIT;
