export type RevenuePeriodInput = { preset: string; start: string | null; end: string; timeZone: string };
export type RevenuePeriod = RevenuePeriodInput & { startAt: string | null; endAt: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function validDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
function localDate(ms: number, timeZone: string): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(ms);
  const get = (k: string) => p.find(x => x.type === k)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function localMidnight(date: string, timeZone: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const desired = Date.UTC(y, m - 1, d);
  let candidate = desired;
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  // Offset iteration handles DST boundaries; midnight is unambiguous for supported civil dates.
  for (let i = 0; i < 4; i++) {
    const parts = fmt.formatToParts(candidate);
    const val = (k: string) => Number(parts.find(x => x.type === k)!.value);
    const represented = Date.UTC(val("year"), val("month") - 1, val("day"), val("hour"), val("minute"), val("second"));
    const next = candidate + desired - represented;
    if (next === candidate) break;
    candidate = next;
  }
  return candidate;
}
function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + days));
  return `${x.getUTCFullYear().toString().padStart(4, "0")}-${String(x.getUTCMonth()+1).padStart(2,"0")}-${String(x.getUTCDate()).padStart(2,"0")}`;
}
export function resolveRevenuePeriod(params: URLSearchParams, asOf: Date): RevenuePeriod | null {
  const preset = params.get("period") ?? "all";
  const tz = params.get("timeZone") ?? "UTC";
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); } catch { return null; }
  const today = localDate(asOf.getTime(), tz);
  let start: string | null = null, end = today;
  if (preset === "custom") {
    const s = params.get("start"), e = params.get("end");
    if (!s || !e || !validDate(s) || !validDate(e) || s > e) return null;
    start = s; end = e;
  } else if (preset === "7d" || preset === "30d" || preset === "90d") {
    const n = Number(preset.slice(0, -1)); start = shiftDate(today, 1 - n);
  } else if (preset !== "all") return null;
  let endAt = Math.min(localMidnight(shiftDate(end, 1), tz) - 1, asOf.getTime());
  const startAt = start === null ? null : localMidnight(start, tz);
  if (startAt !== null && startAt > endAt) return null;
  return { preset, start, end, timeZone: tz, startAt: startAt === null ? null : new Date(startAt).toISOString(), endAt: new Date(endAt).toISOString() };
}
export function dateInTimeZone(timestamp: string, timeZone: string): string {
  return localDate(Date.parse(timestamp), timeZone);
}
