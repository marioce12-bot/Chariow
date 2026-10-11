export const META_BACKFILL_MONTHS = 12;
export const META_BACKFILL_CHUNK_DAYS = 30;

function parseDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime())) {
    throw new Error(`Date de backfill invalide: ${value}`);
  }
  return date;
}

export function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function initialBackfillDate(today: string): string {
  const date = parseDate(today);
  date.setUTCMonth(date.getUTCMonth() - META_BACKFILL_MONTHS);
  return dateOnly(date);
}

export function nextBackfillChunk(from: string, today: string, chunkDays = META_BACKFILL_CHUNK_DAYS) {
  if (!Number.isInteger(chunkDays) || chunkDays < 1) throw new Error("La taille de tranche doit être un entier positif");
  const start = parseDate(from);
  const endLimit = parseDate(today);
  if (start > endLimit) return null;
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + chunkDays - 1);
  if (end > endLimit) end.setTime(endLimit.getTime());
  const next = new Date(end);
  next.setUTCDate(next.getUTCDate() + 1);
  return { from: dateOnly(start), to: dateOnly(end), nextFrom: dateOnly(next), done: end >= endLimit };
}
