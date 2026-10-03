-- Keep one public sale signature and close anonymous execution.
REVOKE EXECUTE ON FUNCTION public.complete_sale(uuid,numeric,jsonb,jsonb,uuid,uuid) FROM anon, authenticated, PUBLIC;
DROP FUNCTION IF EXISTS public.complete_sale(uuid,numeric,jsonb,jsonb,uuid,uuid);
REVOKE EXECUTE ON FUNCTION public.complete_sale(uuid,numeric,jsonb,jsonb,uuid,uuid,uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_sale(uuid,numeric,jsonb,jsonb,uuid,uuid,uuid) TO authenticated;
