BEGIN;
REVOKE ALL ON public.legal_acceptances FROM anon, PUBLIC;
GRANT SELECT, INSERT ON public.legal_acceptances TO authenticated;
DROP POLICY IF EXISTS legal_acceptances_insert_own ON public.legal_acceptances;
CREATE POLICY legal_acceptances_insert_own ON public.legal_acceptances FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) IS NOT NULL AND (select auth.uid()) = user_id);
DROP POLICY IF EXISTS legal_acceptances_read_own ON public.legal_acceptances;
CREATE POLICY legal_acceptances_read_own ON public.legal_acceptances FOR SELECT TO authenticated USING ((select auth.uid()) IS NOT NULL AND (select auth.uid()) = user_id);
COMMIT;
