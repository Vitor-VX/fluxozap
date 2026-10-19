import assert from 'node:assert/strict';
import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { FlowExecutionCoordinator, resolvePaymentBranchTarget } from '../../src/services/flowExecutionRuntime';

function elapsed(start: number): number {
  return performance.now() - start;
}

async function main() {
  const iterations = 100_000;
  const edges = [
    { source: 'payment', sourceHandle: 'generated', target: 'instructions' },
    { source: 'payment', sourceHandle: 'paid', target: 'delivery' },
    { source: 'payment', sourceHandle: 'error', target: 'support' },
    { source: 'payment', sourceHandle: 'expired', target: 'retry' },
  ];

  let start = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    assert.equal(resolvePaymentBranchTarget(undefined, 'paid', edges, 'payment'), 'delivery');
  }
  const routingMs = elapsed(start);

  const coordinator = new FlowExecutionCoordinator();
  const sessions = 20_000;
  start = performance.now();
  const executions = await Promise.all(Array.from({ length: sessions }, (_, index) => (
    coordinator.tryRunExclusive(`account-${index % 20}::phone-${index}`, async () => index)
  )));
  const coordinatorMs = elapsed(start);
  assert.equal(executions.filter((result) => result.executed).length, sessions);

  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  const first = coordinator.tryRunExclusive('hot-session', async () => hold);
  start = performance.now();
  const duplicates = await Promise.all(Array.from({ length: 20_000 }, () => (
    coordinator.tryRunExclusive('hot-session', async () => undefined)
  )));
  const contentionMs = elapsed(start);
  release();
  await first;
  assert.equal(duplicates.filter((result) => result.executed).length, 0);

  assert.ok(routingMs < 2_000, `Resolução de rotas lenta: ${routingMs.toFixed(2)} ms`);
  assert.ok(coordinatorMs < 5_000, `Coordenação por sessão lenta: ${coordinatorMs.toFixed(2)} ms`);

  // Mirrors the current saveSessionsToFile strategy: stringify the complete
  // state and synchronously replace one JSON file on every state mutation.
  const syntheticSessions = Object.fromEntries(Array.from({ length: 5_000 }, (_, index) => [
    `account-${index % 20}::phone-${index}`,
    {
      phoneNumber: `55${String(index).padStart(10, '0')}`,
      accountId: `account-${index % 20}`,
      currentNodeId: 'node-current',
      waitingForInput: false,
      variables: { name: `Cliente ${index}`, source: 'benchmark', status: 'active' },
      history: Array.from({ length: 5 }, (__, messageIndex) => ({
        id: `${index}-${messageIndex}`,
        sender: messageIndex % 2 ? 'user' : 'bot',
        type: 'text',
        content: 'Mensagem sintética para medir o custo da persistência completa em JSON.',
      })),
      updatedAt: '2026-10-19T00:00:00.000Z',
      createdAt: '2026-10-19T00:00:00.000Z',
    },
  ]));
  const persistenceRuns = 20;
  const writeDurations: number[] = [];
  const benchmarkDir = mkdtempSync(join(tmpdir(), 'fluxozap-performance-'));
  const benchmarkFile = join(benchmarkDir, 'sessions.json');
  let payloadBytes = 0;
  try {
    for (let index = 0; index < persistenceRuns; index += 1) {
      const writeStart = performance.now();
      const payload = JSON.stringify(syntheticSessions, null, 2);
      payloadBytes = Buffer.byteLength(payload);
      writeFileSync(benchmarkFile, payload);
      writeDurations.push(elapsed(writeStart));
    }
  } finally {
    unlinkSync(benchmarkFile);
    rmdirSync(benchmarkDir);
  }
  const sortedWriteDurations = [...writeDurations].sort((a, b) => a - b);
  const persistenceTotalMs = writeDurations.reduce((sum, value) => sum + value, 0);
  const persistenceP95Ms = sortedWriteDurations[Math.ceil(sortedWriteDurations.length * 0.95) - 1];

  console.log(JSON.stringify({
    routing: {
      operations: iterations,
      durationMs: Number(routingMs.toFixed(2)),
      operationsPerSecond: Math.round(iterations / (routingMs / 1000)),
    },
    independentSessions: {
      operations: sessions,
      durationMs: Number(coordinatorMs.toFixed(2)),
      operationsPerSecond: Math.round(sessions / (coordinatorMs / 1000)),
    },
    sameSessionContention: {
      rejectedDuplicates: duplicates.length,
      durationMs: Number(contentionMs.toFixed(2)),
      operationsPerSecond: Math.round(duplicates.length / (contentionMs / 1000)),
    },
    synchronousJsonPersistence: {
      syntheticSessions: 5_000,
      payloadMb: Number((payloadBytes / 1024 / 1024).toFixed(2)),
      writes: persistenceRuns,
      averageBlockingMsPerWrite: Number((persistenceTotalMs / persistenceRuns).toFixed(2)),
      p95BlockingMsPerWrite: Number(persistenceP95Ms.toFixed(2)),
      fullStateWritesPerSecond: Number((persistenceRuns / (persistenceTotalMs / 1000)).toFixed(2)),
    },
    heapUsedMb: Number((process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
