import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { MongoClient, type Collection } from 'mongodb';
import { buildDurableSessionPersistenceUpdate } from '../../src/services/durableSessionScheduler';
import { DURABLE_SCHEDULER_VERSION } from '../../src/services/durableSessionScheduler';
import { mergeLegacyAndMongoSessions, type MigratableSession } from '../../src/services/legacySessionMigration';

const SOURCE_DATABASE = 'FluxoZap';
const TEST_DATABASE_PREFIX = 'FZ_MIG_';

function readMongoUri(): string {
  if (process.env.MONGODB_URI?.trim()) return process.env.MONGODB_URI.trim();
  const config = JSON.parse(readFileSync(new URL('../../data/mongo_config.json', import.meta.url), 'utf8'));
  return String(config.uri || '').trim();
}

function readLegacySessions(): MigratableSession[] {
  try {
    const parsed = JSON.parse(readFileSync(new URL('../../data/sessions.json', import.meta.url), 'utf8'));
    return Object.values(parsed)
      .filter((item: any) => item?.phoneNumber)
      .map((item: any) => ({ ...item, accountId: item.accountId || 'unassigned' })) as MigratableSession[];
  } catch (error: any) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

function key(session: MigratableSession): string {
  return `${session.accountId || 'unassigned'}::${session.phoneNumber}`;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, item]) => `${JSON.stringify(name)}:${canonical(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

async function bulkPersist(collection: Collection, sessions: MigratableSession[]) {
  if (!sessions.length) return;
  await collection.bulkWrite(sessions.map((session) => ({
    updateOne: {
      filter: { accountId: session.accountId, phoneNumber: session.phoneNumber },
      update: buildDurableSessionPersistenceUpdate(session),
      upsert: true,
    },
  })), { ordered: false });
}

test('ensaia a migração das sessões atuais sem alterar o banco FluxoZap', async (t) => {
  const uri = readMongoUri();
  assert.ok(uri, 'MONGODB_URI não configurada para o ensaio isolado.');

  const databaseName = `${TEST_DATABASE_PREFIX}${Date.now().toString(36)}_${process.pid}`;
  assert.ok(databaseName.startsWith(TEST_DATABASE_PREFIX));
  let client = new MongoClient(uri, { serverSelectionTimeoutMS: 8_000, connectTimeoutMS: 10_000 });

  try {
    await client.connect();
    const sourceDocuments = await client.db(SOURCE_DATABASE).collection('sessions')
      .find({}, { projection: { data: 1, _id: 0 } })
      .toArray();
    const mongoSessions = sourceDocuments.map((document: any) => document.data)
      .filter((session: any) => session?.phoneNumber) as MigratableSession[];
    const legacySessions = readLegacySessions();
    const merged = mergeLegacyAndMongoSessions(mongoSessions, legacySessions);
    const expectedByKey = new Map(merged.sessions.map((session) => [key(session), session]));

    const collection = client.db(databaseName).collection('sessions');
    await collection.createIndex({ accountId: 1, phoneNumber: 1 }, { unique: true });
    await collection.createIndex(
      { schedulerStatus: 1, schedulerVersion: 1, waitingUntil: 1, leaseUntil: 1 },
      { partialFilterExpression: { schedulerStatus: 'waiting' } }
    );
    await bulkPersist(collection, merged.sessions);

    // Reconnect to ensure the verification does not depend on the original
    // process memory or an open cursor.
    await client.close();
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 8_000, connectTimeoutMS: 10_000 });
    await client.connect();
    const restoredCollection = client.db(databaseName).collection('sessions');
    const restoredDocuments = await restoredCollection.find({}).toArray();
    assert.equal(restoredDocuments.length, expectedByKey.size);

    let activeOrWaiting = 0;
    let indexedWaits = 0;
    for (const document of restoredDocuments) {
      const restored = document.data as MigratableSession & Record<string, any>;
      const expected = expectedByKey.get(key(restored));
      assert.ok(expected, 'A migração criou uma sessão que não existia nas fontes.');
      assert.equal(canonical(restored), canonical(expected), `Conteúdo divergente para ${key(restored)}`);

      if (restored.waitingForInput || (restored.waitingUntil && restored.waitingKind) || (restored.currentNodeId && !restored.flowCompleted)) {
        activeOrWaiting += 1;
      }
      const shouldBeIndexed = Boolean(
        !restored.botPaused && restored.waitingUntil && restored.waitingKind && restored.waitingNodeId
        && restored.executionCheckpointVersion === DURABLE_SCHEDULER_VERSION
      );
      assert.equal(document.schedulerStatus === 'waiting', shouldBeIndexed);
      if (shouldBeIndexed) indexedWaits += 1;
    }

    // Run the exact same migration again: unique keys and upserts must keep
    // the document count and content unchanged.
    await bulkPersist(restoredCollection, merged.sessions);
    assert.equal(await restoredCollection.countDocuments(), expectedByKey.size);
    const secondPass = await restoredCollection.find({}).toArray();
    for (const document of secondPass) {
      const restored = document.data as MigratableSession;
      assert.equal(canonical(restored), canonical(expectedByKey.get(key(restored))));
    }

    const indexExplain = await restoredCollection.find({
      schedulerStatus: 'waiting',
      schedulerVersion: DURABLE_SCHEDULER_VERSION,
      waitingUntil: { $lte: new Date('2999-01-01T00:00:00.000Z') },
      leaseUntil: { $lte: new Date('2999-01-01T00:00:00.000Z') },
    }).limit(1).explain('executionStats');
    assert.ok(JSON.stringify(indexExplain.queryPlanner?.winningPlan || {}).includes('IXSCAN'));

    t.diagnostic(JSON.stringify({
      sourceDatabaseReadOnly: SOURCE_DATABASE,
      sourceMongoSessions: mongoSessions.length,
      legacyBackupSessions: legacySessions.length,
      resultingSessions: expectedByKey.size,
      importedOrUpdatedFromLegacy: merged.importedLegacyCount,
      activeOrWaitingSessionsPreserved: activeOrWaiting,
      indexedDurableWaits: indexedWaits,
      secondMigrationPassDocumentCount: secondPass.length,
      temporaryDatabase: 'removed',
    }, null, 2));
  } finally {
    try {
      await client.connect();
      assert.ok(databaseName.startsWith(TEST_DATABASE_PREFIX));
      await client.db(databaseName).dropDatabase();
    } finally {
      await client.close();
    }
  }
});
