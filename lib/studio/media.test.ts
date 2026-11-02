import { afterEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ createSignedUrl: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ storage: { from: () => ({ createSignedUrl: storage.createSignedUrl }) } }) }));
import { signedStudioUrl } from "@/lib/studio/media";

const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "33333333-3333-4333-8333-333333333333";
const path = (name: string) => `${userId}/${name}`;

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe("signedStudioUrl cache and ownership", () => {
  it("coalesces concurrent signatures and caches successful URLs until safely before expiry", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    let resolve!: (value: any) => void;
    storage.createSignedUrl.mockImplementation(() => new Promise(r => { resolve = r; }));
    const first = signedStudioUrl(path("image.png"), userId);
    const second = signedStudioUrl(path("image.png"), userId);
    expect(storage.createSignedUrl).toHaveBeenCalledTimes(1);
    resolve({ data: { signedUrl: "signed-1" }, error: null });
    await expect(Promise.all([first, second])).resolves.toEqual(["signed-1", "signed-1"]);
    await expect(signedStudioUrl(path("image.png"), userId)).resolves.toBe("signed-1");
    expect(storage.createSignedUrl).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(45 * 60 * 1000);
    storage.createSignedUrl.mockResolvedValue({ data: { signedUrl: "signed-2" }, error: null });
    await expect(signedStudioUrl(path("image.png"), userId)).resolves.toBe("signed-2");
    expect(storage.createSignedUrl).toHaveBeenCalledTimes(2);
    expect(storage.createSignedUrl).toHaveBeenLastCalledWith(path("image.png"), 3600);
  });

  it("does not sign a path outside the authenticated user's namespace", async () => {
    await expect(signedStudioUrl(`${otherUserId}/image.png`, userId)).rejects.toThrow("does not belong");
    await expect(signedStudioUrl(`${userId}/../${otherUserId}/image.png`, userId)).rejects.toThrow("does not belong");
    expect(storage.createSignedUrl).not.toHaveBeenCalled();
  });

  it("does not cache a failed signature and allows a later retry", async () => {
    storage.createSignedUrl.mockResolvedValueOnce({ data: null, error: new Error("429") })
      .mockResolvedValueOnce({ data: { signedUrl: "recovered" }, error: null });
    await expect(signedStudioUrl(path("retry.png"), userId)).rejects.toThrow("429");
    await expect(signedStudioUrl(path("retry.png"), userId)).resolves.toBe("recovered");
    expect(storage.createSignedUrl).toHaveBeenCalledTimes(2);
  });

  it("bounds the cache and evicts least-recently-used entries", async () => {
    storage.createSignedUrl.mockImplementation(async (objectPath: string) => ({ data: { signedUrl: `signed:${objectPath}` }, error: null }));
    for (let index = 0; index < 500; index++) await signedStudioUrl(path(`bounded/${index}.png`), userId);
    await signedStudioUrl(path("bounded/0.png"), userId); // Keep this entry hot.
    await signedStudioUrl(path("bounded/500.png"), userId);
    const count = storage.createSignedUrl.mock.calls.length;
    await signedStudioUrl(path("bounded/0.png"), userId);
    expect(storage.createSignedUrl).toHaveBeenCalledTimes(count);
    await signedStudioUrl(path("bounded/1.png"), userId);
    expect(storage.createSignedUrl).toHaveBeenCalledTimes(count + 1);
  });

  it("coalesces a concurrent failure but does not retain it for the next read", async () => {
    let reject!: (value: any) => void;
    storage.createSignedUrl.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    const first = signedStudioUrl(path("concurrent-failure.png"), userId);
    const second = signedStudioUrl(path("concurrent-failure.png"), userId);
    reject(new Error("429"));
    expect((await Promise.allSettled([first, second])).map(item => item.status)).toEqual(["rejected", "rejected"]);
    expect(storage.createSignedUrl).toHaveBeenCalledTimes(1);
    storage.createSignedUrl.mockResolvedValueOnce({ data: { signedUrl: "fresh" }, error: null });
    await expect(signedStudioUrl(path("concurrent-failure.png"), userId)).resolves.toBe("fresh");
    expect(storage.createSignedUrl).toHaveBeenCalledTimes(2);
  });
});
