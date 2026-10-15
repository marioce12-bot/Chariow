/**
 * Retire le `utm_campaign` posé par Vendeo pour la campagne `campaignId`.
 * withVendeoCampaignTracking ne remplace jamais un `utm_campaign` existant : un lien copié
 * d'une campagne déjà lancée garderait donc l'identifiant de l'original, et les ventes de la
 * copie lui seraient attribuées. Un `utm_campaign` différent (saisi par l'utilisateur) est conservé.
 */
export function stripVendeoCampaignTracking(destination: string, campaignId: string): string {
  try {
    const url = new URL(destination);
    if (url.searchParams.get("utm_campaign") !== campaignId) return destination;
    url.searchParams.delete("utm_campaign");
    return url.toString();
  } catch {
    return destination;
  }
}

export function withVendeoCampaignTracking(destination: string, campaignId: string): string {
  const url = new URL(destination);
  if (!url.searchParams.has("utm_source")) url.searchParams.set("utm_source", "vendeo");
  if (!url.searchParams.has("utm_medium")) url.searchParams.set("utm_medium", "paid_social");
  if (!url.searchParams.has("utm_campaign")) url.searchParams.set("utm_campaign", campaignId);
  return url.toString();
}
