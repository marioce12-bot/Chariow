import { CHARIOW_MCP_URL, type JsonRpcResponse, type McpToolResult } from "./types";

type ClientOptions = { accessToken?: string; endpoint?: string };

function parseToolResult(result: McpToolResult | undefined) {
  if (!result) return null;
  if (result.structuredContent !== undefined) return result.structuredContent;
  const text = result.content?.find((item) => item.type === "text")?.text;
  if (!text) return result;
  try { return JSON.parse(text); } catch { return text; }
}

export class ChariowMcpClient {
  private readonly endpoint: string;
  private readonly accessToken?: string;
  private nextId = 1;
  private sessionId?: string;

  constructor(options: ClientOptions) {
    this.endpoint = options.endpoint || CHARIOW_MCP_URL;
    this.accessToken = options.accessToken;
  }

  async callTool(name: string, args: Record<string, unknown> = {}) {
    const response = await this.request("tools/call", { name, arguments: args });
    if (response.error) throw new Error(response.error.message);
    return parseToolResult(response.result as McpToolResult | undefined);
  }

  async initialize() {
    const response = await this.request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "Vendeo", version: "1.0.0" } });
    if (response.error) throw new Error(response.error.message);
    return response.result;
  }

  private async request(method: string, params: Record<string, unknown>) {
    const headers: Record<string, string> = {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
    };
    if (this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`;
    if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;
    const response = await fetch(this.endpoint, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: this.nextId++, method, params }), cache: "no-store", signal: AbortSignal.timeout(20_000) });
    const sessionId = response.headers.get("mcp-session-id");
    if (sessionId) this.sessionId = sessionId;
    const raw = await response.text();
    const json = this.extractJson(raw);
    if (!response.ok) throw new Error(`Chariow MCP returned ${response.status}: ${typeof json === "string" ? json : JSON.stringify(json)}`);
    return json as JsonRpcResponse;
  }

  private extractJson(raw: string): JsonRpcResponse | string {
    const trimmed = raw.trim();
    if (!trimmed) return "";
    try { return JSON.parse(trimmed); } catch { /* SSE payload */ }
    const dataLine = trimmed.split(/\r?\n/).find((line) => line.startsWith("data:"));
    if (dataLine) { try { return JSON.parse(dataLine.slice(5).trim()); } catch { return dataLine.slice(5).trim(); } }
    return trimmed;
  }
}
