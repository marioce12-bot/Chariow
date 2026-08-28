import { decryptSecret } from "@/lib/crypto";
import { ChariowMcpClient } from "./mcp-client";
import type { ChariowStoreSnapshot } from "./types";

export async function getChariowSnapshot(store: { mcp_url: string | null; access_token_encrypted: string | null }) {
  if (!store.access_token_encrypted) throw new Error("Cette boutique n'a pas encore de connexion MCP active");
  const client = new ChariowMcpClient({ endpoint: store.mcp_url || undefined, accessToken: decryptSecret(store.access_token_encrypted) });
  await client.initialize();
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  const [storeInfo, products, salesAnalytics, storeAnalytics] = await Promise.all([
    client.callTool("get_store"),
    client.callTool("list_products", { per_page: 100 }),
    client.callTool("get_sales_analytics", { from, to }),
    client.callTool("get_store_analytics", { from, to }),
  ]);
  return { store: storeInfo, products, salesAnalytics, storeAnalytics } satisfies ChariowStoreSnapshot;
}

export function serializeChariowContext(snapshot: ChariowStoreSnapshot) {
  return JSON.stringify(snapshot, null, 2).slice(0, 40000);
}
