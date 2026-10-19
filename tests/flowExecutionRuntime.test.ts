import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPaymentBranchTargets,
  canStartFlowFromInboundMessage,
  DURABLE_EXECUTION_CHECKPOINT_VERSION,
  FlowExecutionCoordinator,
  resolvePaymentBranchTarget,
  shouldRestoreExecutionCheckpoint,
  transitionPaymentBranch,
  type PaymentRouteState,
} from '../src/services/flowExecutionRuntime';

const waitingState: PaymentRouteState = {
  waitingForInput: true,
  waitingVariableName: 'resposta',
  waitingForPayment: true,
  waitingPaymentExternalId: 'charge-1',
  waitingPaymentNodeId: 'payment',
  waitingUntil: '2026-10-19T12:00:00.000Z',
  waitingNodeId: 'wait',
  waitingNextNodeId: 'remarketing',
  waitingKind: 'reply_timeout',
  waitingIsLiveWhatsApp: true,
  currentNodeId: 'wait',
  flowCompleted: true,
  executionCheckpointVersion: 1,
};

test('captura somente as três saídas assíncronas da cobrança', () => {
  const targets = buildPaymentBranchTargets([
    { source: 'payment', sourceHandle: 'generated', target: 'instructions' },
    { source: 'payment', sourceHandle: 'paid', target: 'delivery' },
    { source: 'payment', sourceHandle: 'error', target: 'support' },
    { source: 'payment', sourceHandle: 'expired', target: 'retry' },
    { source: 'other', sourceHandle: 'paid', target: 'wrong' },
  ], 'payment');

  assert.deepEqual(targets, { paid: 'delivery', error: 'support', expired: 'retry' });
});

test('o destino salvo no momento da cobrança prevalece sobre edições posteriores do funil', () => {
  const target = resolvePaymentBranchTarget(
    { paid: 'original-delivery' },
    'paid',
    [{ source: 'payment', sourceHandle: 'paid', target: 'edited-delivery' }],
    'payment'
  );
  assert.equal(target, 'original-delivery');
});

test('não usa saída padrão como fallback de status do pagamento', () => {
  const target = resolvePaymentBranchTarget(
    undefined,
    'paid',
    [{ source: 'payment', target: 'generated-default' }],
    'payment'
  );
  assert.equal(target, undefined);
});

test('pagamento confirmado interrompe espera e reabre o fluxo na saída Paga', () => {
  const { nextState, routeChanged } = transitionPaymentBranch(waitingState, 'paid', 'delivery');
  assert.equal(routeChanged, true);
  assert.equal(nextState.currentNodeId, 'delivery');
  assert.equal(nextState.flowCompleted, false);
  assert.equal(nextState.waitingForInput, false);
  assert.equal(nextState.waitingForPayment, false);
  assert.equal(nextState.waitingUntil, undefined);
  assert.equal(nextState.waitingVariableName, undefined);
});

test('pagamento confirmado sem saída Paga finaliza a execução atual', () => {
  const { nextState, routeChanged } = transitionPaymentBranch(waitingState, 'paid');
  assert.equal(routeChanged, true);
  assert.equal(nextState.currentNodeId, null);
  assert.equal(nextState.flowCompleted, true);
  assert.equal(nextState.waitingUntil, undefined);
});

test('erro sem saída conectada não sequestra a rota conversacional', () => {
  const { nextState, routeChanged } = transitionPaymentBranch(waitingState, 'error');
  assert.equal(routeChanged, false);
  assert.deepEqual(nextState, waitingState);
});

test('expiração com saída conectada interrompe a espera e segue o caminho configurado', () => {
  const { nextState, routeChanged } = transitionPaymentBranch(waitingState, 'expired', 'reminder');
  assert.equal(routeChanged, true);
  assert.equal(nextState.currentNodeId, 'reminder');
  assert.equal(nextState.flowCompleted, false);
  assert.equal(nextState.waitingForInput, false);
  assert.equal(nextState.waitingUntil, undefined);
});

