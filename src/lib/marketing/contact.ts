const digitsOnly = (value: string | undefined) => value?.replace(/\D/g, "") ?? "";

export const CONTACT_MESSAGES = {
  hire: "Olá! Quero contratar o MeuCaixa por R$ 59,90/mês.",
  trial: "Olá! Ainda estou na dúvida e quero solicitar um teste grátis do MeuCaixa.",
} as const;

export const marketingContact = {
  whatsappNumber: digitsOnly(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER),
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() ?? "",
};

export function whatsappLink(message: string) {
  if (!marketingContact.whatsappNumber) return "#contato";
  return `https://wa.me/${marketingContact.whatsappNumber}?text=${encodeURIComponent(message)}`;
}

export function emailLink(message: string) {
  if (!marketingContact.email) return "#contato";
  return `mailto:${marketingContact.email}?subject=${encodeURIComponent(message)}`;
}

export function contactFallback(message: string) {
  return marketingContact.whatsappNumber
    ? whatsappLink(message)
    : marketingContact.email
      ? emailLink(message)
      : "#contato";
}
