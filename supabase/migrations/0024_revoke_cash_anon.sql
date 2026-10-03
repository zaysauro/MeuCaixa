-- 0024_revoke_cash_anon.sql
-- Mantém os RPCs de consulta de caixa disponíveis somente para autenticados.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.get_cash_current_summary(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_cash_register_history(uuid, text, date, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_cash_register_movements(uuid) FROM anon;

COMMIT;