test('não restaura automaticamente checkpoints da versão antiga após o deploy', () => {
  const legacy = {
    phoneNumber: '5511', currentNodeId: 'message-node', flowCompleted: false,
    waitingForInput: false, executionCheckpointVersion: 1,
  };
  assert.equal(shouldRestoreExecutionCheckpoint(legacy), false);
  assert.equal(shouldRestoreExecutionCheckpoint({
    ...legacy,
    executionCheckpointVersion: DURABLE_EXECUTION_CHECKPOINT_VERSION,
  }), true);
});

test('checkpoint novo não reinicia enquanto estiver aguardando cliente ou prazo', () => {
  const checkpoint = {
    phoneNumber: '5511', currentNodeId: 'message-node', flowCompleted: false,
    executionCheckpointVersion: DURABLE_EXECUTION_CHECKPOINT_VERSION,
  };
  assert.equal(shouldRestoreExecutionCheckpoint({ ...checkpoint, waitingForInput: true }), false);
  assert.equal(shouldRestoreExecutionCheckpoint({ ...checkpoint, waitingUntil: '2026-10-19T12:00:00.000Z' }), false);
});

test('segunda resposta durante delay entre blocos não reinicia o funil', () => {
  assert.equal(canStartFlowFromInboundMessage({
    currentNodeId: 'next-message',
    waitingUntil: '2026-10-19T20:30:00.000Z',
    waitingKind: 'node_delay',
    flowCompleted: false,
  }), false);
});

test('mensagem só pode iniciar quando a sessão realmente não possui execução', () => {
  assert.equal(canStartFlowFromInboundMessage({ currentNodeId: null, flowCompleted: false }), true);
  assert.equal(canStartFlowFromInboundMessage({ currentNodeId: 'in-progress', flowCompleted: false }), false);
  assert.equal(canStartFlowFromInboundMessage({ currentNodeId: null, flowCompleted: true }), false);
});

test('o coordenador impede duas execuções simultâneas para o mesmo contato', async () => {
  const coordinator = new FlowExecutionCoordinator();
  let releaseFirst!: () => void;
  const holdFirst = new Promise<void>((resolve) => { releaseFirst = resolve; });
  let executions = 0;

  const first = coordinator.tryRunExclusive('account-1::5511', async () => {
    executions += 1;
    await holdFirst;
    return 'first';
  });
  const duplicate = await coordinator.tryRunExclusive('account-1::5511', async () => {
    executions += 1;
    return 'duplicate';
  });

  assert.deepEqual(duplicate, { executed: false });
  assert.equal(executions, 1);
  releaseFirst();
  assert.deepEqual(await first, { executed: true, value: 'first' });
});

test('contatos distintos executam em paralelo e waitForIdle aguarda a execução correta', async () => {
  const coordinator = new FlowExecutionCoordinator();
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  const first = coordinator.tryRunExclusive('account-1::5511', async () => hold);
  const second = await coordinator.tryRunExclusive('account-1::5522', async () => 'ok');
  let idle = false;
  const idleWait = coordinator.waitForIdle('account-1::5511').then(() => { idle = true; });

  assert.deepEqual(second, { executed: true, value: 'ok' });
  assert.equal(idle, false);
  release();
  await first;
  await idleWait;
  assert.equal(idle, true);
});

test('uma falha libera o bloqueio da sessão para a próxima execução', async () => {
  const coordinator = new FlowExecutionCoordinator();
  await assert.rejects(
    coordinator.tryRunExclusive('account-1::5511', async () => { throw new Error('falha simulada'); }),
    /falha simulada/
  );
  assert.equal(coordinator.isActive('account-1::5511'), false);
  assert.deepEqual(
    await coordinator.tryRunExclusive('account-1::5511', async () => 'recovered'),
    { executed: true, value: 'recovered' }
  );
});
