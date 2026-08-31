export type ProfitabilityInputs = {
  price: number;
  productCost: number;
  platformFees: number;
  otherVariableCosts: number;
  adSpend: number;
  conversionRate: number;
  refundRate: number;
  targetProfitPerSale?: number;
};

export type ProfitabilityResult = {
  contributionMargin: number;
  maxCpa: number;
  breakEvenRoas: number | null;
  netRevenue: number;
  expectedSales: number;
  expectedProfit: number;
  actualCpa: number | null;
  actualRoas: number | null;
  marginRate: number;
  status: "profitable" | "break_even" | "unprofitable";
};

export type ProfitScenario = ProfitabilityResult & {
  name: "conservateur" | "central" | "agressif";
  assumptions: { budget: number; conversionRate: number; refundRate: number };
};

function nonNegative(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

export function calculateProfitability(raw: ProfitabilityInputs): ProfitabilityResult {
  const price = nonNegative(raw.price);
  const productCost = nonNegative(raw.productCost);
  const platformFees = nonNegative(raw.platformFees);
  const otherVariableCosts = nonNegative(raw.otherVariableCosts);
  const adSpend = nonNegative(raw.adSpend);
  const conversionRate = Math.min(1, nonNegative(raw.conversionRate));
  const refundRate = Math.min(1, nonNegative(raw.refundRate));
  const contributionMargin = Math.max(0, price * (1 - refundRate) - productCost - platformFees - otherVariableCosts);
  const expectedSales = adSpend > 0 && conversionRate > 0 ? adSpend * conversionRate : 0;
  const netRevenue = expectedSales * price * (1 - refundRate);
  const expectedProfit = expectedSales * contributionMargin - adSpend;
  const actualCpa = ratio(adSpend, expectedSales);
  const actualRoas = ratio(netRevenue, adSpend);
  const breakEvenRoas = ratio(price * (1 - refundRate), contributionMargin);
  const targetProfitPerSale = nonNegative(raw.targetProfitPerSale);
  const maxCpa = Math.max(0, contributionMargin - targetProfitPerSale);
  const marginRate = price > 0 ? contributionMargin / price : 0;

  return {
    contributionMargin,
    maxCpa,
    breakEvenRoas,
    netRevenue,
    expectedSales,
    expectedProfit,
    actualCpa,
    actualRoas,
    marginRate,
    status: expectedProfit > 0 ? "profitable" : expectedProfit === 0 ? "break_even" : "unprofitable",
  };
}

export function buildProfitScenarios(inputs: ProfitabilityInputs): ProfitScenario[] {
  const baseBudget = nonNegative(inputs.adSpend);
  const baseConversion = Math.min(1, nonNegative(inputs.conversionRate));
  const baseRefund = Math.min(1, nonNegative(inputs.refundRate));
  const scenarios = [
    { name: "conservateur" as const, budget: baseBudget * 0.8, conversionRate: baseConversion * 0.75, refundRate: Math.min(1, baseRefund + 0.02) },
    { name: "central" as const, budget: baseBudget, conversionRate: baseConversion, refundRate: baseRefund },
    { name: "agressif" as const, budget: baseBudget * 1.25, conversionRate: Math.min(1, baseConversion * 1.15), refundRate: baseRefund },
  ];

  return scenarios.map((scenario) => {
    const result = calculateProfitability({ ...inputs, adSpend: scenario.budget, conversionRate: scenario.conversionRate, refundRate: scenario.refundRate });
    return { ...result, name: scenario.name, assumptions: scenario };
  });
}

export function getProfitRecommendation(result: ProfitabilityResult): { tone: "positive" | "warning" | "danger"; title: string; description: string } {
  if (result.status === "profitable") {
    return { tone: "positive", title: "Cette offre peut absorber de la publicité", description: `Il reste ${formatMoney(result.maxCpa)} de CPA maximum par vente avant d'atteindre ton seuil cible.` };
  }
  if (result.status === "break_even") {
    return { tone: "warning", title: "Tu es au point mort", description: "Chaque vente couvre les coûts, mais ne crée pas encore de bénéfice après publicité." };
  }
  return { tone: "danger", title: "La publicité brûle du cash", description: `Ton coût publicitaire dépasse la marge disponible de ${formatMoney(result.maxCpa)} par vente. Réduis le budget ou améliore l'offre.` };
}

export function formatMoney(value: number | null, currency = "XOF"): string {
  if (value === null || !Number.isFinite(value)) return "n/d";
  return `${Math.round(value).toLocaleString("fr-FR")} ${currency}`;
}
