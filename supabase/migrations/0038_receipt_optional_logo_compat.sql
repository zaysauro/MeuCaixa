-- receipt_settings has no logo column in the published schema.
-- Keep the receipt response compatible by returning an optional null logo.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_sale_receipt(
  p_sale_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT s.*
    INTO v_sale
  FROM public.sales s
  WHERE s.id = p_sale_id
    AND public.can_access_branch(s.branch_id);

  IF v_sale.id IS NULL THEN
    RAISE EXCEPTION 'sale_not_found';
  END IF;

  SELECT jsonb_build_object(
    'sale', jsonb_build_object(
      'id', v_sale.id,
      'sale_number', v_sale.sale_number,
      'organization_id', v_sale.organization_id,
      'branch_id', v_sale.branch_id,
      'status', v_sale.status,
      'subtotal', v_sale.subtotal,
      'discount', v_sale.discount,
      'total', v_sale.total,
      'created_at', v_sale.created_at,
      'organization_name', v_sale.organization_name_snapshot,
      'branch_name', v_sale.branch_name_snapshot,
      'branch_code', v_sale.branch_code_snapshot,
      'address_line', v_sale.branch_address_snapshot,
      'city', v_sale.branch_city_snapshot,
      'state', v_sale.branch_state_snapshot,
      'zip_code', v_sale.branch_zip_snapshot,
      'phone', v_sale.branch_phone_snapshot,
      'seller_name', v_sale.seller_name_snapshot,
      'customer_name', v_sale.customer_name_snapshot,
      'customer_document', v_sale.customer_document_snapshot,
      'customer_phone', v_sale.customer_phone_snapshot
    ),
    'items', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', si.id,
          'product_id', si.product_id,
          'product_name', si.product_name,
          'quantity', si.quantity,
          'unit_price', si.unit_price,
          'discount', si.discount,
          'total', si.total
        )
        ORDER BY si.id
      )
      FROM public.sale_items si
      WHERE si.sale_id = v_sale.id
    ), '[]'::jsonb),
    'payments', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', sp.id,
          'method', sp.method,
          'amount', sp.amount,
          'received_amount', sp.received_amount,
          'change_amount', sp.change_amount
        )
        ORDER BY sp.id
      )
      FROM public.sale_payments sp
      WHERE sp.sale_id = v_sale.id
    ), '[]'::jsonb),
    'settings', COALESCE((
      SELECT jsonb_build_object(
        'width', rs.paper_width,
        'footer_text', rs.footer_text,
        'show_cnpj', rs.show_cnpj,
        'show_address', rs.show_address,
        'show_seller', rs.show_seller,
        'show_customer', rs.show_customer,
        'auto_print', rs.auto_print,
        'logo_url', NULL::text
      )
      FROM public.receipt_settings rs
      WHERE rs.branch_id = v_sale.branch_id
    ), jsonb_build_object(
      'width', '80mm',
      'footer_text', 'Obrigado pela preferência!',
      'show_cnpj', true,
      'show_address', true,
      'show_seller', true,
      'show_customer', true,
      'auto_print', false,
      'logo_url', NULL::text
    ))
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_sale_receipt(uuid) TO authenticated;
COMMIT;
