export type PaymentFlowBranch = 'paid' | 'error' | 'expired';
export const DURABLE_EXECUTION_CHECKPOINT_VERSION = 2;

export interface FlowEdgeLike {
  source: string;
  target?: string;
  sourceHandle?: string | null;
}

export interface PaymentRouteState {
  waitingForInput: boolean;
  waitingVariableName?: string;
  waitingForPayment?: boolean;
  waitingPaymentExternalId?: string;
  waitingPaymentNodeId?: string;
  waitingUntil?: string;
  waitingNodeId?: string;
  waitingNextNodeId?: string;
  waitingKind?: string;
  waitingIsLiveWhatsApp?: boolean;
  currentNodeId: string | null;
  flowCompleted?: boolean;
  executionCheckpointVersion?: number;
}

export interface RestorableExecutionState {
  phoneNumber: string;
  botPaused?: boolean;
  flowCompleted?: boolean;
  waitingForInput?: boolean;
  waitingForPayment?: boolean;
  waitingUntil?: string;
  executionCheckpointVersion?: number;
  currentNodeId?: string | null;
}

export function shouldRestoreExecutionCheckpoint(state: RestorableExecutionState): boolean {
  return state.phoneNumber !== 'simulator_user' &&
    !state.botPaused &&
    !state.flowCompleted &&
    !state.waitingForInput &&
    !state.waitingForPayment &&
    !state.waitingUntil &&
    state.executionCheckpointVersion === DURABLE_EXECUTION_CHECKPOINT_VERSION &&
    Boolean(state.currentNodeId);
}

export function buildPaymentBranchTargets(
  edges: FlowEdgeLike[],
  nodeId: string
): Partial<Record<PaymentFlowBranch, string>> {
  const result: Partial<Record<PaymentFlowBranch, string>> = {};
  for (const branch of ['paid', 'error', 'expired'] as const) {
    const target = edges.find(
      (edge) => edge.source === nodeId && edge.sourceHandle === branch
    )?.target;
    if (target) result[branch] = target;
  }
  return result;
}

export function resolvePaymentBranchTarget(
  savedTargets: Partial<Record<PaymentFlowBranch, string>> | undefined,
  branch: PaymentFlowBranch,
  edges: FlowEdgeLike[],
  nodeId: string
): string | undefined {
  return savedTargets?.[branch] || edges.find(
    (edge) => edge.source === nodeId && edge.sourceHandle === branch
  )?.target;
}

export function transitionPaymentBranch<T extends PaymentRouteState>(
  state: T,
  branch: PaymentFlowBranch,
  target?: string
): { nextState: T; routeChanged: boolean } {
  // Paid always supersedes the route opened by "Gerada". Error and expiration
  // only take control when their respective output is connected.
  if (branch !== 'paid' && !target) {
    return { nextState: { ...state }, routeChanged: false };
  }

  return {
    nextState: {
      ...state,
      waitingForInput: false,
      waitingVariableName: undefined,
      waitingUntil: undefined,
      waitingNodeId: undefined,
      waitingNextNodeId: undefined,
      waitingKind: undefined,
      waitingIsLiveWhatsApp: undefined,
      waitingForPayment: false,
      waitingPaymentExternalId: undefined,
      waitingPaymentNodeId: undefined,
      currentNodeId: target || null,
      flowCompleted: !target,
      executionCheckpointVersion: DURABLE_EXECUTION_CHECKPOINT_VERSION,
    },
    routeChanged: true,
  };
}

export interface ExclusiveRunResult<T> {
  executed: boolean;
  value?: T;
}

/** Coordinates mutations per account/contact without serializing other contacts. */
export class FlowExecutionCoordinator {
  private readonly active = new Map<string, Promise<void>>();

  isActive(key: string): boolean {
    return this.active.has(key);
  }

  async waitForIdle(key: string): Promise<void> {
    let execution = this.active.get(key);
    while (execution) {
      await execution;
      execution = this.active.get(key);
    }
  }

  async tryRunExclusive<T>(key: string, task: () => Promise<T>): Promise<ExclusiveRunResult<T>> {
    if (this.active.has(key)) return { executed: false };

    let release!: () => void;
    const finished = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.active.set(key, finished);

    try {
      return { executed: true, value: await task() };
    } finally {
      if (this.active.get(key) === finished) this.active.delete(key);
      release();
    }
  }
}
