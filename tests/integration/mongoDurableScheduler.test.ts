import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { calculateObjectSize } from 'bson';
import { MongoClient, type Collection, type Document } from 'mongodb';
import {
  claimDueSessionBatch,
  RELEASED_SESSION_LEASE,
  SESSION_WAITING_STATUS,
} from '../../src/services/durableSessionScheduler';

const TEST_DATABASE_PREFIX = 'FZ_DST_';

function readMongoUri(): string {
  if (process.env.MONGODB_URI?.trim()) return process.env.MONGODB_URI.trim();
  const config = JSON.parse(readFileSync(new URL('../../data/mongo_config.json', import.meta.url), 'utf8'));
  return String(config.uri || '').trim();
}

function waitingFields(dueAt: Date) {
  return {
    schedulerStatus: SESSION_WAITING_STATUS,
    waitingUntil: dueAt,
    waitingKind: 'reply_timeout',
    waitingNodeId: 'wait-node',
    waitingNextNodeId: 'timeout-node',
    leaseUntil: RELEASED_SESSION_LEASE,
  };
}

async function claimDueSession(
  collection: Collection,
  workerId: string,
  now: Date,
  leaseMs = 30_000
) {
  return collection.findOneAndUpdate(
    {
      schedulerStatus: SESSION_WAITING_STATUS,
      waitingUntil: { $lte: now },
      leaseUntil: { $lte: now },
    },
    {
      $set: {
        leaseOwner: workerId,
        leaseUntil: new Date(now.getTime() + leaseMs),
      },
      $inc: { resumeAttempts: 1 },
    },
    { sort: { waitingUntil: 1 }, returnDocument: 'after' }
  );
}

function logicalStorageComparison(totalSessions: number, waitingSessions: number) {
  let baselineBytes = 0;
  let embeddedBytes = 0;
  let separateJobBytes = 0;
  const dueAt = new Date('2026-10-19T12:00:00.000Z');

  for (let index = 0; index < totalSessions; index += 1) {
    const base = {
      accountId: `account-${index % 20}`,
      phoneNumber: `55${String(index).padStart(10, '0')}`,
      data: {
        currentNodeId: 'current-node',
        waitingForInput: false,
        variables: { name: `Cliente ${index}`, source: 'benchmark' },
      },
    };
    baselineBytes += calculateObjectSize(base);
    embeddedBytes += calculateObjectSize(index < waitingSessions ? { ...base, ...waitingFields(dueAt) } : base);
    if (index < waitingSessions) {
      separateJobBytes += calculateObjectSize({
        accountId: base.accountId,
        phoneNumber: base.phoneNumber,
        ...waitingFields(dueAt),
      });
    }
  }

  return {
    baselineBytes,
    embeddedSchedulerExtraBytes: embeddedBytes - baselineBytes,
    separateJobsExtraBytes: separateJobBytes,
  };
}

