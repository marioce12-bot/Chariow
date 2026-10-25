export type SaleCampaignLink = { saleId: string; campaignId: string };

/** Attribue une vente seulement si elle possède un seul lien confirmé vers une campagne. */
export function resolveUniqueSaleCampaignLinks(
  links: readonly SaleCampaignLink[],
  confirmedSaleIds: ReadonlySet<string>,
) {
  const ownersBySale = new Map<string, Set<string>>();
  for (const link of links) {
    if (!confirmedSaleIds.has(link.saleId)) continue;
    const owners = ownersBySale.get(link.saleId) ?? new Set<string>();
    owners.add(link.campaignId);
    ownersBySale.set(link.saleId, owners);
  }

  const saleIdsByCampaign = new Map<string, Set<string>>();
  const ambiguousCampaignIds = new Set<string>();
  const assignedSaleIds = new Set<string>();
  for (const [saleId, owners] of ownersBySale) {
    assignedSaleIds.add(saleId);
    if (owners.size !== 1) {
      for (const campaignId of owners) ambiguousCampaignIds.add(campaignId);
      continue;
    }
    const campaignId = [...owners][0];
    const saleIds = saleIdsByCampaign.get(campaignId) ?? new Set<string>();
    saleIds.add(saleId);
    saleIdsByCampaign.set(campaignId, saleIds);
  }
  return { saleIdsByCampaign, ambiguousCampaignIds, assignedSaleIds };
}
