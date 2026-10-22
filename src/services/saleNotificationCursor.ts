export const SALE_NOTIFICATION_CURSOR_OVERLAP_MS = 15_000;

export function saleNotificationQueryAfter(afterIso: string): Date {
  const timestamp = new Date(afterIso).getTime();
  if (!Number.isFinite(timestamp)) throw new Error('Cursor de notificação inválido.');
  return new Date(timestamp - SALE_NOTIFICATION_CURSOR_OVERLAP_MS);
}
