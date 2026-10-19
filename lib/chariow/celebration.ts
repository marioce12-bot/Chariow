import { ChariowMcpClient } from "./mcp-client";
import { collectChariowPages, collectionRows } from "./pagination";
import { decryptSecret } from "@/lib/crypto";
import { isConfirmedChariowSaleStatus } from "./sales";

export type SaleCandidate = { id: string; occurred_at: string };
const obj = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
export function confirmedCandidates(rows: unknown[], now = Date.now()): SaleCandidate[] {
  const out: SaleCandidate[] = [];
  for (const raw of rows) {
    const sale = obj(raw);
    const id = sale.id ?? sale.sale_id ?? sale.order_id ?? sale.uuid;
    const date = sale.created_at ?? sale.createdAt ?? sale.paid_at ?? sale.completed_at ?? sale.settled_at;
    const timestamp = typeof date === "string" || typeof date === "number" ? new Date(date).getTime() : NaN;
    if (isConfirmedChariowSaleStatus(sale.status) && id != null && String(id).trim() && Number.isFinite(timestamp) && timestamp <= now) {
      out.push({ id: String(id), occurred_at: new Date(timestamp).toISOString() });
    }
  }
  return out;
}

export async function fetchCelebrationSales(store: { mcp_url: string | null; access_token_encrypted: string | null }, opts?: { from?: string }) {
  if (!store.mcp_url) throw new Error("Missing Chariow MCP URL");
  const client = new ChariowMcpClient({ endpoint: store.mcp_url, accessToken: store.access_token_encrypted ? decryptSecret(store.access_token_encrypted) : undefined });
  await client.initialize();
  const result = await collectChariowPages((args) => client.callTool("list_sales", args), opts?.from ? { start_date: opts.from } : {});
  if (!result.coverage.complete) throw new Error("Incomplete Chariow sales coverage");
  return confirmedCandidates(result.data);
}

// Keep shape validation explicit at the trust boundary; rows are never read from analytics/cache.
export function rowsForTest(value: unknown) { return collectionRows(value); }
