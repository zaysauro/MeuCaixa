const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')

const asaas = fs.readFileSync('src/lib/billing/asaas.ts', 'utf8')
const checkout = fs.readFileSync('src/app/api/billing/checkout/route.ts', 'utf8')

test('cartao usa exclusivamente hosted checkout recorrente', () => {
  assert.match(asaas, /billingTypes: \["CREDIT_CARD"\]/)
  assert.match(asaas, /chargeTypes: \["RECURRENT"\]/)
  assert.match(asaas, /cycle: "MONTHLY"/)
  assert.match(checkout, /paymentMethod === "CREDIT_CARD"/)
})

test('pix e boleto usam assinatura direta', () => {
  assert.match(asaas, /createDirectSubscription/)
  assert.match(asaas, /billingType: input\.billingType/)
  assert.match(checkout, /paymentMethod !== "CREDIT_CARD"/)
  assert.match(checkout, /getPixQrCode/)
  assert.match(checkout, /firstPayment\.invoiceUrl \|\| firstPayment\.bankSlipUrl/)
  assert.doesNotMatch(checkout, /billingTypes: \["CREDIT_CARD", "PIX"\]/)
})

test('preco e quantidade de filiais sao calculados no backend', () => {
  assert.match(asaas, /calculateMonthlyPriceCents/)
  assert.match(checkout, /organization\.billing_branch_count/)
  assert.match(checkout, /organization\.base_monthly_price/)
  assert.match(checkout, /organization\.additional_branch_price/)
  assert.match(checkout, /value: monthlyPrice/)
  assert.doesNotMatch(checkout, /value: body\.value/)
})

test('documento invalido bloqueia Asaas antes da requisicao', () => {
  assert.match(asaas, /isValidCpfCnpj/)
  assert.match(checkout, /paymentMethod !== "CREDIT_CARD" && !isValidCpfCnpj\(cpfCnpj\)/)
})

test('idempotencia e recuperacao de IDs externos sao persistentes', () => {
  assert.match(checkout, /billing_attempts/)
  assert.match(checkout, /idempotencyKey/)
  assert.match(checkout, /asaas_checkout_id/)
  assert.match(checkout, /asaas_subscription_id/)
  assert.match(checkout, /asaas_payment_id/)
  assert.match(checkout, /findAsaasSubscription/)
})

test('criacao da cobranca nao confirma entitlement', () => {
  assert.match(checkout, /payment_confirmed: false/)
  assert.match(checkout, /status: "pending"/)
})
