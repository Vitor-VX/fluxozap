import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SALE_NOTIFICATION_CURSOR_OVERLAP_MS,
  saleNotificationQueryAfter,
} from '../src/services/saleNotificationCursor';

test('aplica sobreposição ao cursor para tolerar diferença de relógio e replicação', () => {
  const cursor = '2026-10-22T18:34:42.564Z';
  const queryAfter = saleNotificationQueryAfter(cursor);
  assert.equal(
    queryAfter.getTime(),
    new Date(cursor).getTime() - SALE_NOTIFICATION_CURSOR_OVERLAP_MS
  );
});

test('rejeita cursor inválido', () => {
  assert.throws(() => saleNotificationQueryAfter('não-é-data'), /Cursor de notificação inválido/);
});
