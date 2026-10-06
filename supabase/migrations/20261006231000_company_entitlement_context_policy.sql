BEGIN;

CREATE POLICY organization_user_context_no_direct_access
  ON public.organization_user_context
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

COMMIT;
