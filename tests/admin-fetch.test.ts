import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAdminJson, adminReadError } from "@/lib/admin-fetch";
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("bounded admin reads", () => {
  it("reads JSON with no-store and an abort signal", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ users: [] }));
    vi.stubGlobal("fetch", fetch);
    expect(await fetchAdminJson("/api/admin/users")).toEqual({ users: [] });
    expect(fetch).toHaveBeenCalledWith("/api/admin/users", expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }));
  });
  it("settles even if fetch ignores abort", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const result = expect(fetchAdminJson("/api/admin/feedback", { timeoutMs: 10 })).rejects.toThrow("admin_read_timeout");
    await vi.advanceTimersByTimeAsync(11); await result;
  });
  it("also bounds a stuck JSON body", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => new Promise(() => {}) }));
    const result = expect(fetchAdminJson("/api/admin/notifications", { timeoutMs: 10 })).rejects.toThrow("admin_read_timeout");
    await vi.advanceTimersByTimeAsync(11); await result;
  });
  it("cancels superseded searches", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const controller = new AbortController();
    const result = expect(fetchAdminJson("/api/admin/users", { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    controller.abort(); await result;
  });
  it.each([401,403])("classifies denied session %s", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({error:"denied"},{status})));
    await expect(fetchAdminJson("/api/admin/feedback")).rejects.toThrow("admin_read_session");
  });
  it("rejects invalid JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>error</html>")));
    await expect(fetchAdminJson("/api/admin/feedback")).rejects.toThrow("admin_read_invalid");
  });
  it("localizes safe errors without leaking server internals", () => {
    expect(adminReadError(new Error("admin_read_timeout"),"fr")).toContain("trop de temps");
    expect(adminReadError(new Error("admin_read_session"),"en")).toContain("Sign in again");
    expect(adminReadError(new Error("secret internal SQL"),"en")).not.toContain("SQL");
  });
});
