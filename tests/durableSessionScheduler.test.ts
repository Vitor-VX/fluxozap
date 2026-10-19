import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDurableSessionPersistenceUpdate,
  DURABLE_SCHEDULER_VERSION,
  RELEASED_SESSION_LEASE,
  SESSION_WAITING_STATUS,
} from '../src/services/durableSessionScheduler';

test('persiste o agendamento no próprio documento da sessão', () => {
  const update = buildDurableSessionPersistenceUpdate({
    accountId: 'account-1',
    phoneNumber: '5511999999999',
    waitingUntil: '2026-10-19T12:00:00.000Z',
    waitingKind: 'reply_timeout',
    waitingNodeId: 'wait-node',
    waitingNextNodeId: 'timeout-node',
    executionCheckpointVersion: DURABLE_SCHEDULER_VERSION,
  });

  assert.equal(update.$set?.schedulerStatus, SESSION_WAITING_STATUS);
  assert.equal(update.$set?.schedulerVersion, DURABLE_SCHEDULER_VERSION);
  assert.deepEqual(update.$set?.waitingUntil, new Date('2026-10-19T12:00:00.000Z'));
  assert.deepEqual(update.$set?.leaseUntil, RELEASED_SESSION_LEASE);
  assert.equal(update.$unset, undefined);
});

test('não indexa espera criada pela versão antiga que causou o disparo em massa', () => {
  const update = buildDurableSessionPersistenceUpdate({
    accountId: 'account-1', phoneNumber: '5511999999999',
    waitingUntil: '2026-10-19T12:00:00.000Z', waitingKind: 'reply_timeout',
    waitingNodeId: 'wait-node', executionCheckpointVersion: 1,
  });
  assert.equal(update.$set?.schedulerStatus, undefined);
  assert.ok(update.$unset?.schedulerStatus !== undefined);
  assert.ok(update.$unset?.schedulerVersion !== undefined);
});

test('ao concluir a espera remove os metadados temporários sem apagar a sessão', () => {
  const update = buildDurableSessionPersistenceUpdate({
    accountId: 'account-1',
    phoneNumber: '5511999999999',
  });

  assert.equal(update.$set?.accountId, 'account-1');
  assert.equal(update.$set?.phoneNumber, '5511999999999');
  assert.ok(update.$set?.data);
  assert.ok(update.$unset?.schedulerStatus !== undefined);
  assert.ok(update.$unset?.leaseOwner !== undefined);
  assert.ok(update.$unset?.leaseUntil !== undefined);
});
