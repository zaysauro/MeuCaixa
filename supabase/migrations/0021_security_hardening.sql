-- 0021_security_hardening.sql
-- Remove anonymous execution from public SECURITY DEFINER functions.
-- Keep only the authenticated RPC surface used by the application.

BEGIN;

ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.finance_set_updated_at() SET search_path = public;

DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.signature);
  END LOOP;
END
$$;

GRANT EXECUTE ON FUNCTION public.can_access_branch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_onboarding(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_sale(uuid, numeric, jsonb, jsonb, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_audit_log(uuid, text, text, text, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_organization(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_organization() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_onboarding_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sale_receipt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_organization_role(uuid, public.member_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_organization_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_allowed_branches(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_pos_customers(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_pos_products(uuid, text, integer) TO authenticated;

DROP POLICY IF EXISTS "authenticated can read role permissions"
  ON public.role_permissions;

CREATE POLICY "authenticated can read role permissions"
  ON public.role_permissions
  FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON public.role_permissions TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
