import { decryptSecret } from "@/lib/crypto";
import { ChariowMcpClient } from "./mcp-client";

type UnknownRecord = Record<string, unknown>;
type GeographyStore = { mcp_url: string | null; access_token_encrypted: string | null };
export type GeographyPeriod = { from: string; to: string };
export type GeographyAnalytics = {
  period: GeographyPeriod;
  visitsByLocation: { location: string; visits: number | null }[] | null;
  salesByCountry: { country: string; sales: number | null; revenue: number | null; currency: string | null }[] | null;
  conversionByCountry: { country: string; visits: number | null; sales: number | null; rate: number | null }[] | null;
};
function record(value: unknown): UnknownRecord | null { return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null; }
function unwrap(value: unknown): unknown {
  let current = value;
  for (let i = 0; i < 3; i++) {
    const obj = record(current);
    if (!obj) break;
    if (obj.errors || obj.error) return null;
    if (obj.data !== undefined) { current = obj.data; continue; }
    break;
  }
  return current;
}
function text(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }
function number(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}
function country(value: unknown): string | null {
  if (typeof value === "string") return text(value);
  const obj = record(value);
  if (!obj) return null;
  for (const key of ["country", "country_name", "name", "label", "code", "country_code"]) { const result = text(obj[key]); if (result) return result; }
  return null;
}
function collection(payload: unknown, keys: string[]): unknown[] | null {
  const value = unwrap(payload);
  if (Array.isArray(value)) return value;
  const obj = record(value);
  if (!obj) return null;
  for (const key of keys) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
    const nested = record(obj[key]);
    if (nested) for (const subkey of ["data", "items", "results", "countries", "locations"]) if (Array.isArray(nested[subkey])) return nested[subkey] as unknown[];
  }
  // A keyed map is accepted only if its values contain at least one known numeric measure.
  const entries = Object.entries(obj);
  if (entries.length && entries.every(([, row]) => { const item = record(row); return number(row) !== null || !!item && ["visits", "count", "sales", "revenue", "rate", "conversion_rate", "conversions"].some((k) => number(item[k]) !== null); })) {
    return entries.map(([key, row]) => ({ country: key, ...(record(row) ?? { value: row }) }));
  }
  return null;
}
function measure(row: unknown, keys: string[]): number | null {
  const obj = record(row);
  if (!obj) return number(row);
  for (const key of keys) if (obj[key] !== undefined) return number(obj[key]);
  return null;
}
function visits(payload: unknown) {
  const value = unwrap(payload); const obj = record(value);
  const section = obj?.locations ?? obj?.by_location ?? obj?.data;
  const rows = Array.isArray(section) ? section : collection(section, ["locations", "data"]);
  if (!rows) return null;
  return rows.map((row) => { const item = record(row); return { location: country(item?.location ?? item?.city ?? item?.region ?? item?.country ?? row) ?? "", visits: measure(row, ["visits", "visit_count", "count", "total"]) }; });
}
function sales(payload: unknown) {
  const rows = collection(payload, ["by_country", "countries"]);
  if (!rows) return null;
  return rows.map((row) => { const item = record(row); return { country: country(item?.country ?? row) ?? "", sales: measure(row, ["sales", "sales_count", "orders", "count"]), revenue: measure(row, ["revenue", "amount", "total_revenue"]), currency: text(item?.currency) }; });
}
function conversions(payload: unknown) {
  const rows = collection(payload, ["by_country", "countries"]);
  if (!rows) return null;
  return rows.map((row) => { const item = record(row); return { country: country(item?.country ?? row) ?? "", visits: measure(row, ["visits", "visitor_count"]), sales: measure(row, ["sales", "conversions", "orders", "count"]), rate: measure(row, ["rate", "conversion_rate", "conversionRate"]) }; });
}
/** Unknown payload shapes stay unavailable; absent numbers are never turned into zero. */
export function normalizeGeographyAnalytics(payloads: { visits: unknown; sales: unknown; conversions: unknown }, period: GeographyPeriod): GeographyAnalytics {
  return { period, visitsByLocation: visits(payloads.visits), salesByCountry: sales(payloads.sales), conversionByCountry: conversions(payloads.conversions) };
}
export async function getChariowGeography(store: GeographyStore, period: GeographyPeriod): Promise<GeographyAnalytics> {
  if (!store.mcp_url) throw new Error("Connexion Chariow indisponible");
  const client = new ChariowMcpClient({ endpoint: store.mcp_url, accessToken: store.access_token_encrypted ? decryptSecret(store.access_token_encrypted) : undefined });
  await client.initialize();
  const [visitsPayload, salesPayload, conversionsPayload] = await Promise.all([
    client.callTool("get_visits_analytics", { from: period.from, to: period.to, sections: ["locations"] }).catch(() => null),
    client.callTool("get_sales_analytics", { from: period.from, to: period.to, sections: ["by_country"] }).catch(() => null),
    client.callTool("get_conversion_rate_analytics", { from: period.from, to: period.to, sections: ["by_country"] }).catch(() => null),
  ]);
  return normalizeGeographyAnalytics({ visits: visitsPayload, sales: salesPayload, conversions: conversionsPayload }, period);
}
