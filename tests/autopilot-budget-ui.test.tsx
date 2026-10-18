import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { currencyFractionDigits, validateAutopilotBudgetAmount } from "../components/vendeo/AutopilotBudgetLimit";

describe("autopilot budget UI contract", () => {
  it("validates positive finite amounts and currency precision, accepting French decimal commas", () => {
    expect(validateAutopilotBudgetAmount("12,50", "USD")).toEqual({ valid: true, value: 12.5 });
    expect(validateAutopilotBudgetAmount("1", "XOF")).toEqual({ valid: true, value: 1 });
    expect(validateAutopilotBudgetAmount("1.25", "EUR")).toEqual({ valid: true, value: 1.25 });
    expect(currencyFractionDigits("JPY")).toBe(0);
    for (const input of ["", "0", "-1", "1e3", "Infinity", "1.001"]) {
      expect(validateAutopilotBudgetAmount(input, "USD").valid, input).toBe(false);
    }
    expect(validateAutopilotBudgetAmount("1.5", "JPY").valid).toBe(false);
    expect(validateAutopilotBudgetAmount("1", "EUR").valid).toBe(true);
  });

  it("keeps the inactive rendering free of budget fields and avoids GET until activation is opened", () => {
    const source = readFileSync(resolve(__dirname, "../components/vendeo/AutopilotBudgetLimit.tsx"), "utf8");
    expect(source).toContain("enabled = false");
    expect(source).toContain("!active ? <>");
    expect(source).toContain("{!activationOpen ? <div className=\"abl-actions\">");
    expect(source).toContain("setActivationOpen(true); setAmount(\"\"); void loadCurrency(true);");
    expect(source).toContain("const titleId = `autopilot-budget-title-${uniqueId}`");
    expect(source).toContain("setActive(enabled)");
    expect(source).toContain("onEnabledChange?.(activate)");
    expect(source).toContain("onBudgetSaved?.()");
  });

  it("uses only the activation and budget-limit API contracts, without campaign budget or platform launch calls", () => {
    const source = readFileSync(resolve(__dirname, "../components/vendeo/AutopilotBudgetLimit.tsx"), "utf8");
    expect(source).toContain("method: \"POST\"");
    expect(source).toContain("payload = { enabled: true, budget_limit: parsed.value!, currency: data.currency }");
    expect(source).toContain("method: \"PATCH\"");
    expect(source).toContain("/budget-limit");
    expect(source).not.toMatch(/fetch\([^\n]*(?:launch|activate|campaign-budget)/i);
  });
});
