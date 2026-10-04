# Billing com Asaas

## Etapa A: link recorrente

Crie no painel do Asaas um Link de Pagamento recorrente mensal de R$ 79,99 com `UNDEFINED` para permitir Pix, boleto ou cartão. Configure a URL em `NEXT_PUBLIC_ASAAS_CHECKOUT_URL`. Depois do pagamento, oriente o cliente a falar com a Kumo para receber o acesso enquanto `BILLING_ENABLED=false`.

## Etapa B: integração

No ambiente escolhido, configure `ASAAS_API_KEY`, `ASAAS_ENV` (`sandbox` ou `production`), `ASAAS_WEBHOOK_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `BILLING_ENABLED=true` e `BILLING_GRACE_DAYS`. Nunca exponha as três primeiras variáveis server-side ou faça commit dos valores.

No painel do Asaas, crie um webhook para `https://SEU-DOMINIO/api/webhooks/asaas`, usando o token configurado e os eventos `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_REFUNDED`, `PAYMENT_PARTIALLY_REFUNDED`, `PAYMENT_CHARGEBACK_REQUESTED`, `PAYMENT_CHARGEBACK_DISPUTE`, `SUBSCRIPTION_INACTIVATED` e `SUBSCRIPTION_DELETED`. A integração grava o ID do evento para ignorar reenvios.

A criação de assinatura não confirma pagamento. O acesso ativo depende do webhook; clientes legados sem assinatura continuam preservados. Use o sandbox primeiro e só altere `ASAAS_ENV` e a chave após validar o fluxo.
