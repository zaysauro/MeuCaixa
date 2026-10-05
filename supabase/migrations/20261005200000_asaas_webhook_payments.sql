BEGIN;

ALTER TABLE public.billing_events
  ADD COLUMN IF NOT EXISTS error text;

CREATE TABLE IF NOT EXISTS public.billing_payments (
  asaas_payment_id text PRIMARY KEY,
  asaas_subscription_id text,
  asaas_customer_id text,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  status text NOT NULL,
  value numeric(12,2),
  billing_type text,
  due_date date,
  paid_at timestamptz,
  invoice_url text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_payments_subscription_idx
  ON public.billing_payments (asaas_subscription_id);
CREATE INDEX IF NOT EXISTS billing_payments_organization_idx
  ON public.billing_payments (organization_id);

ALTER TABLE public.billing_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_payments FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.billing_payments TO service_role;

CREATE OR REPLACE FUNCTION public.process_asaas_webhook(
  p_event_id text,
  p_event_type text,
  p_payload jsonb,
  p_grace_days integer DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.billing_events%ROWTYPE;
  v_payment jsonb := p_payload->'payment';
  v_subscription jsonb := p_payload->'subscription';
  v_event_external_reference text;
  v_payment_id text;
  v_subscription_id text;
  v_customer_id text;
  v_checkout_id text;
  v_org_id uuid;
  v_status text;
  v_due_date date;
BEGIN
  IF current_setting('request.jwt.claim.role', true) <> 'service_role'
    OR nullif(btrim(coalesce(p_event_id, '')), '') IS NULL
    OR nullif(btrim(coalesce(p_event_type, '')), '') IS NULL THEN
    RAISE EXCEPTION 'invalid_asaas_webhook';
  END IF;

  INSERT INTO public.billing_events(provider_event_id, event_type, payload)
  VALUES (p_event_id, p_event_type, coalesce(p_payload, '{}'::jsonb))
  ON CONFLICT (provider_event_id) DO NOTHING;

  SELECT * INTO v_event
  FROM public.billing_events
  WHERE provider_event_id = p_event_id
  FOR UPDATE;

  IF v_event.processed_at IS NOT NULL THEN
    RETURN jsonb_build_object('duplicate', true, 'organization_id', v_event.organization_id);
  END IF;

  v_payment_id := nullif(v_payment->>'id', '');
  v_subscription_id := nullif(coalesce(v_payment->>'subscription', v_subscription->>'id'), '');
  v_customer_id := nullif(coalesce(v_payment->>'customer', v_subscription->>'customer'), '');
  v_checkout_id := nullif(p_payload->'checkout'->>'id', '');
  v_event_external_reference := nullif(coalesce(
    v_payment->>'externalReference',
    v_subscription->>'externalReference',
    p_payload->'checkout'->>'externalReference',
    p_payload->>'externalReference'
  ), '');

  IF v_event_external_reference IS NOT NULL THEN
    BEGIN
      v_org_id := v_event_external_reference::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_org_id := NULL;
    END;
  END IF;

  IF v_org_id IS NULL AND v_subscription_id IS NOT NULL THEN
    SELECT organization_id INTO v_org_id
    FROM public.organization_entitlements
    WHERE asaas_subscription_id = v_subscription_id;
  END IF;

  IF v_org_id IS NULL AND v_customer_id IS NOT NULL THEN
    SELECT organization_id INTO v_org_id
    FROM public.organization_entitlements
    WHERE asaas_customer_id = v_customer_id;
  END IF;

  IF v_org_id IS NULL AND v_checkout_id IS NOT NULL THEN
    SELECT organization_id INTO v_org_id
    FROM public.organization_entitlements
    WHERE asaas_checkout_id = v_checkout_id;
  END IF;

  IF v_payment_id IS NOT NULL THEN
    v_status := coalesce(v_payment->>'status', p_event_type);
    v_due_date := nullif(v_payment->>'dueDate', '')::date;
    INSERT INTO public.billing_payments(
      asaas_payment_id, asaas_subscription_id, asaas_customer_id,
      organization_id, status, value, billing_type, due_date, paid_at,
      invoice_url, payload, updated_at
    ) VALUES (
      v_payment_id, v_subscription_id, v_customer_id, v_org_id, v_status,
      nullif(v_payment->>'value', '')::numeric,
      nullif(v_payment->>'billingType', ''), v_due_date,
      CASE WHEN nullif(v_payment->>'paymentDate', '') IS NULL THEN NULL
        ELSE (v_payment->>'paymentDate')::timestamptz END,
      nullif(v_payment->>'invoiceUrl', ''), v_payment, now()
    )
    ON CONFLICT (asaas_payment_id) DO UPDATE SET
      asaas_subscription_id = excluded.asaas_subscription_id,
      asaas_customer_id = excluded.asaas_customer_id,
      organization_id = coalesce(excluded.organization_id, billing_payments.organization_id),
      status = excluded.status,
      value = excluded.value,
      billing_type = excluded.billing_type,
      due_date = excluded.due_date,
      paid_at = excluded.paid_at,
      invoice_url = excluded.invoice_url,
      payload = excluded.payload,
      updated_at = now();
  END IF;

  IF v_org_id IS NOT NULL AND v_subscription_id IS NOT NULL
    AND p_event_type IN ('SUBSCRIPTION_CREATED', 'SUBSCRIPTION_UPDATED') THEN
    UPDATE public.organization_entitlements
    SET asaas_subscription_id = v_subscription_id,
        asaas_customer_id = coalesce(v_customer_id, asaas_customer_id),
        payment_method = coalesce(v_subscription->>'billingType', payment_method),
        current_period_end = nullif(v_subscription->>'nextDueDate', '')::timestamptz,
        updated_at = now()
    WHERE organization_id = v_org_id;
  END IF;

  IF v_org_id IS NULL AND v_event_external_reference IS NOT NULL THEN
    SELECT organization_id INTO v_org_id
    FROM public.organization_entitlements
    WHERE organization_id::text = v_event_external_reference;
  END IF;

  IF v_org_id IS NOT NULL AND p_event_type IN ('CHECKOUT_PAID', 'PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED') THEN
    UPDATE public.organization_entitlements
    SET status = 'active', payment_confirmed = true,
        payment_method = coalesce(v_payment->>'billingType', payment_method),
        current_period_end = CASE WHEN v_due_date IS NULL THEN current_period_end
          ELSE (v_due_date + interval '1 month')::timestamptz END,
        grace_until = NULL, updated_at = now()
    WHERE organization_id = v_org_id;
  ELSIF v_org_id IS NOT NULL AND p_event_type IN ('CHECKOUT_CANCELED', 'CHECKOUT_EXPIRED') THEN
    UPDATE public.organization_entitlements
    SET status = CASE WHEN payment_confirmed THEN status ELSE 'base' END,
        asaas_checkout_id = NULL, updated_at = now()
    WHERE organization_id = v_org_id;
  ELSIF v_org_id IS NOT NULL AND p_event_type IN ('PAYMENT_OVERDUE') THEN
    UPDATE public.organization_entitlements
    SET status = 'past_due', payment_confirmed = false,
        grace_until = now() + make_interval(days => greatest(coalesce(p_grace_days, 7), 0)),
        updated_at = now()
    WHERE organization_id = v_org_id;
  ELSIF v_org_id IS NOT NULL AND p_event_type IN (
    'PAYMENT_REFUNDED', 'PAYMENT_PARTIALLY_REFUNDED',
    'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_CHARGEBACK_DISPUTE',
    'PAYMENT_AWAITING_CHARGEBACK_REVERSAL'
  ) THEN
    UPDATE public.organization_entitlements
    SET status = 'canceled', payment_confirmed = false, grace_until = NULL, updated_at = now()
    WHERE organization_id = v_org_id;
  ELSIF v_org_id IS NOT NULL AND p_event_type IN ('SUBSCRIPTION_INACTIVATED', 'SUBSCRIPTION_DELETED') THEN
    UPDATE public.organization_entitlements
    SET status = 'canceled', payment_confirmed = false, grace_until = NULL, updated_at = now()
    WHERE organization_id = v_org_id;
  END IF;

  UPDATE public.billing_events
  SET organization_id = v_org_id, processed_at = now(), error = NULL,
      payload = coalesce(p_payload, '{}'::jsonb)
  WHERE provider_event_id = p_event_id;

  RETURN jsonb_build_object('duplicate', false, 'organization_id', v_org_id);
END;
$$;

REVOKE ALL ON FUNCTION public.process_asaas_webhook(text, text, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_asaas_webhook(text, text, jsonb, integer) TO service_role;

COMMIT;
