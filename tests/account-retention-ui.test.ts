import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
describe("account retention UI contract", () => {
  it("offers existing-account OTP without creating an auth user", () => {
    const auth = read("components/Auth.tsx");
    expect(auth).toContain("signInWithOtp");
    expect(auth).toContain("shouldCreateUser: false");
    expect(auth).toContain("/auth/confirm");
    expect(auth).toContain("If an account can use this address");
  });
  it("keeps restoration explicit and failure-safe", () => {
    const ui = read("components/AccountRestoration.tsx");
    expect(ui).toContain('fetch("/api/account")');
    expect(ui).toContain('fetch("/api/account/restore", { method: "POST" })');
    expect(ui).toContain('data.restored !== true');
    expect(ui).toContain("No automatic retry was made");
    expect(ui).toContain("auth.signOut()");
    expect(ui).toContain("Sign out");
  });
  it("communicates the 90-day suspension and trial treatment", () => {
    const sections = read("components/dashboard/sections.tsx");
    expect(sections).toContain("/login?account=pending");
    expect(sections).toContain("90 days after the request");
    expect(sections).toContain("does not reset or extend the trial");
    expect(read("components/legal/DataDeletionContent.tsx")).toContain("marqueur protégé");
  });
});
