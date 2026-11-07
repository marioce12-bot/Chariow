import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parentingDescription, parentingInput, parentingNarrative, parentingProduct } from "./fixtures/ugc-parenting";
import { detailedParentingNarrative } from "./fixtures/ugc-parenting-detailed";
import { readPreparedUgc } from "@/lib/studio/ugc-prepared-plan";

const { requireUser, askText } = vi.hoisted(() => ({ requireUser: vi.fn(), askText: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/ai/text", () => ({ askText }));
vi.mock("@/lib/studio/video-feature", () => ({ isStudioVideoEnabled: vi.fn().mockResolvedValue(true) }));
import { POST } from "@/app/api/studio/prompt/route";

const request = () => new Request("https://example.test/api/studio/prompt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product: parentingProduct, mediaType: "video", duration: 30, locale: "fr", ugcOptions: { language: "fr" } }) });
const logs: unknown[][] = [];
beforeEach(() => {
  vi.clearAllMocks();
  logs.length = 0;
  requireUser.mockResolvedValue({ user: { id: "synthetic-owner" } });
  vi.stubEnv("STUDIO_UGC_SIGNING_SECRET", "synthetic-signing-key-not-a-real-secret");
  for (const method of ["info", "warn", "error"] as const) vi.spyOn(console, method).mockImplementation((...args) => { logs.push(args); });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
const expectNoSourceLogs = () => {
  const serialized = JSON.stringify(logs);
  expect(serialized.includes(parentingProduct.name)).toBe(false);
  expect(serialized.includes(parentingDescription.slice(0, 80))).toBe(false);
  expect(serialized.includes(parentingNarrative.slice(0, 80))).toBe(false);
};

describe("synthetic UGC prompt-button text budget", () => {
  it("prepares a detailed valid 30-second scenario without losing original evidence", async () => {
    askText.mockResolvedValue(detailedParentingNarrative);
    const response = await POST(request());
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(askText).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(askText.mock.calls[0][0][1].content);
    expect(payload.product.description === parentingInput.product.description).toBe(true);
    expect(result.prompt.length).toBeLessThanOrEqual(4000);
    expect(result.plan.segments.map((segment: { duration: number }) => segment.duration)).toEqual([15, 15]);
    expect(result.plan.segments.every((segment: { prompt: string }) => Array.from(segment.prompt).length <= 3600)).toBe(true);
    const prepared = readPreparedUgc(result.preparedUgc, "synthetic-owner", parentingInput, result.prompt);
    expect(prepared?.product.description === parentingInput.product.description).toBe(true);
    expect(prepared?.narrative === detailedParentingNarrative).toBe(true);
    expectNoSourceLogs();
  });

  it("still rejects unsupported numeric claims with the same status and generic public message", async () => {
    askText.mockResolvedValue(parentingNarrative.replace("65 pages", "66 pages"));
    const response = await POST(request());
    const result = await response.json();
    expect(response.status).toBe(502);
    expect(result.failureRule).toBe("unsupported_numeric_claim");
    expect(result.error === "Le scénario n’a pas pu être généré, réessaie.").toBe(true);
    expectNoSourceLogs();
  });

  it("still fails closed when the authored prose itself cannot fit, without logging source data", async () => {
    askText.mockResolvedValue(`${"Décor calme et naturel. ".repeat(180)}\n${parentingNarrative}`);
    const response = await POST(request());
    const result = await response.json();
    expect(response.status).toBe(502);
    expect(result.failureRule).toBe("prompt_assembly_error");
    expect(result.error === "Le scénario n’a pas pu être généré, réessaie.").toBe(true);
    expectNoSourceLogs();
  });
});
