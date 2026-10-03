-- 0025_revoke_cash_public.sql
-- Remove o privilégio padrão PUBLIC dos RPCs de consulta de caixa.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.get_cash_current_summary(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_cash_register_history(uuid, text, date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_cash_register_movements(uuid) FROM PUBLIC;

COMMIT;
