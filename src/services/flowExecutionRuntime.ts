export type PaymentFlowBranch = 'paid' | 'error' | 'expired';

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
      executionCheckpointVersion: 1,
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
