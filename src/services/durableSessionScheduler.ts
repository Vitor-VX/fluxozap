import type { Collection, Document, Filter, UpdateFilter } from 'mongodb';

export const SESSION_WAITING_STATUS = 'waiting';
export const RELEASED_SESSION_LEASE = new Date(0);

export interface DurableSessionState {
  accountId?: string;
  phoneNumber?: string;
  waitingUntil?: string;
  waitingKind?: string;
  waitingNodeId?: string;
  waitingNextNodeId?: string;
  botPaused?: boolean;
}

export function buildDurableSessionPersistenceUpdate(
  data: DurableSessionState
): UpdateFilter<Document> {
  const isWaiting = Boolean(!data.botPaused && data.waitingUntil && data.waitingKind && data.waitingNodeId);
  const $set: Document = {
    accountId: data.accountId,
    phoneNumber: data.phoneNumber,
    data,
  };

  if (isWaiting) {
    $set.schedulerStatus = SESSION_WAITING_STATUS;
    $set.waitingUntil = new Date(data.waitingUntil!);
    $set.waitingKind = data.waitingKind;
    $set.waitingNodeId = data.waitingNodeId;
    $set.waitingNextNodeId = data.waitingNextNodeId;
    $set.leaseUntil = RELEASED_SESSION_LEASE;
  }

  const update: UpdateFilter<Document> = { $set };
  if (!isWaiting) {
    update.$unset = {
      schedulerStatus: '', waitingUntil: '', waitingKind: '', waitingNodeId: '',
      waitingNextNodeId: '', leaseOwner: '', leaseUntil: '', resumeAttempts: '',
    };
  }
  return update;
}

export async function claimDueSessionBatch(
  collection: Collection,
  workerId: string,
  now: Date,
  batchSize = 100,
  leaseMs = 30_000
): Promise<Document[]> {
  const availableFilter: Filter<Document> = {
    schedulerStatus: SESSION_WAITING_STATUS,
    waitingUntil: { $lte: now },
    leaseUntil: { $lte: now },
  };
  const candidates = await collection.find(availableFilter)
    .sort({ waitingUntil: 1 })
    .limit(Math.max(1, Math.min(batchSize, 500)))
    .project({ _id: 1 })
    .toArray();
  if (!candidates.length) return [];

  const candidateIds = candidates.map((item) => item._id);
  await collection.updateMany(
    { ...availableFilter, _id: { $in: candidateIds } },
    {
      $set: { leaseOwner: workerId, leaseUntil: new Date(now.getTime() + leaseMs) },
      $inc: { resumeAttempts: 1 },
    }
  );
  return collection.find({ _id: { $in: candidateIds }, leaseOwner: workerId }).toArray();
}
