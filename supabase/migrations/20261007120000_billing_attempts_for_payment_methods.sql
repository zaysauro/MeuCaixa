BEGIN;

CREATE TABLE IF NOT EXISTS public.billing_attempts (
  idempotency_key uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  payment_method text NOT NULL CHECK (payment_method IN ('CREDIT_CARD', 'PIX', 'BOLETO')),
  status text NOT NULL CHECK (status IN ('processing', 'payment_created', 'completed', 'failed')),
  asaas_customer_id text,
  asaas_subscription_id text,
  asaas_checkout_id text,
  asaas_payment_id text,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_attempts_org_idx ON public.billing_attempts (organization_id, created_at DESC);
ALTER TABLE public.billing_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_attempts FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.billing_attempts TO service_role;

COMMIT;
