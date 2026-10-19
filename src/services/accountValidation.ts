export function normalizeAccountName(value: unknown): string {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error('O nome da linha não pode ficar vazio.');
  return normalized;
}
