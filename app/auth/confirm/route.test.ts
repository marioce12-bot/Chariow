import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
  mocks.verifyOtp.mockResolvedValue({ error: null });
  mocks.createClient.mockResolvedValue({
    auth: {
      exchangeCodeForSession: mocks.exchangeCodeForSession,
      verifyOtp: mocks.verifyOtp,
    },
  });
});

describe("email confirmation callback", () => {
  it("accepts a signup token hash and redirects to the dashboard", async () => {
    const response = await GET(new Request("https://vendeo.example/auth/confirm?token_hash=signup-token&type=signup&next=%2Fdashboard"));

    expect(mocks.verifyOtp).toHaveBeenCalledWith({ type: "signup", token_hash: "signup-token" });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://vendeo.example/dashboard");
  });

  it("exchanges the signup PKCE code and redirects to the dashboard", async () => {
    const response = await GET(new Request("https://vendeo.example/auth/confirm?code=signup-code&next=%2Fdashboard"));

    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("signup-code");
    expect(response.headers.get("location")).toBe("https://vendeo.example/dashboard");
  });

  it("keeps the password recovery redirect intact", async () => {
    const response = await GET(new Request("https://vendeo.example/auth/confirm?token_hash=recovery-token&type=recovery&next=%2Freset-password"));

    expect(mocks.verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "recovery-token" });
    expect(response.headers.get("location")).toBe("https://vendeo.example/reset-password");
    expect(response.headers.get("set-cookie")).toContain("vendeo_pw_reset=");
  });

  it("returns failed password recovery links to the forgot-password page", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: new Error("invalid token") });
    const response = await GET(new Request("https://vendeo.example/auth/confirm?token_hash=bad-token&type=recovery"));

    expect(response.headers.get("location")).toBe("https://vendeo.example/forgot-password");
  });
});
