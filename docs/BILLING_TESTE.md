# Roteiro de teste no sandbox

1. Configure as variáveis sem usar valores de produção.
2. Como owner/admin, abra Upgrade e crie uma assinatura; confirme que o segundo clique não duplica assinatura ativa.
3. Simule ou receba os eventos `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_REFUNDED`, `PAYMENT_CHARGEBACK_REQUESTED`, `SUBSCRIPTION_INACTIVATED` e `SUBSCRIPTION_DELETED` e verifique o status em `organization_entitlements`.
4. Envie o mesmo evento duas vezes e confirme que `billing_events.provider_event_id` impede processamento duplicado.
5. Envie token incorreto e confirme HTTP 401.
6. Acesse como usuário sem owner/admin e confirme HTTP 403 em `/api/billing/checkout`.
7. Confirme que uma organização legada sem billing continua acessando o dashboard.
