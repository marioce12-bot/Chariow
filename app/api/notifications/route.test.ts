import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));

import { GET } from "./route";

function query(result: unknown) {
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/notifications", () => {
  it("falls back to base columns when the notification enhancement migration is not applied", async () => {
    const row = { id: "notification-123", type: "system", title: "Info", body: "Texte", action_url: null, metadata: null, read_at: null, created_at: "2026-11-03T12:00:00Z" };
    const primary = query({ data: null, error: { code: "42703", message: "column user_notifications.category does not exist" } });
    const legacy = query({ data: [row], error: null });
    const from = vi.fn().mockReturnValueOnce(primary).mockReturnValueOnce(legacy);
    mocks.requireUser.mockResolvedValue({ supabase: { from }, user: { id: "user-123" }, response: null });

    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      notifications: [{ ...row, category: "general", replies_enabled: false }],
      unreadCount: 1,
    });
    expect(from).toHaveBeenCalledTimes(2);
    expect(legacy.select).toHaveBeenCalledWith("id,type,title,body,action_url,metadata,read_at,created_at");
  });

  it("does not hide unrelated database errors", async () => {
    const primary = query({ data: null, error: { code: "42501", message: "permission denied" } });
    const from = vi.fn().mockReturnValue(primary);
    mocks.requireUser.mockResolvedValue({ supabase: { from }, user: { id: "user-123" }, response: null });

    const response = await GET();
    expect(response.status).toBe(500);
    expect(from).toHaveBeenCalledTimes(1);
  });
});