test('Mongo restaura, disputa e recicla esperas sem criar um job permanente por contato', async (t) => {
  const uri = readMongoUri();
  assert.ok(uri, 'MONGODB_URI não configurada para o teste isolado.');

  const databaseName = `${TEST_DATABASE_PREFIX}${Date.now()}_${process.pid}`;
  assert.ok(databaseName.startsWith(TEST_DATABASE_PREFIX));
  let client = new MongoClient(uri, { serverSelectionTimeoutMS: 8_000, connectTimeoutMS: 10_000 });
  const benchmark: Record<string, unknown> = {};

  try {
    await client.connect();
    let collection = client.db(databaseName).collection('sessions');
    await collection.createIndex({ accountId: 1, phoneNumber: 1 }, { unique: true });
    await collection.createIndex(
      { schedulerStatus: 1, waitingUntil: 1, leaseUntil: 1 },
      { partialFilterExpression: { schedulerStatus: SESSION_WAITING_STATUS } }
    );

    const sessionCount = 5_000;
    const waitingCount = 1_000;
    const now = new Date('2026-10-19T12:00:00.000Z');
    const documents = Array.from({ length: sessionCount }, (_, index) => ({
      accountId: `account-${index % 20}`,
      phoneNumber: `55${String(index).padStart(10, '0')}`,
      data: {
        currentNodeId: index < waitingCount ? 'wait-node' : 'active-node',
        waitingForInput: index < waitingCount,
        variables: { name: `Cliente ${index}`, source: 'restart-test' },
      },
      ...(index < waitingCount ? waitingFields(new Date(now.getTime() - 1_000 + index)) : {}),
    }));

    const insertStartedAt = performance.now();
    await collection.insertMany(documents, { ordered: false });
    benchmark.insertMs = Number((performance.now() - insertStartedAt).toFixed(2));

    // Simulate a real process restart: close every connection and rebuild the
    // client before reading or claiming the checkpoint.
    await client.close();
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 8_000, connectTimeoutMS: 10_000 });
    await client.connect();
    collection = client.db(databaseName).collection('sessions');

    const restored = await collection.findOne({ accountId: 'account-0', phoneNumber: '550000000000' });
    assert.equal(restored?.schedulerStatus, SESSION_WAITING_STATUS);
    assert.equal(restored?.waitingNodeId, 'wait-node');

    // Two instances racing for the exact same due session: the lease permits
    // only one winner.
    const raceFilter = { accountId: restored?.accountId, phoneNumber: restored?.phoneNumber };
    const raceClaim = (workerId: string) => collection.findOneAndUpdate(
      {
        ...raceFilter,
        schedulerStatus: SESSION_WAITING_STATUS,
        waitingUntil: { $lte: now },
        leaseUntil: { $lte: now },
      },
      {
        $set: { leaseOwner: workerId, leaseUntil: new Date(now.getTime() + 30_000) },
        $inc: { resumeAttempts: 1 },
      },
      { returnDocument: 'after' }
    );
    const race = await Promise.all([raceClaim('worker-a'), raceClaim('worker-b')]);
    assert.equal(race.filter(Boolean).length, 1);

    // A crashed worker's lease expires and a new instance can reclaim it.
    const reclaimed = await claimDueSession(collection, 'worker-after-restart', new Date(now.getTime() + 31_000));
    assert.ok(reclaimed);

    // Completion removes only temporary scheduler metadata. The existing
    // session remains; there is no permanent job document to accumulate.
    await collection.updateOne(
      { _id: reclaimed!._id, leaseOwner: 'worker-after-restart' },
      {
        $unset: {
          schedulerStatus: '', waitingUntil: '', waitingKind: '', waitingNodeId: '',
          waitingNextNodeId: '', leaseOwner: '', leaseUntil: '', resumeAttempts: '',
        },
      }
    );
    const completed = await collection.findOne({ _id: reclaimed!._id });
    assert.ok(completed);
    assert.equal(completed?.schedulerStatus, undefined);

    const claimStartedAt = performance.now();
    let claimed = 0;
    for (;;) {
      const batch = await claimDueSessionBatch(
        collection,
        `batch-worker-${Math.floor(claimed / 100)}`,
        new Date(now.getTime() + 60_000)
      );
      if (!batch.length) break;
      claimed += batch.length;
    }
    benchmark.claimedSessions = claimed;
    benchmark.claimMs = Number((performance.now() - claimStartedAt).toFixed(2));
    benchmark.claimsPerSecond = Math.round(claimed / ((benchmark.claimMs as number) / 1000));

    const explain = await collection.find({
      schedulerStatus: SESSION_WAITING_STATUS,
      waitingUntil: { $lte: new Date(now.getTime() + 60_000) },
      leaseUntil: { $lte: new Date(now.getTime() + 60_000) },
    }).limit(1).explain('executionStats') as Document;
    benchmark.queryWinningPlan = JSON.stringify(explain.queryPlanner?.winningPlan || {}).includes('IXSCAN')
      ? 'IXSCAN'
      : 'CHECK_EXPLAIN';

    const sizes = logicalStorageComparison(100_000, 10_000);
    benchmark.logicalStorageAt100kContacts = {
      waitingContacts: 10_000,
      schedulerEmbeddedMb: Number((sizes.embeddedSchedulerExtraBytes / 1024 / 1024).toFixed(2)),
      separateJobsMb: Number((sizes.separateJobsExtraBytes / 1024 / 1024).toFixed(2)),
      savedByEmbeddingMb: Number(((sizes.separateJobsExtraBytes - sizes.embeddedSchedulerExtraBytes) / 1024 / 1024).toFixed(2)),
    };

    t.diagnostic(JSON.stringify({ database: 'isolated-and-removed', ...benchmark }, null, 2));
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
