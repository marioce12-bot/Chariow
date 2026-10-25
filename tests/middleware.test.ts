import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ getUser: vi.fn() }));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({ auth: { getUser: mocks.getUser } })),
}));
vi.mock("@/lib/admin-password-edge", () => ({
  ADMIN_COOKIE: "vendeo_admin_session",
  isAdminSessionValidEdge: vi.fn().mockResolvedValue(false),
}));

import { middleware } from "@/middleware";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
});

afterEach(() => vi.unstubAllEnvs());

describe("middleware auth logging", () => {
  it("does not log an expected missing session as an error", async () => {
    const missingSession = Object.assign(new Error("Auth session missing!"), { name: "AuthSessionMissingError" });
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: missingSession });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await middleware(new NextRequest("https://vendeo.example/login"));

    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("continues to log unexpected Supabase auth errors", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: new Error("Supabase unavailable") });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await middleware(new NextRequest("https://vendeo.example/login"));

    expect(error).toHaveBeenCalledWith("Supabase middleware auth error", "Supabase unavailable");
    error.mockRestore();
  });
});
