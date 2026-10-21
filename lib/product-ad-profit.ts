/** Normalized product identifiers from products: id is internal; chariowProductId is the external sales ID. */
export type AdProfitProduct = { id: string; chariowProductId?: string | null; name?: string | null; destinationUrl?: string | null };
export type AdProfitCampaign = {
  id: string;
  productId?: string | null;
  destinationUrl?: string | null;
  metaCampaignId?: string | null;
  /** Explicit Meta account association; absent with multiple possible accounts is unknown. */
  accountId?: string | null;
};
export type AdProfitCampaignProductLink = { campaignId: string; productId: string; productUrl?: string | null };
export type AdProfitInsight = {
  accountId: string; level: string; entityId: string; dateStart: string; dateStop?: string | null;
  spend: number | string | null; conversions?: number | string | null; conversionValue?: number | string | null;
};
export type AdProfitAccount = {
  id: string; currency: string; lastSyncedAt?: string | null; syncError?: string | null;
  syncComplete?: boolean | null; syncedFrom?: string | null; syncedTo?: string | null;
};
export type ProductAdProfitInput = {
  products: AdProfitProduct[]; campaigns: AdProfitCampaign[]; links: AdProfitCampaignProductLink[];
  accounts: AdProfitAccount[]; insights: AdProfitInsight[]; since: string; until: string;
  /** Existing aggregateProductProfit result(s); Chariow fees are already reflected in netRevenue. */
  aggregate: Array<{ productId: string; currency: string; netRevenue: number | null; totalCosts: number }>;
  now?: Date; maxSyncAgeMs?: number; salesComplete?: boolean;
};
export type ProductAdProfitResult = {
  productId: string; currency: string; adSpendByCurrency: Array<{ currency: string; amount: number | null }>;
  linkedCampaignCount: number; adSpend: number | null;
  adSpendStatus: "complete" | "partial" | "unavailable" | "ambiguous"; adSpendReasons: string[];
  profit: number | null; metaPurchases: number | null; metaPurchaseValue: number | null; metaCurrency: string | null;
  metaConversionsByCurrency: Array<{ currency: string; purchases: number | null; value: number | null }>;
};
const numberOrNull = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  const n = Number(value); return Number.isFinite(n) ? n : null;
};
const validDay = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Enrich supplied sales aggregates with explicitly linked campaign spend; never infers or proportionally allocates. */
export function enrichProductAdProfit(input: ProductAdProfitInput): ProductAdProfitResult[] {
  const periodValid = validDay(input.since) && validDay(input.until) && input.since <= input.until;
  const aliases = new Map<string, Set<string>>();
  for (const p of input.products) for (const alias of [p.id, p.chariowProductId].filter((x): x is string => !!x?.trim())) {
    const ids = aliases.get(alias) ?? new Set<string>(); ids.add(p.id); aliases.set(alias, ids);
  }
  const resolve = (raw?: string | null): string[] => raw ? [...(aliases.get(raw) ?? new Set([raw]))] : [];
  const resolvedAggregateId = (id: string) => resolve(id);
  const byMeta = new Map<string, AdProfitCampaign[]>();
  for (const c of input.campaigns) { const key = c.metaCampaignId?.trim() || c.id; const rows = byMeta.get(key) ?? []; rows.push(c); byMeta.set(key, rows); }
  const urls = new Map<string, Set<string>>();
  for (const p of input.products) if (p.destinationUrl) { const set = urls.get(p.destinationUrl) ?? new Set<string>(); set.add(p.id); urls.set(p.destinationUrl, set); }
  const linkMap = new Map<string, AdProfitCampaignProductLink[]>();
  for (const l of input.links) { const a = linkMap.get(l.campaignId) ?? []; a.push(l); linkMap.set(l.campaignId, a); }
  const accountMap = new Map(input.accounts.map(a => [a.id, a]));
  return input.aggregate.map(aggregate => {
    const targetIds = new Set(resolvedAggregateId(aggregate.productId));
    const linked = new Map<string, { campaign: AdProfitCampaign; ambiguous: boolean }>();
    const ambiguousForProduct = new Set<string>();
    for (const [metaId, campaigns] of byMeta) {
      const targets = new Set<string>();
      for (const c of campaigns) {
        resolve(c.productId).forEach(id => targets.add(id));
        for (const l of linkMap.get(c.id) ?? []) resolve(l.productId).forEach(id => targets.add(id));
        const matched = c.destinationUrl ? urls.get(c.destinationUrl) : undefined;
        if (matched?.size === 1) targets.add([...matched][0]);
        else if (matched && matched.size > 1) matched.forEach(id => ambiguousForProduct.add(id));
      }
      const multi = targets.size > 1;
      if (multi) targets.forEach(id => ambiguousForProduct.add(id));
      if ([...targets].some(id => targetIds.has(id))) linked.set(metaId, { campaign: campaigns[0], ambiguous: multi });
    }
    const reasons: string[] = [];
    let spendUnknown = false;
    let allConversionsKnown = true;
    const spendByCurrency = new Map<string, number>();
    const conversionTotals = new Map<string, { purchases: number; value: number; known: boolean }>();
    const expectedDays = periodValid ? Math.round((Date.parse(`${input.until}T00:00:00Z`) - Date.parse(`${input.since}T00:00:00Z`)) / 86400000) + 1 : 0;
    for (const [metaId, item] of linked) {
      const { campaign } = item;
      if (item.ambiguous) { spendUnknown = true; allConversionsKnown = false; reasons.push(`Campagne multi-produit ${metaId} non allouée.`); continue; }
      const candidateAccounts = campaign.accountId ? [accountMap.get(campaign.accountId)].filter((a): a is AdProfitAccount => !!a) : input.accounts.length === 1 ? input.accounts : [];
      const matchingRows = input.insights.filter(r => r.level === "campaign" && r.entityId === metaId && (!campaign.accountId || r.accountId === campaign.accountId));
      const account = candidateAccounts.length === 1 ? candidateAccounts[0] : null;
      if (!account) { spendUnknown = true; allConversionsKnown = false; reasons.push(`Compte Meta absent ou ambigu pour campagne ${metaId}.`); continue; }
      const curr = account.currency?.trim().toUpperCase();
      const rows = matchingRows.filter(r => r.accountId === account.id && r.dateStart >= input.since && r.dateStart <= input.until);
      const syncedAt = account.lastSyncedAt ? Date.parse(account.lastSyncedAt) : NaN;
      const age = (input.now ?? new Date()).getTime() - syncedAt;
      const fresh = Number.isFinite(syncedAt) && age >= 0 && age <= (input.maxSyncAgeMs ?? 48 * 60 * 60 * 1000);
      const coverage = !!account.syncComplete && !account.syncError && !!account.syncedFrom && !!account.syncedTo && account.syncedFrom <= input.since && account.syncedTo >= input.until && fresh;
      const conv = curr ? (conversionTotals.get(curr) ?? { purchases: 0, value: 0, known: true }) : null;
      if (!periodValid || !coverage || !rows.length || !curr) {
        spendUnknown = true; allConversionsKnown = false; if (conv) conv.known = false;
        reasons.push(!rows.length ? `Aucune donnée quotidienne pour campagne ${metaId}.` : `Couverture/synchronisation Meta incomplète ou périmée pour compte ${account.id}.`);
        if (conv && curr) conversionTotals.set(curr, conv); continue;
      }
      const days = new Set<string>(); let spend = 0; let spendKnown = true;
      for (const r of rows) {
        if (!validDay(r.dateStart) || (r.dateStop && r.dateStop !== r.dateStart) || days.has(r.dateStart)) { spendKnown = false; allConversionsKnown = false; }
        days.add(r.dateStart);
        const amount = numberOrNull(r.spend); if (amount == null || amount < 0) spendKnown = false; else spend += amount;
        const purchases = numberOrNull(r.conversions), value = numberOrNull(r.conversionValue);
        if (conv) { if (purchases == null || value == null) { conv.known = false; allConversionsKnown = false; } else { conv.purchases += purchases; conv.value += value; } }
      }
      if (conv && curr) conversionTotals.set(curr, conv);
      if (days.size !== expectedDays) allConversionsKnown = false;
      if (!spendKnown || days.size !== expectedDays) { spendUnknown = true; reasons.push(`Dépenses quotidiennes incomplètes pour campagne ${metaId}.`); continue; }
      spendByCurrency.set(curr, (spendByCurrency.get(curr) ?? 0) + spend);
    }
    if (!linked.size) reasons.push("Aucune campagne explicitement rattachée au produit.");
    const ambiguous = [...targetIds].some(id => ambiguousForProduct.has(id)) || [...linked.values()].some(x => x.ambiguous);
    if (ambiguous && !reasons.some(r => r.includes("multi-produit"))) reasons.push("Attribution ambiguë : aucune allocation effectuée.");
    const currencies = new Set(input.aggregate.filter(a => resolvedAggregateId(a.productId).some(id => [...targetIds].includes(id))).map(a => a.currency.toUpperCase()));
    const multiCurrency = spendByCurrency.size > 1 || (spendByCurrency.size === 1 && !spendByCurrency.has(aggregate.currency.toUpperCase()));
    const multipleAggregateCurrencies = currencies.size > 1;
    if (multiCurrency) reasons.push("Devises publicitaires multiples ou différentes de la devise produit : aucune conversion fiable appliquée.");
    if (multipleAggregateCurrencies) reasons.push("Plusieurs devises de ventes pour ce produit : dépense non attribuée sans clé explicite.");
    if (input.salesComplete === false) reasons.push("Ventes incomplètes : le profit ne peut pas être calculé.");
    const adSpendByCurrency = [...spendByCurrency].map(([currency, amount]) => ({ currency, amount: spendUnknown ? null : round(amount) }));
    const conversions = [...conversionTotals].map(([currency, v]) => ({ currency, purchases: v.known && allConversionsKnown ? round(v.purchases) : null, value: v.known && allConversionsKnown ? round(v.value) : null }));
    const oneSpend = spendByCurrency.size === 1 ? [...spendByCurrency.values()][0] : null;
    const complete = periodValid && !spendUnknown && !ambiguous && !multiCurrency && !multipleAggregateCurrencies && linked.size > 0 && oneSpend != null;
    const adSpend = complete ? round(oneSpend!) : null;
    const onlyConversion = conversions.length === 1 ? conversions[0] : null;
    const profitRow = input.aggregate.find(x => resolvedAggregateId(x.productId).some(id => targetIds.has(id)) && x.currency.toUpperCase() === aggregate.currency.toUpperCase());
    return { productId: aggregate.productId, currency: aggregate.currency, adSpendByCurrency, linkedCampaignCount: linked.size, adSpend,
      adSpendStatus: ambiguous ? "ambiguous" : !linked.size || spendByCurrency.size === 0 ? "unavailable" : complete ? "complete" : "partial",
      adSpendReasons: reasons, profit: complete && input.salesComplete !== false && profitRow?.netRevenue != null ? round(profitRow.netRevenue - profitRow.totalCosts - adSpend!) : null,
      metaPurchases: onlyConversion?.purchases ?? null, metaPurchaseValue: onlyConversion?.value ?? null, metaCurrency: onlyConversion?.currency ?? null,
      metaConversionsByCurrency: conversions };
  });
}
