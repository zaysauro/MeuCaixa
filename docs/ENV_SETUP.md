# Configuração de ambiente

## Supabase

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

`SUPABASE_SERVICE_ROLE_KEY` é usado apenas por rotas server-side. Nunca use o
prefixo `NEXT_PUBLIC_` nessa variável e nunca a envie para o navegador.

## Asaas Sandbox

```env
ASAAS_ENV=sandbox
ASAAS_BASE_URL=https://api-sandbox.asaas.com/v3
ASAAS_API_KEY=<sandbox-api-key>
ASAAS_WEBHOOK_TOKEN=<32-255-character-random-token>
BILLING_GRACE_DAYS=7
```

Configure essas variáveis na Vercel como secrets. O endpoint do webhook é:

`https://meucaixa.sistemakumo.com.br/api/webhooks/asaas`

Use `https://api.asaas.com/v3` somente quando a conta e o webhook de produção
estiverem liberados. A API key do Asaas e o token do webhook são diferentes.

## URLs públicas

```env
NEXT_PUBLIC_SITE_URL=https://meucaixa.sistemakumo.com.br
```

Mantenha variáveis locais em `.env.local`, que não é versionado.
