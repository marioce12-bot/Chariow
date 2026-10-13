import { META_GRAPH_BASE_URL } from "./api";

export type MetaCampaignRef = { id: string; name: string | null; effectiveStatus: string | null };

/**
 * Liste les campagnes d'un compte publicitaire Meta (id + nom), qu'elles aient
 * été lancées depuis Vendeo ou directement depuis Meta Ads Manager.
 *
 * Pourquoi : l'appel d'insights au niveau compte ne demande pas campaign_id
 * (erreur #100 sur certains tokens), donc les lignes « campaign » reviennent
 * sans identifiant et étaient ignorées. Les campagnes créées dans Meta n'avaient
 * ainsi aucune ligne au niveau campagne (ni dépenses, ni clics dans Vendeo).
 * En connaissant les IDs, on interroge /{campaign_id}/insights directement.
 *
 * Par défaut Meta ne renvoie pas les campagnes archivées : on les demande
 * explicitement pour ne pas perdre l'historique de dépenses.
 */
export async function fetchMetaCampaignList(accountId: string, accessToken: string, maxCampaigns = 300): Promise<MetaCampaignRef[]> {
  const url = new URL(`${META_GRAPH_BASE_URL}/${accountId}/campaigns`);
  url.searchParams.set("fields", "id,name,effective_status");
  url.searchParams.set("effective_status", JSON.stringify(["ACTIVE", "PAUSED", "ARCHIVED", "IN_PROCESS", "WITH_ISSUES"]));
  url.searchParams.set("limit", "100");
  url.searchParams.set("access_token", accessToken);

  const campaigns: MetaCampaignRef[] = [];
  let next: string | null = url.toString();
  while (next && campaigns.length < maxCampaigns) {
    const response: Response = await fetch(next, { cache: "no-store" });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof json?.error?.message === "string" ? json.error.message : `Meta campaigns request failed (${response.status})`);
    for (const row of Array.isArray(json.data) ? json.data as Array<Record<string, unknown>> : []) {
      if (typeof row.id !== "string" || !row.id) continue;
      campaigns.push({
        id: row.id,
        name: typeof row.name === "string" && row.name.trim() ? row.name.trim() : null,
        effectiveStatus: typeof row.effective_status === "string" ? row.effective_status : null,
      });
    }
    next = typeof json?.paging?.next === "string" ? json.paging.next : null;
  }
  return campaigns.slice(0, maxCampaigns);
}
