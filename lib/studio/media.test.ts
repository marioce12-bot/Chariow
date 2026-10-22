import { afterEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ createSignedUrl: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ storage: { from: () => ({ createSignedUrl: storage.createSignedUrl }) } }) }));
import { signedStudioUrl } from "@/lib/studio/media";

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe("signedStudioUrl cache", () => {
  it("coalesces concurrent signatures and caches successful URLs until safely before expiry", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    let resolve!: (value: any) => void;
    storage.createSignedUrl.mockImplementation(() => new Promise(r => { resolve = r; }));
    const first = signedStudioUrl("user/image.png");
    const second = signedStudioUrl("user/image.png");
    expect(storage.createSignedUrl).toHaveBeenCalledTimes(1);
    resolve({ data: { signedUrl: "signed-1" }, error: null });
    await expect(Promise.all([first, second])).resolves.toEqual(["signed-1", "signed-1"]);
    await expect(signedStudioUrl("user/image.png")).resolves.toBe("signed-1");
    expect(storage.createSignedUrl).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(45 * 60 * 1000);
    storage.createSignedUrl.mockResolvedValue({ data: { signedUrl: "signed-2" }, error: null });
    await expect(signedStudioUrl("user/image.png")).resolves.toBe("signed-2");
    expect(storage.createSignedUrl).toHaveBeenCalledTimes(2);
    expect(storage.createSignedUrl).toHaveBeenLastCalledWith("user/image.png", 3600);
  });

  it("does not cache a failed signature and allows a later retry", async () => {
    storage.createSignedUrl.mockResolvedValueOnce({ data: null, error: new Error("429") })
      .mockResolvedValueOnce({ data: { signedUrl: "recovered" }, error: null });
    await expect(signedStudioUrl("user/retry.png")).rejects.toThrow("429");
    await expect(signedStudioUrl("user/retry.png")).resolves.toBe("recovered");
    expect(storage.createSignedUrl).toHaveBeenCalledTimes(2);
  });
  it("bounds the cache and evicts least-recently-used entries", async () => {
    storage.createSignedUrl.mockImplementation(async (path: string) => ({ data: { signedUrl: `signed:${path}` }, error: null }));
    for (let index = 0; index < 500; index++) await signedStudioUrl(`bounded/${index}.png`);
    await signedStudioUrl("bounded/0.png"); // Keep this entry hot.
    await signedStudioUrl("bounded/500.png");
    const count = storage.createSignedUrl.mock.calls.length;
    await signedStudioUrl("bounded/0.png");
    expect(storage.createSignedUrl).toHaveBeenCalledTimes(count);
    await signedStudioUrl("bounded/1.png");
    expect(storage.createSignedUrl).toHaveBeenCalledTimes(count + 1);
  });

  it("coalesces a concurrent failure but does not retain it for the next read", async () => {
    let reject!: (value: any) => void;
    storage.createSignedUrl.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    const first = signedStudioUrl("user/concurrent-failure.png");
    const second = signedStudioUrl("user/concurrent-failure.png");
    reject(new Error("429"));
    expect((await Promise.allSettled([first, second])).map(item => item.status)).toEqual(["rejected", "rejected"]);
    expect(storage.createSignedUrl).toHaveBeenCalledTimes(1);
    storage.createSignedUrl.mockResolvedValueOnce({ data: { signedUrl: "fresh" }, error: null });
    await expect(signedStudioUrl("user/concurrent-failure.png")).resolves.toBe("fresh");
    expect(storage.createSignedUrl).toHaveBeenCalledTimes(2);
  });

});
