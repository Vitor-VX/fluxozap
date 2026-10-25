export interface WhatsAppBlockUsersPayload {
  messaging_product: 'whatsapp';
  block_users: Array<{ user: string }>;
}

export function normalizeWhatsAppUser(value: unknown): string {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) {
    throw new Error('O número do contato deve conter entre 8 e 15 dígitos.');
  }
  return `+${digits}`;
}

export function buildWhatsAppBlockUsersPayload(value: unknown): WhatsAppBlockUsersPayload {
  return {
    messaging_product: 'whatsapp',
    block_users: [{ user: normalizeWhatsAppUser(value) }],
  };
}

export function isValidWhatsAppRegistrationPin(value: unknown): boolean {
  return /^\d{6}$/.test(String(value || '').trim());
}
