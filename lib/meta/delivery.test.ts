import { describe, expect, it } from "vitest";
import { evaluateMetaDelivery } from "./delivery";
const createdTime = "2026-01-01T00:00:00Z";
const initial = { effectiveStatus: "ACTIVE", impressions: 0, createdTime, updatedTime: createdTime };
describe("Meta delivery vs approval", () => {
  it("keeps an approved ACTIVE ad in Preparing until at least one impression", () => {
    expect(evaluateMetaDelivery("a", initial, null).state).toBe("preparing");
    expect(evaluateMetaDelivery("a", { ...initial, impressions: 1 }, null).state).toBe("active");
  });
  it.each(["PREPARING", "IN_PROCESS", "PENDING_PROCESS", "PREAPPROVED", "PROCESSING", "PENDING_REVIEW"])("never activates %s even with old impressions", (effectiveStatus) => {
    expect(evaluateMetaDelivery("a", { ...initial, effectiveStatus, impressions: 100 }, null).state).toBe("preparing");
  });
  it("resets after an edit, including same-day edits, and requires new impressions", () => {
    const first = evaluateMetaDelivery("a", { ...initial, impressions: 100 }, null);
    const edited = { ...initial, impressions: 100, updatedTime: "2026-01-01T00:10:00Z" };
    const reset = evaluateMetaDelivery("a", edited, first.observation);
    expect(reset.state).toBe("preparing");
    expect(evaluateMetaDelivery("a", edited, reset.observation).state).toBe("preparing");
    const delivered = evaluateMetaDelivery("a", { ...edited, impressions: 101 }, reset.observation);
    expect(delivered.state).toBe("active");
    expect(evaluateMetaDelivery("a", { ...edited, impressions: 101 }, delivered.observation).state).toBe("active");
  });
  it("does not reuse proof for a different ad or future/invalid timestamps", () => {
    const previous = evaluateMetaDelivery("old", { ...initial, impressions: 100 }, null).observation;
    expect(evaluateMetaDelivery("new", { ...initial, impressions: 100, updatedTime: "2026-01-02T00:00:00Z" }, previous).state).toBe("preparing");
    for (const snapshot of [{ ...initial, updatedTime: "2999-01-01T00:00:00Z" }, { ...initial, updatedTime: null }, { ...initial, impressions: null }, { ...initial, impressions: NaN }]) expect(evaluateMetaDelivery("a", snapshot, null).state).toBe("unknown");
  });
  it("cannot reuse confirmed delivery after an explicit Preparing response", () => {
    const previous = evaluateMetaDelivery("a", { ...initial, impressions: 100 }, null).observation;
    const reset = evaluateMetaDelivery("a", { ...initial, effectiveStatus: "PREPARING", impressions: 100 }, previous);
    expect(reset.observation?.confirmed).toBe(false);
    expect(evaluateMetaDelivery("a", { ...initial, impressions: 100 }, reset.observation).state).toBe("preparing");
  });
});
