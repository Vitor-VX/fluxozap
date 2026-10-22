import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSaleNotificationTestSignature,
  verifySaleNotificationTestSignature,
} from '../src/services/saleNotificationTestAuth';

test('aceita assinatura válida e recente para o disparo de teste', () => {
  const now = 1_792_704_000_000;
  const timestamp = String(now);
  const signature = createSaleNotificationTestSignature('segredo', timestamp, 'pagamento-1');
  assert.equal(verifySaleNotificationTestSignature('segredo', timestamp, 'pagamento-1', signature, now), true);
});

test('rejeita assinatura adulterada ou expirada', () => {
  const now = 1_792_704_000_000;
  const timestamp = String(now - 120_000);
  const signature = createSaleNotificationTestSignature('segredo', timestamp, 'pagamento-1');
  assert.equal(verifySaleNotificationTestSignature('segredo', timestamp, 'pagamento-1', signature, now), false);
  assert.equal(verifySaleNotificationTestSignature('segredo', String(now), 'pagamento-2', signature, now), false);
});
