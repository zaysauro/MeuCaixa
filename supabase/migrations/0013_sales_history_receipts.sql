-- 0013_sales_history_receipts.sql
-- Consulta paginada do histórico de vendas para o PDV.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_sales_history(
  p_branch_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  sale_id uuid,
  sale_number bigint,
  branch_id uuid,
  branch_name text,
  status text,
  total numeric,
  discount numeric,
  customer_name text,
  seller_name text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id,
    s.sale_number,
    s.branch_id,
    COALESCE(s.branch_name_snapshot, b.name),
    s.status,
    s.total,
    s.discount,
    s.customer_name_snapshot,
    s.seller_name_snapshot,
    s.created_at
  FROM public.sales s
  LEFT JOIN public.branches b ON b.id = s.branch_id
  WHERE public.can_access_branch(s.branch_id)
    AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
  ORDER BY s.created_at DESC, s.id DESC
  LIMIT greatest(1, least(coalesce(p_limit, 50), 100))
  OFFSET greatest(coalesce(p_offset, 0), 0);
$$;

GRANT EXECUTE ON FUNCTION public.get_sales_history(uuid, integer, integer)
TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
