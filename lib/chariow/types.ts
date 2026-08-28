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

export type ChariowProduct = {
  id: string;
  name: string;
  description: string | null;
  price: number | string | null;
  currency: string | null;
  status: string | null;
  image: string | null;
  createdAt: string | null;
  sales: number | null;
};

export type ChariowKpis = {
  period: { from: string | null; to: string | null };
  revenue: { value: number | string | null; formatted: string | null };
  sales: number;
  visits: number;
  conversionRate: string;
  customers: number;
  productsSold: number;
};

export type ChariowNormalizedSnapshot = {
  storeName: string;
  storeStatus: string;
  products: ChariowProduct[];
  sales: unknown[];
  kpis: ChariowKpis;
};
