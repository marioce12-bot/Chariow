export const CHARIOW_MCP_URL = "https://mcp.chariow.com/public";

export type JsonRpcResponse<T = unknown> = {
  jsonrpc: "2.0";
  id?: string | number;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
};

export type McpToolResult = {
  content?: Array<{ type: string; text?: string; [key: string]: unknown }>;
  structuredContent?: unknown;
  isError?: boolean;
};

export type ChariowStoreSnapshot = {
  store?: unknown;
  products?: unknown;
  sales?: unknown;
  salesAnalytics?: unknown;
  storeAnalytics?: unknown;
};
