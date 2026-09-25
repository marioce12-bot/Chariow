// Client pour le serveur MCP publicités de Meta (https://mcp.facebook.com/ads).
// Contrairement au MCP Chariow, ce serveur est sans état : chaque requête porte
// son propre token d'accès et il n'y a pas de session Mcp-Session-Id à gérer.
export const META_MCP_URL = "https://mcp.facebook.com/ads";

type McpToolResult = {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
};

function parseToolResult(result: McpToolResult | undefined): unknown {
  if (!result) return null;
  if (result.structuredContent !== undefined) return result.structuredContent;
  const text = result.content?.find((item) => item.type === "text")?.text;
  if (!text) return result;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export class MetaAdsMcpClient {
  private nextId = 1;

  constructor(private readonly accessToken: string) {}

  async callTool(name: string, args: Record<string, unknown> = {}) {
    const response = await fetch(META_MCP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.accessToken}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: this.nextId++, method: "tools/call", params: { name, arguments: args } }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: { message?: string }; result?: McpToolResult };
    if (!response.ok || data.error) throw new Error(data.error?.message || `Meta MCP returned ${response.status}`);
    const parsed = parseToolResult(data.result);
    if (data.result?.isError) throw new Error(typeof parsed === "string" ? parsed : "Meta MCP tool returned an error");
    return parsed;
  }
}

export type MetaMcpAdAccount = {
  ad_account_id: string;
  ad_account_name: string;
  account_status: string;
  currency?: string;
  is_ads_mcp_enabled?: boolean;
};

/** Liste les comptes publicitaires accessibles via le serveur MCP. */
export async function getMetaMcpAdAccounts(accessToken: string): Promise<MetaMcpAdAccount[]> {
  const client = new MetaAdsMcpClient(accessToken);
  const result = await client.callTool("ads_get_ad_accounts", {});
  const list = (result as { ad_accounts?: MetaMcpAdAccount[] } | null)?.ad_accounts;
  return Array.isArray(list) ? list : [];
}

/** Récupère les performances récentes d'un compte via le serveur MCP. */
export async function getMetaMcpPerformanceTrend(accessToken: string, adAccountId: string) {
  const client = new MetaAdsMcpClient(accessToken);
  return client.callTool("ads_insights_performance_trend", { ad_account_id: adAccountId });
}
