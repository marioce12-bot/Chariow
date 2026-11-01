import { describe, expect, it } from "vitest";
import { getDeploymentEnvironment } from "./deployment-environment";

describe("deployment environment", () => {
  it("keeps the Vercel environment as a backwards-compatible fallback", () => {
    expect(getDeploymentEnvironment({ VERCEL_ENV: "preview" })).toBe("preview");
    expect(getDeploymentEnvironment({ VERCEL_ENV: "production" })).toBe("production");
  });

  it("prefers the explicit provider-neutral Vendeo value", () => {
    expect(getDeploymentEnvironment({ VENDEO_DEPLOYMENT_ENV: "preview" })).toBe("preview");
    expect(getDeploymentEnvironment({ VENDEO_DEPLOYMENT_ENV: "production", VERCEL_ENV: "preview" })).toBe("production");
    expect(getDeploymentEnvironment({ VENDEO_DEPLOYMENT_ENV: "development", VERCEL_ENV: "production" })).toBe("development");
  });

  it("fails closed when no recognized deployment tier is provided", () => {
    expect(getDeploymentEnvironment({})).toBe("development");
    expect(getDeploymentEnvironment({ VENDEO_DEPLOYMENT_ENV: "staging", VERCEL_ENV: "unknown" })).toBe("development");
  });
});
