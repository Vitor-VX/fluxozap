import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeLegacyAndMongoSessions } from '../src/services/legacySessionMigration';

test('importa do JSON legado uma sessão em andamento que ainda não existe no Mongo', () => {
  const waiting = {
    accountId: 'line-1', phoneNumber: '5511', updatedAt: '2026-10-19T10:00:00.000Z',
    currentNodeId: 'wait-node', waitingForInput: true,
    waitingUntil: '2026-10-19T11:00:00.000Z', waitingKind: 'reply_timeout',
  };
  const result = mergeLegacyAndMongoSessions([], [waiting]);
  assert.equal(result.importedLegacyCount, 1);
  assert.deepEqual(result.sessions[0], waiting);
});

test('mantém a cópia mais nova sem misturar linhas do WhatsApp', () => {
  const mongo = [
    { accountId: 'line-1', phoneNumber: '5511', updatedAt: '2026-10-19T12:00:00.000Z', currentNodeId: 'mongo-new' },
    { accountId: 'line-2', phoneNumber: '5511', updatedAt: '2026-10-19T09:00:00.000Z', currentNodeId: 'other-line' },
  ];
  const legacy = [
    { accountId: 'line-1', phoneNumber: '5511', updatedAt: '2026-10-19T10:00:00.000Z', currentNodeId: 'legacy-old' },
  ];
  const result = mergeLegacyAndMongoSessions(mongo, legacy);
  assert.equal(result.sessions.length, 2);
  assert.equal(result.importedLegacyCount, 0);
  assert.equal(result.sessions.find((item) => item.accountId === 'line-1')?.currentNodeId, 'mongo-new');
  assert.equal(result.sessions.find((item) => item.accountId === 'line-2')?.currentNodeId, 'other-line');
});
