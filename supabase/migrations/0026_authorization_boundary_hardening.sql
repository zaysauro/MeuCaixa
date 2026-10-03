-- 0026_authorization_boundary_hardening.sql
-- Corrige validações server-side encontradas na auditoria individual.

BEGIN;

CREATE OR REPLACE FUNCTION public.authorize_sensitive_operation(p_organization_id uuid, p_permission_key text, p_pin text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid;
  v_hash text;
  v_locked_until timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = p_organization_id
      AND om.user_id = auth.uid()
      AND om.active = true
  ) THEN
    RAISE EXCEPTION 'organization_access_denied';
  END IF;

  SELECT usc.user_id, usc.credential_hash, usc.locked_until
    INTO v_user_id, v_hash, v_locked_until
  FROM public.user_sensitive_credentials usc
  JOIN public.organization_members om
    ON om.organization_id = usc.organization_id
   AND om.user_id = usc.user_id
   AND om.active = true
  JOIN public.role_permissions rp
    ON rp.role::text = om.role::text
   AND rp.permission_key = p_permission_key
  WHERE usc.organization_id = p_organization_id
    AND usc.credential_type = 'sensitive_pin'
    AND usc.active = true
    AND (usc.locked_until IS NULL OR usc.locked_until <= now())
  ORDER BY
    CASE om.role::text
      WHEN 'owner' THEN 1
      WHEN 'admin' THEN 2
      WHEN 'manager' THEN 3
      ELSE 4
    END
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authorization_unavailable';
  END IF;

  IF crypt(coalesce(p_pin, ''), v_hash) = v_hash THEN
    UPDATE public.user_sensitive_credentials
    SET
      failed_attempts = 0,
      locked_until = NULL,
      updated_at = now()
    WHERE organization_id = p_organization_id
      AND user_id = v_user_id
      AND credential_type = 'sensitive_pin';

    RETURN v_user_id;
  END IF;

  UPDATE public.user_sensitive_credentials
  SET
    failed_attempts = failed_attempts + 1,
    locked_until = CASE
      WHEN failed_attempts + 1 >= 5
      THEN now() + interval '15 minutes'
      ELSE locked_until
    END,
    updated_at = now()
  WHERE organization_id = p_organization_id
    AND user_id = v_user_id
    AND credential_type = 'sensitive_pin';

  RAISE EXCEPTION 'invalid_authorization';
END;
$function$;


