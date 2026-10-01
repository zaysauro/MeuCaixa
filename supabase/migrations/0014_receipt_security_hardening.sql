-- 0014_receipt_security_hardening.sql
-- Evita que usuários consumam números de venda diretamente.
-- O contador continua sendo chamado internamente pela complete_sale.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.next_sale_number(uuid)
FROM PUBLIC, authenticated, anon;

GRANT EXECUTE ON FUNCTION public.complete_sale(uuid,numeric,jsonb,jsonb,uuid,uuid)
TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
