import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), insert: vi.fn(), requireAdmin: vi.fn(), select: vi.fn(), order: vi.fn(), limit: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, from: () => ({ insert: mocks.insert }) })) }));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({ from: () => ({ select: mocks.select }) })) }));

import { POST } from "@/app/api/feedback/route";
import { GET } from "@/app/api/admin/feedback/route";

beforeEach(() => { vi.clearAllMocks(); });

describe("feedback routes", () => {
  it("rejects unauthenticated submissions and never inserts them", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await POST(new Request("http://localhost/api/feedback", { method: "POST", body: JSON.stringify({ rating: 5, message: "Great" }) }));
    expect(response.status).toBe(401);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("stores a validated rating and message for the authenticated user", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    mocks.insert.mockResolvedValue({ error: null });
    const response = await POST(new Request("http://localhost/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rating: 4, message: "  Une idée utile  " }) }));
    expect(response.status).toBe(201);
    expect(mocks.insert).toHaveBeenCalledWith({ user_id: "user-123", rating: 4, message: "Une idée utile" });
  });

  it("blocks non-admin access to feedback administration", async () => {
    mocks.requireAdmin.mockResolvedValue({ admin: null, response: Response.json({ error: "Accès administrateur requis" }, { status: 403 }) });
    const response = await GET();
    expect(response.status).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("returns feedback to an authorized administrator", async () => {
    const rows = [{ id: "feedback-1", rating: 5, message: "Bravo" }];
    mocks.requireAdmin.mockResolvedValue({ admin: { id: "admin-1" }, response: null });
    mocks.select.mockReturnValue({ order: mocks.order });
    mocks.order.mockReturnValue({ limit: mocks.limit });
    mocks.limit.mockResolvedValue({ data: rows, error: null });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ feedback: rows });
    expect(mocks.select).toHaveBeenCalledWith("id,user_id,rating,message,status,created_at,processed_at");
    expect(mocks.limit).toHaveBeenCalledWith(500);
  });
});
