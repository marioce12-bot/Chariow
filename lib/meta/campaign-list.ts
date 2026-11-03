import { META_GRAPH_BASE_URL } from "./api";
import { createMetaGraphError, fetchMetaGraph } from "./graph";

export type MetaCampaignRef = { id: string; name: string | null; effectiveStatus: string | null };

/**
 * Liste les campagnes d'un compte publicitaire Meta (id + nom), qu'elles aient
 * été lancées depuis Vendeo ou directement depuis Meta Ads Manager.
 *
 * Sert de fallback lorsque la requête Insights agrégée campaign ne fournit pas
 * d'identifiants, ou qu'un token refuse campaign_id/campaign_name (#100).
 * En connaissant les IDs, on interroge /{campaign_id}/insights directement.
 *
 * Par défaut Meta ne renvoie pas les campagnes archivées : on les demande
 * explicitement pour ne pas perdre l'historique de dépenses.
 */
export async function fetchMetaCampaignList(accountId: string, accessToken: string, maxCampaigns = Number.POSITIVE_INFINITY): Promise<MetaCampaignRef[]> {
  const url = new URL(`${META_GRAPH_BASE_URL}/${accountId}/campaigns`);
  url.searchParams.set("fields", "id,name,effective_status");
  url.searchParams.set("effective_status", JSON.stringify(["ACTIVE", "PAUSED", "ARCHIVED", "IN_PROCESS", "WITH_ISSUES"]));
  url.searchParams.set("limit", "100");
  url.searchParams.set("access_token", accessToken);

  const campaigns: MetaCampaignRef[] = [];
  let next: string | null = url.toString();
  const visited = new Set<string>();
  while (next && campaigns.length < maxCampaigns) {
    if (visited.has(next)) throw new Error("Meta campaigns pagination did not advance");
    visited.add(next);
    const response: Response = await fetchMetaGraph(next);
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw createMetaGraphError(json?.error, response.status, `Meta campaigns request failed (${response.status})`);
    if (json.error || !Array.isArray(json.data)) throw new Error("Meta campaigns inventory response is incomplete");
    for (const row of json.data as Array<Record<string, unknown>>) {
      if (!row || typeof row.id !== "string" || !row.id) throw new Error("Meta campaigns inventory contains an invalid entry");
      campaigns.push({
        id: row.id,
        name: typeof row.name === "string" && row.name.trim() ? row.name.trim() : null,
        effectiveStatus: typeof row.effective_status === "string" ? row.effective_status : null,
      });
    }
    next = typeof json?.paging?.next === "string" ? json.paging.next : null;
  }
  const result = Number.isFinite(maxCampaigns) ? campaigns.slice(0, maxCampaigns) : campaigns;
  return result;
}
