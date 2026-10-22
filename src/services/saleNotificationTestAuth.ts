import crypto from 'node:crypto';

export function createSaleNotificationTestSignature(
  secret: string,
  timestamp: string,
  externalId: string
): string {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${externalId}`).digest('hex');
}

export function verifySaleNotificationTestSignature(
  secret: string,
  timestamp: string,
  externalId: string,
  signature: string,
  now = Date.now(),
  maxAgeMs = 60_000
): boolean {
  const requestedAt = Number(timestamp);
  if (!secret || !signature || !Number.isFinite(requestedAt) || Math.abs(now - requestedAt) > maxAgeMs) return false;
  const expected = createSaleNotificationTestSignature(secret, timestamp, externalId);
  const receivedBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return receivedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}
