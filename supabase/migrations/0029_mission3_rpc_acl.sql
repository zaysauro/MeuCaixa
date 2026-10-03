-- New SECURITY DEFINER functions must be explicitly private to anonymous clients.
REVOKE EXECUTE ON FUNCTION public.create_branch(text,text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_billing_status() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.open_cash_register(uuid,numeric,uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_stock_transfer(uuid,uuid,jsonb,uuid,text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_cash_report(uuid,uuid,timestamptz,timestamptz) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_branch(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_billing_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_cash_register(uuid,numeric,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_stock_transfer(uuid,uuid,jsonb,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cash_report(uuid,uuid,timestamptz,timestamptz) TO authenticated;
