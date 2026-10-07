const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')

const asaas = fs.readFileSync('src/lib/billing/asaas.ts', 'utf8')
const checkout = fs.readFileSync('src/app/api/billing/checkout/route.ts', 'utf8')
const service = fs.readFileSync('src/lib/billing/checkout-service.ts', 'utf8')
const signup = fs.readFileSync('src/app/api/billing/subscribe-signup/route.ts', 'utf8')

test('cartao usa exclusivamente hosted checkout recorrente', () => {
  assert.match(asaas, /billingTypes: \["CREDIT_CARD"\]/)
  assert.match(asaas, /chargeTypes: \["RECURRENT"\]/)
  assert.match(asaas, /cycle: "MONTHLY"/)
  assert.match(service, /paymentMethod === "CREDIT_CARD"/)
})

test('pix e boleto usam assinatura direta', () => {
  assert.match(asaas, /createDirectSubscription/)
  assert.match(asaas, /billingType: input\.billingType/)
  assert.match(checkout, /paymentMethod !== "CREDIT_CARD"/)
  assert.match(service, /getPixQrCode/)
  assert.match(service, /firstPayment\.invoiceUrl \|\| firstPayment\.bankSlipUrl/)
  assert.doesNotMatch(service, /billingTypes: \["CREDIT_CARD", "PIX"\]/)
})

test('preco e quantidade de filiais sao calculados no backend', () => {
  assert.match(asaas, /calculateMonthlyPriceCents/)
  assert.match(service, /organization\.billing_branch_count/)
  assert.match(service, /organization\.base_monthly_price/)
  assert.match(service, /organization\.additional_branch_price/)
  assert.match(service, /value: monthlyPrice/)
  assert.doesNotMatch(checkout, /value: body\.value/)
})

test('documento invalido bloqueia Asaas antes da requisicao', () => {
  assert.match(asaas, /isValidCpfCnpj/)
  assert.match(checkout, /paymentMethod !== "CREDIT_CARD" && !isValidCpfCnpj\(cpfCnpj\)/)
})

test('idempotencia e recuperacao de IDs externos sao persistentes', () => {
  assert.match(service, /billing_attempts/)
  assert.match(service, /idempotencyKey/)
  assert.match(service, /asaas_checkout_id/)
  assert.match(service, /asaas_subscription_id/)
  assert.match(service, /asaas_payment_id/)
  assert.match(service, /findAsaasSubscription/)
})

test('criacao da cobranca nao confirma entitlement', () => {
  assert.match(service, /payment_confirmed: false/)
  assert.match(service, /status: "pending"/)
})

test('signup publico compartilha o mesmo servico financeiro', () => {
  assert.match(signup, /startOrganizationBilling/)
  assert.match(signup, /paymentMethod/)
  assert.match(signup, /idempotencyKey/)
  assert.doesNotMatch(signup, /createRecurringCheckout/)
})

test('signup suporta as tres modalidades e resposta discriminada', () => {
  assert.match(signup, /CREDIT_CARD/)
  assert.match(signup, /PIX/)
  assert.match(signup, /BOLETO/)
  assert.match(service, /checkoutUrl/)
  assert.match(service, /invoiceUrl/)
  assert.match(service, /pix/)
})

test('upgrade e signup apontam para o mesmo servico', () => {
  assert.match(checkout, /startOrganizationBilling/)
  assert.match(signup, /startOrganizationBilling/)
})
