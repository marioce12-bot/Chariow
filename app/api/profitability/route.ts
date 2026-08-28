import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { buildProfitScenarios, calculateProfitability, getProfitRecommendation, type ProfitabilityInputs } from "@/lib/profitability";

function validInputs(value: unknown): ProfitabilityInputs | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const required = ["price", "productCost", "platformFees", "otherVariableCosts", "adSpend", "conversionRate", "refundRate"];
  if (required.some((key) => typeof input[key] !== "number" || !Number.isFinite(input[key] as number))) return null;
  return {
    price: input.price as number,
    productCost: input.productCost as number,
    platformFees: input.platformFees as number,
    otherVariableCosts: input.otherVariableCosts as number,
    adSpend: input.adSpend as number,
    conversionRate: input.conversionRate as number,
    refundRate: input.refundRate as number,
    targetProfitPerSale: typeof input.targetProfitPerSale === "number" ? input.targetProfitPerSale : undefined,
  };
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => null);
  const inputs = validInputs(body?.inputs);
  if (!inputs) return NextResponse.json({ error: "Les paramètres financiers sont invalides." }, { status: 400 });
  const result = calculateProfitability(inputs);
  return NextResponse.json({ result, recommendation: getProfitRecommendation(result), scenarios: buildProfitScenarios(inputs) });
}
