export function validateFeedback(input: unknown): { rating: number; message: string | null } | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as { rating?: unknown; message?: unknown };
  if (!Number.isInteger(value.rating) || (value.rating as number) < 1 || (value.rating as number) > 5) return null;
  if (value.message !== undefined && value.message !== null && typeof value.message !== 'string') return null;
  const message = typeof value.message === 'string' ? value.message.trim() : '';
  if (message.length > 2000) return null;
  if (!message && !value.rating) return null;
  return { rating: value.rating as number, message: message || null };
}
