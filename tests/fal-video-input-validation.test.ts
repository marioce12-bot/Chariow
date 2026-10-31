import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  submit: vi.fn(),
  status: vi.fn(),
  result: vi.fn(),
  subscribe: vi.fn(),
}));

vi.mock("@fal-ai/client", () => ({
  fal: {
    config: mocks.config,
    queue: { submit: mocks.submit, status: mocks.status, result: mocks.result },
    subscribe: mocks.subscribe,
  },
}));

import { createFalVideo, getFalVideoJob, getFalVideoUrl } from "@/lib/ai/fal";
import { FalVideoInputRejectedError } from "@/lib/studio/fal-video-contract";

const originalFalKey = process.env.FAL_API_KEY;
const options = { duration: 15 as const, resolution: "480p" as const, aspectRatio: "16:9" as const };
const providerJobId = "xai/grok-imagine-video/v1.5/text-to-video::request-id";

beforeEach(() => {
  process.env.FAL_API_KEY = "unit-test-only";
  mocks.config.mockReset();
  mocks.submit.mockReset();
  mocks.status.mockReset();
  mocks.result.mockReset();
  mocks.subscribe.mockReset();
});

afterEach(() => {
  if (originalFalKey === undefined) delete process.env.FAL_API_KEY;
  else process.env.FAL_API_KEY = originalFalKey;
});

describe("Fal video input validation", () => {
  it("blocks an over-budget prompt locally before Fal submission", async () => {
    await expect(createFalVideo("x".repeat(3_601), options)).rejects.toMatchObject({
      name: "FalVideoInputRejectedError",
      code: "STUDIO_VIDEO_PROMPT_TOO_LONG",
    });
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("classifies a provider HTTP 422 during submission as a definitive input rejection", async () => {
    mocks.submit.mockRejectedValueOnce(Object.assign(new Error("Unprocessable Entity"), {
      status: 422,
      body: { detail: "String should have at most 4096 characters" },
    }));
    await expect(createFalVideo("short prompt", options)).rejects.toMatchObject({
      name: "FalVideoInputRejectedError",
      code: "STUDIO_VIDEO_PROVIDER_INPUT_REJECTED",
      httpStatus: 422,
    });
  });

  it("does not classify HTTP 422 from status polling after submission as input rejection", async () => {
    mocks.status.mockRejectedValueOnce(Object.assign(new Error("Unprocessable Entity"), { status: 422 }));
    const error = await getFalVideoJob(providerJobId).catch((value: unknown) => value as Error & { status?: number });
    expect(error).toMatchObject({ status: 422 });
    expect(error).not.toBeInstanceOf(FalVideoInputRejectedError);
  });

  it("does not classify HTTP 422 from result retrieval after submission as input rejection", async () => {
    mocks.result.mockRejectedValueOnce(Object.assign(new Error("Unprocessable Entity"), {
      status: 422,
      body: { detail: "Result metadata is temporarily unavailable" },
    }));
    const error = await getFalVideoUrl(providerJobId).catch((value: unknown) => value as Error & { status?: number });
    expect(error).toMatchObject({ status: 422 });
    expect(error).not.toBeInstanceOf(FalVideoInputRejectedError);
  });

  it("logs safe validation details for a result GET 422 without logging input values", async () => {
    const privateInput = "PRIVATE VIDEO PROMPT MUST NOT BE LOGGED";
    const logger = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.result.mockRejectedValueOnce(Object.assign(new Error("Unprocessable Entity"), {
      status: 422,
      requestId: "fal-response-id",
      body: { detail: [{ loc: ["body", "prompt"], msg: `Provider rejected ${privateInput}`, type: "value_error", input: privateInput }] },
    }));

    await expect(getFalVideoUrl(providerJobId)).rejects.toMatchObject({ status: 422 });

    expect(mocks.result).toHaveBeenCalledWith("xai/grok-imagine-video/v1.5/text-to-video", { requestId: "request-id" });
    expect(logger).toHaveBeenCalledWith("[studio-video] Fal queue result GET failed", expect.objectContaining({
      stage: "fal_queue_result_get",
      model: "xai/grok-imagine-video/v1.5/text-to-video",
      requestId: "request-id",
      providerStatus: 422,
      providerRequestId: "fal-response-id",
      validationDetail: [{ location: ["body", "prompt"], type: "value_error" }],
    }));
    expect(JSON.stringify(logger.mock.calls)).not.toContain(privateInput);
    logger.mockRestore();
  });

  it("does not classify unknown network failures as deterministic validation", async () => {
    mocks.submit.mockRejectedValueOnce(new Error("network timeout"));
    await expect(createFalVideo("short prompt", options)).rejects.not.toBeInstanceOf(FalVideoInputRejectedError);
  });
});
