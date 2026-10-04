-- 0042_product_import_rpc_acl.sql
-- A função precisa ser SECURITY DEFINER para atravessar as políticas de escrita
-- do estoque, mas nunca deve ser invocável anonimamente.
BEGIN;

REVOKE EXECUTE ON FUNCTION public.import_products_batch(uuid, jsonb, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_products_batch(uuid, jsonb, text, boolean, text) TO authenticated;

COMMIT;
