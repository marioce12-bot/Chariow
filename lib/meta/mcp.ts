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

// Extrait un message d'erreur lisible d'un résultat d'outil MCP en échec.
// Meta renvoie parfois l'erreur sous forme de chaîne, parfois dans un objet
// (message / error / detail), parfois uniquement dans le contenu texte.
function extractErrorMessage(parsed: unknown): string | null {
  if (typeof parsed === "string" && parsed.trim()) return parsed;
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    const candidate = obj.message ?? obj.error ?? obj.detail ?? obj.error_message ?? obj.errorMessage;
    if (typeof candidate === "string" && candidate.trim()) return candidate;
    if (typeof obj.error === "object" && obj.error) {
      const inner = (obj.error as Record<string, unknown>).message;
      if (typeof inner === "string" && inner.trim()) return inner;
    }
  }
  return null;
}

export type McpToolDescriptor = { name: string; description?: string; inputSchema?: { properties?: Record<string, unknown> } };

export class MetaAdsMcpClient {
  private nextId = 1;
  private toolsCache: McpToolDescriptor[] | null = null;

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
    if (data.result?.isError) throw new Error(extractErrorMessage(parsed) ?? "Meta MCP tool returned an error");
    return parsed;
  }

  /**
   * Demande au serveur MCP la liste réelle des outils qu'il expose (nom +
   * schéma des arguments), au lieu de deviner un nom d'outil. Cette liste
   * évolue avec les versions du serveur Meta (rollout progressif du produit) :
   * mieux vaut la découvrir à l'exécution que la coder en dur — ça a déjà
   * cassé une fois, voir findCampaignRemovalTool ci-dessous
   * ("ads_update_campaign" n'existait pas sur ce serveur au moment du premier
   * essai ; le vrai outil générique s'appelle "ads_activate_entity").
   * Mise en cache par instance de client (une instance = une requête d'appel).
   */
  async listTools(): Promise<McpToolDescriptor[]> {
    if (this.toolsCache) return this.toolsCache;
    const response = await fetch(META_MCP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.accessToken}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: this.nextId++, method: "tools/list", params: {} }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: { message?: string }; result?: { tools?: McpToolDescriptor[] } };
    if (!response.ok || data.error) throw new Error(data.error?.message || `Meta MCP tools/list returned ${response.status}`);
    const tools = Array.isArray(data.result?.tools) ? data.result!.tools! : [];
    this.toolsCache = tools;
    return tools;
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

// Le serveur MCP Meta exige un `client_conversation_id` (20 caractères A-Za-z0-9)
// identique sur tous les appels d'une même conversation pour les tracer ensemble.
function generateClientConversationId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 20; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

export type CreateCampaignInput = {
  adAccountId: string;
  name: string;
  objective: string; // OUTCOME_SALES, OUTCOME_TRAFFIC, OUTCOME_ENGAGEMENT, OUTCOME_LEADS, OUTCOME_AWARENESS, OUTCOME_APP_PROMOTION
  dailyBudgetCents?: number;
  lifetimeBudgetCents?: number;
  buyingType?: "AUCTION" | "RESERVED";
};

export async function createMetaCampaign(accessToken: string, input: CreateCampaignInput) {
  const client = new MetaAdsMcpClient(accessToken);
  return client.callTool("ads_create_campaign", {
    ad_account_id: input.adAccountId,
    campaign_name: input.name,
    objective: input.objective,
    buying_type: input.buyingType ?? "AUCTION",
    ...(input.dailyBudgetCents ? { campaign_daily_budget: input.dailyBudgetCents } : {}),
    ...(input.lifetimeBudgetCents ? { campaign_lifetime_budget: input.lifetimeBudgetCents } : {}),
    client_conversation_id: generateClientConversationId(),
  });
}

// Ordre de préférence pour le vrai outil de suppression/désactivation de
// campagne exposé par ce serveur MCP. Découvert par introspection (tools/list)
// le 27/09/2026 : il n'existe PAS de "ads_delete_campaign" ni de
// "ads_update_campaign" sur mcp.facebook.com/ads — la bascule de statut
// (activer/mettre en pause/supprimer une campagne, un ad set ou une ad) passe
// par un seul outil générique "ads_activate_entity" qui s'applique à
// n'importe quel type d'entité via son id.
const CAMPAIGN_REMOVAL_TOOL_PATTERNS: Array<{ test: RegExp; status?: string }> = [
  { test: /campaign.*delete|delete.*campaign/i },
  { test: /campaign.*archive|archive.*campaign/i, status: "ARCHIVED" },
  { test: /activate_entity|deactivate_entity|update_entity|entity.*status/i, status: "DELETED" },
  { test: /campaign.*(status|update)|(status|update).*campaign/i, status: "DELETED" },
];

function findCampaignRemovalTool(tools: McpToolDescriptor[]): { tool: McpToolDescriptor; status?: string } | null {
  for (const pattern of CAMPAIGN_REMOVAL_TOOL_PATTERNS) {
    const match = tools.find((tool) => pattern.test.test(tool.name));
    if (match) return { tool: match, status: pattern.status };
  }
  return null;
}

