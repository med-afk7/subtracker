// Postgres error 23505 = unique constraint violated. Drizzle wraps driver errors, so the
// original error may be on `cause`.
export function isUniqueViolation(err: unknown): boolean {
  const candidates = [err, (err as { cause?: unknown } | null)?.cause];
  return candidates.some((e) => (e as { code?: string } | null)?.code === '23505');
}
