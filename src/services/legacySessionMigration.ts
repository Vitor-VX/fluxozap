export interface MigratableSession {
  accountId?: string;
  phoneNumber: string;
  updatedAt?: string;
  createdAt?: string;
}

function sessionKey(session: MigratableSession): string {
  return `${session.accountId || 'unassigned'}::${session.phoneNumber}`;
}

function timestamp(session: MigratableSession): number {
  const value = new Date(session.updatedAt || session.createdAt || 0).getTime();
  return Number.isFinite(value) ? value : 0;
}

export function mergeLegacyAndMongoSessions<T extends MigratableSession>(
  mongoSessions: T[],
  legacySessions: T[]
): { sessions: T[]; importedLegacyCount: number } {
  const merged = new Map<string, T>();
  for (const session of mongoSessions) {
    if (session?.phoneNumber) merged.set(sessionKey(session), session);
  }

  let importedLegacyCount = 0;
  for (const legacy of legacySessions) {
    if (!legacy?.phoneNumber) continue;
    const key = sessionKey(legacy);
    const databaseSession = merged.get(key);
    if (!databaseSession || timestamp(legacy) > timestamp(databaseSession)) {
      merged.set(key, legacy);
      importedLegacyCount += 1;
    }
  }
  return { sessions: Array.from(merged.values()), importedLegacyCount };
}