// Construit les arguments à partir du schéma réel de l'outil trouvé (inputSchema
// renvoyé par tools/list), plutôt que de supposer des noms de champs fixes —
// un outil générique comme "ads_activate_entity" peut attendre "entity_id" là
// où un outil dédié attendrait "campaign_id".
function buildRemovalArgs(tool: McpToolDescriptor, input: { adAccountId: string; campaignId: string }, status: string | undefined) {
  const properties = tool.inputSchema?.properties ?? {};
  const has = (key: string) => key in properties;
  const args: Record<string, unknown> = { client_conversation_id: generateClientConversationId() };

  const idField = ["campaign_id", "entity_id", "object_id", "ad_object_id", "id"].find(has) ?? "campaign_id";
  args[idField] = input.campaignId;
  if (has("ad_account_id")) args.ad_account_id = input.adAccountId;
  if (has("entity_type")) args.entity_type = "CAMPAIGN";
  if (status && has("status")) args.status = status;

  return args;
}

/**
 * Supprime (ou à défaut archive/désactive) une campagne créée via le MCP.
 * Utilisé comme filet de sécurité par launch-campaign : si une des étapes
 * après la création de la campagne échoue (ex. aucune Page disponible), on ne
 * veut pas laisser une campagne fantôme, vide, traîner sur le compte
 * publicitaire du client.
 *
 * Découvre le vrai nom de l'outil et le nom de ses champs via tools/list
 * plutôt que de les coder en dur (voir findCampaignRemovalTool /
 * buildRemovalArgs). Si aucun outil correspondant n'est trouvé, lève une
 * erreur explicite plutôt que d'échouer silencieusement.
 *
 * Best-effort : l'appelant doit catcher les erreurs de cette fonction plutôt
 * que de les laisser masquer l'erreur d'origine — voir launch-campaign/route.ts.
 */
export async function deleteMetaCampaign(accessToken: string, input: { adAccountId: string; campaignId: string }) {
  const client = new MetaAdsMcpClient(accessToken);
  const tools = await client.listTools();
  const found = findCampaignRemovalTool(tools);
  if (!found) {
    throw new Error(
      `Aucun outil de suppression/archivage de campagne trouvé sur le serveur MCP Meta (outils disponibles : ${tools.map((t) => t.name).join(", ") || "aucun"}).`
    );
  }
  const args = buildRemovalArgs(found.tool, input, found.status);
  return client.callTool(found.tool.name, args);
}

export type CreateCreativeInput = {
  adAccountId: string;
  pageId: string;
  imageUrl?: string;
  videoId?: string;
  message?: string;
  headline?: string;
  description?: string;
  linkUrl?: string;
  displayLink?: string;
  callToActionType?: string;
  name?: string;
};

export async function createMetaCreative(accessToken: string, input: CreateCreativeInput) {
  const client = new MetaAdsMcpClient(accessToken);
  const args: Record<string, unknown> = {
    ad_account_id: input.adAccountId,
    page_id: input.pageId,
    client_conversation_id: generateClientConversationId(),
  };
  if (input.imageUrl) args.image_url = input.imageUrl;
  if (input.videoId) args.video_id = input.videoId;
  if (input.message) args.message = input.message;
  if (input.headline) args.headline = input.headline;
  if (input.description) args.description = input.description;
  if (input.linkUrl) args.link_url = input.linkUrl;
  if (input.displayLink) args.display_link = input.displayLink;
  if (input.callToActionType) args.call_to_action_type = input.callToActionType;
  if (input.name) args.name = input.name;
  return client.callTool("ads_create_creative", args);
}

export type CreateAdSetInput = {
  adAccountId: string;
  campaignId: string;
  name: string;
  optimizationGoal?: string; // défaut OFFSITE_CONVERSIONS (conversions/ventes)
  billingEvent?: string; // défaut IMPRESSIONS
  countries?: string[];
  ageMin?: number;
  ageMax?: number;
  dailyBudgetCents?: number;
  pixelId?: string; // requis pour OUTCOME_SALES avec destination site web
};

export async function createMetaAdSet(accessToken: string, input: CreateAdSetInput) {
  const client = new MetaAdsMcpClient(accessToken);
  const targeting: Record<string, unknown> = {};
  if (input.countries?.length) targeting.geo_locations = { countries: input.countries };
  if (input.ageMin) targeting.age_min = input.ageMin;
  if (input.ageMax) targeting.age_max = input.ageMax;
  const args: Record<string, unknown> = {
    ad_account_id: input.adAccountId,
    campaign_id: input.campaignId,
    ad_set_name: input.name,
    optimization_goal: input.optimizationGoal ?? "OFFSITE_CONVERSIONS",
    billing_event: input.billingEvent ?? "IMPRESSIONS",
    ...(Object.keys(targeting).length ? { targeting: JSON.stringify(targeting) } : {}),
    ...(input.dailyBudgetCents ? { daily_budget: input.dailyBudgetCents } : {}),
    ...(input.pixelId ? { promoted_object: JSON.stringify({ pixel_id: input.pixelId }) } : {}),
    client_conversation_id: generateClientConversationId(),
  };
  return client.callTool("ads_create_ad_set", args);
}

export async function createMetaAd(accessToken: string, input: { adAccountId: string; adSetId: string; name: string; creativeId: string }) {
  const client = new MetaAdsMcpClient(accessToken);
  return client.callTool("ads_create_ad", {
    ad_account_id: input.adAccountId,
    ad_set_id: input.adSetId,
    ad_name: input.name,
    creative: JSON.stringify({ creative_id: input.creativeId }),
    client_conversation_id: generateClientConversationId(),
  });
}