CREATE OR REPLACE FUNCTION public.cancel_stock_transfer(p_transfer_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE t public.stock_transfers%ROWTYPE;tc record;i record;
BEGIN
 SELECT * INTO t FROM public.stock_transfers WHERE id=p_transfer_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'transfer_not_found'; END IF;
 IF NOT public.can_access_branch(t.source_branch_id)
    OR NOT public.can_access_branch(t.destination_branch_id)
 THEN RAISE EXCEPTION 'branch_access_denied'; END IF;
 IF NOT public.can_manage_stock(t.organization_id) THEN RAISE EXCEPTION 'stock_permission_denied'; END IF;
 IF NULLIF(trim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'reason_required'; END IF;

 IF t.status='requested' THEN
  UPDATE public.stock_transfers SET status='cancelled',cancelled_by=auth.uid(),cancelled_at=now(),
   notes=COALESCE(notes||' | ','')||'Cancelada: '||p_reason WHERE id=t.id;
 ELSIF t.status='sent' THEN
  FOR tc IN SELECT * FROM public.stock_in_transit WHERE transfer_id=t.id AND quantity>0 LOOP
   PERFORM public.post_stock_movement(t.source_branch_id,tc.product_id,tc.quantity,
    'transfer_cancelled','Estorno transferência #'||t.transfer_number||': '||p_reason,t.id,tc.unit_cost);
   UPDATE public.stock_in_transit SET quantity=0 WHERE id=tc.id;
  END LOOP;
  UPDATE public.stock_transfers SET status='cancelled',cancelled_by=auth.uid(),cancelled_at=now() WHERE id=t.id;
 ELSIF t.status='received' THEN
  FOR i IN SELECT * FROM public.stock_transfer_items WHERE transfer_id=t.id LOOP
   IF COALESCE(i.received_quantity,0)>0 THEN
    PERFORM public.post_stock_movement(t.destination_branch_id,i.product_id,-i.received_quantity,
     'transfer_reversal','Estorno transferência #'||t.transfer_number||': '||p_reason,t.id,i.unit_cost);
    PERFORM public.post_stock_movement(t.source_branch_id,i.product_id,i.received_quantity,
     'transfer_reversal','Estorno transferência #'||t.transfer_number||': '||p_reason,t.id,i.unit_cost);
   END IF;
  END LOOP;
  UPDATE public.stock_transfers SET status='cancelled',cancelled_by=auth.uid(),cancelled_at=now(),
   notes=COALESCE(notes||' | ','')||'Estorno: '||p_reason WHERE id=t.id;
 ELSE
  RAISE EXCEPTION 'invalid_transfer_status';
 END IF;
END; $function$;


CREATE OR REPLACE FUNCTION public.finance_create_entry(p_organization_id uuid, p_branch_id uuid, p_entry_type text, p_description text, p_amount numeric, p_due_date date DEFAULT NULL::date, p_category_id uuid DEFAULT NULL::uuid, p_supplier_id uuid DEFAULT NULL::uuid, p_customer_id uuid DEFAULT NULL::uuid, p_origin_type text DEFAULT 'manual'::text, p_origin_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_entry_type NOT IN ('payable','receivable') THEN RAISE EXCEPTION 'invalid_entry_type'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF p_origin_type <> 'manual' AND p_origin_id IS NOT NULL THEN
    SELECT id INTO v_id
    FROM public.finance_entries
    WHERE organization_id = p_organization_id
      AND origin_type = p_origin_type
      AND origin_id = p_origin_id
    LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;
  IF NOT public.has_permission('finance.create', p_organization_id)
     OR NOT public.finance_can_access_branch(p_organization_id, p_branch_id) THEN
    RAISE EXCEPTION 'finance_permission_denied';
  END IF;
  IF p_supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.suppliers
    WHERE id = p_supplier_id AND organization_id = p_organization_id AND active = true
  ) THEN RAISE EXCEPTION 'invalid_supplier'; END IF;
  IF p_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers
    WHERE id = p_customer_id AND organization_id = p_organization_id AND active = true
  ) THEN RAISE EXCEPTION 'invalid_customer'; END IF;
  IF p_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.finance_categories
    WHERE id = p_category_id AND organization_id = p_organization_id AND active = true
  ) THEN RAISE EXCEPTION 'invalid_category'; END IF;

  INSERT INTO public.finance_entries (
    organization_id, branch_id, category_id, supplier_id, customer_id,
    entry_type, origin_type, origin_id, description, amount, due_date, created_by
  )
  VALUES (
    p_organization_id, p_branch_id, p_category_id, p_supplier_id, p_customer_id,
    p_entry_type, p_origin_type, p_origin_id, trim(p_description), p_amount, p_due_date, auth.uid()
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;


CREATE OR REPLACE FUNCTION public.finance_settle(p_entry_id uuid, p_amount numeric, p_payment_method text DEFAULT NULL::text, p_financial_account_id uuid DEFAULT NULL::uuid, p_interest numeric DEFAULT 0, p_fine numeric DEFAULT 0, p_discount numeric DEFAULT 0, p_idempotency_key uuid DEFAULT NULL::uuid, p_settled_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  e public.finance_entries%ROWTYPE;
  v_id uuid;
  v_paid numeric;
  v_remaining numeric;
  v_total numeric;
BEGIN
  SELECT * INTO e FROM public.finance_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'entry_not_found'; END IF;
  IF e.status = 'cancelled' THEN RAISE EXCEPTION 'entry_cancelled'; END IF;
  IF NOT public.has_permission(
      CASE WHEN e.entry_type = 'payable' THEN 'finance.payable.pay' ELSE 'finance.receivable.receive' END,
      e.organization_id
    ) THEN
    RAISE EXCEPTION 'finance_permission_denied';
  END IF;
  IF NOT public.finance_can_access_branch(e.organization_id, e.branch_id) THEN
    RAISE EXCEPTION 'branch_access_denied';
  END IF;
  IF p_financial_account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.financial_accounts fa
    WHERE fa.id = p_financial_account_id
      AND fa.organization_id = e.organization_id
      AND (fa.branch_id IS NULL OR fa.branch_id = e.branch_id)
      AND fa.active = true
  ) THEN RAISE EXCEPTION 'invalid_financial_account'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF p_interest < 0 OR p_fine < 0 OR p_discount < 0 THEN RAISE EXCEPTION 'invalid_adjustment'; END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_id
    FROM public.finance_settlements
    WHERE organization_id = e.organization_id AND idempotency_key = p_idempotency_key;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;

  v_paid := public.finance_entry_settled_amount(e.id);
  v_remaining := e.amount - v_paid;
  IF p_amount > v_remaining THEN RAISE EXCEPTION 'settlement_exceeds_balance'; END IF;

  v_total := p_amount + p_interest + p_fine - p_discount;
  IF v_total <= 0 THEN RAISE EXCEPTION 'invalid_settlement_total'; END IF;

  INSERT INTO public.finance_settlements (
    organization_id, branch_id, entry_id, financial_account_id,
    settlement_type, amount, interest, fine, discount,
    payment_method, settled_at, idempotency_key, notes, created_by
  )
  VALUES (
    e.organization_id, e.branch_id, e.id, p_financial_account_id,
    CASE WHEN e.entry_type = 'payable' THEN 'payment' ELSE 'receipt' END,
    p_amount, p_interest, p_fine, p_discount,
    p_payment_method, COALESCE(p_settled_at, now()),
    COALESCE(p_idempotency_key, gen_random_uuid()), p_notes, auth.uid()
  )
  RETURNING id INTO v_id;

  PERFORM public.refresh_finance_entry_status(e.id);
  RETURN v_id;
END;
$function$;


CREATE OR REPLACE FUNCTION public.user_branches(p_organization_id uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(branch_id uuid, branch_name text, is_headquarters boolean, active boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT
    b.id,
    b.name,
    b.is_headquarters,
    b.active
  FROM public.branches b
  JOIN public.organization_members om
    ON om.organization_id = b.organization_id
   AND om.user_id = COALESCE(p_user_id, auth.uid())
   AND om.active = true
  WHERE b.organization_id = p_organization_id
    AND b.active = true
    AND EXISTS (
      SELECT 1 FROM public.organization_members caller
      WHERE caller.organization_id = p_organization_id
        AND caller.user_id = auth.uid()
        AND caller.active = true
        AND (
          COALESCE(p_user_id, auth.uid()) = auth.uid()
          OR caller.role::text IN ('owner', 'admin')
          OR public.has_permission('users.view', p_organization_id)
        )
    )
    AND (
      om.role::text = 'owner'
      OR om.branch_access_mode = 'all'
      OR om.branch_id = b.id
      OR EXISTS (
        SELECT 1
        FROM public.organization_member_branches omb
        WHERE omb.organization_id = om.organization_id
          AND omb.user_id = om.user_id
          AND omb.branch_id = b.id
      )
    )
  ORDER BY b.is_headquarters DESC, b.created_at, b.name;
$function$;


REVOKE EXECUTE ON FUNCTION public.authorize_sensitive_operation(uuid,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_stock_transfer(uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_branches(uuid,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.finance_create_entry(uuid,uuid,text,text,numeric,date,uuid,uuid,uuid,text,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.finance_settle(uuid,numeric,text,uuid,numeric,numeric,numeric,uuid,timestamptz,text) FROM PUBLIC, anon;

COMMIT;
