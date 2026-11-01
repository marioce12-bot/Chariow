import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const query: any = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.maybeSingle = vi.fn();
  return { requireUser: vi.fn(), query, signedUrl: vi.fn() };
});

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => mocks.query }) }));
vi.mock("@/lib/studio/media", () => ({ signedStudioUrl: mocks.signedUrl }));
import { GET } from "./route";

const userId = "00000000-0000-4000-8000-000000000001";
const request = () => new Request("https://preview.example/api/studio/video/job-1/content");
const call = (jobId = "job-1") => GET(request(), { params: Promise.resolve({ jobId }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ user: { id: userId } });
  mocks.query.maybeSingle.mockResolvedValue({
    data: { status: "completed", storage_path: `${userId}/video.mp4` },
    error: null,
  });
  mocks.signedUrl.mockResolvedValue("https://signed.example/video.mp4");
});

describe("private Studio video content route", () => {
  it("requires authentication before querying for a job", async () => {
    mocks.requireUser.mockResolvedValue({ user: null, response: new Response("no", { status: 401 }) });

    expect((await call()).status).toBe(401);
    expect(mocks.query.maybeSingle).not.toHaveBeenCalled();
    expect(mocks.signedUrl).not.toHaveBeenCalled();
  });

  it("rejects an invalid job identifier before querying", async () => {
    expect((await call("x".repeat(513))).status).toBe(400);
    expect(mocks.query.maybeSingle).not.toHaveBeenCalled();
    expect(mocks.signedUrl).not.toHaveBeenCalled();
  });

  it("scopes the lookup to the authenticated owner and returns 404 for other jobs", async () => {
    mocks.query.maybeSingle.mockResolvedValue({ data: null, error: null });

    const response = await call();
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.query.eq).toHaveBeenNthCalledWith(1, "user_id", userId);
    expect(mocks.query.eq).toHaveBeenNthCalledWith(2, "video_job_id", "job-1");
    expect(mocks.signedUrl).not.toHaveBeenCalled();
  });

  it("does not sign or expose a video until its generation is completed", async () => {
    mocks.query.maybeSingle.mockResolvedValue({
      data: { status: "processing", storage_path: "private/video.mp4" },
      error: null,
    });

    const response = await call();
    expect(response.status).toBe(409);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.signedUrl).not.toHaveBeenCalled();
  });

  it("redirects completed media to a signed private URL without caching it", async () => {
    const response = await call();

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://signed.example/video.mp4");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.signedUrl).toHaveBeenCalledOnce();
    expect(mocks.signedUrl).toHaveBeenCalledWith(`${userId}/video.mp4`, userId);
  });

  it("returns a private 503 response when the database lookup fails", async () => {
    mocks.query.maybeSingle.mockResolvedValue({ data: null, error: { message: "offline" } });

    const response = await call();
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.signedUrl).not.toHaveBeenCalled();
  });

  it("returns a private 503 response when signing fails", async () => {
    mocks.signedUrl.mockRejectedValue(new Error("signing unavailable"));

    const response = await call();
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
