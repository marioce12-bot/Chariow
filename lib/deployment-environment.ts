export type DeploymentEnvironment = "development" | "preview" | "production";

/**
 * Resolve Vendeo's deployment tier independently of its hosting provider.
 * VENDEO_DEPLOYMENT_ENV is set explicitly on non-Vercel hosts; VERCEL_ENV is
 * retained as a backwards-compatible fallback. Unknown values fail closed.
 */
export function getDeploymentEnvironment(
  env: Readonly<Record<string, string | undefined>> = process.env,
): DeploymentEnvironment {
  const value = env.VENDEO_DEPLOYMENT_ENV ?? env.VERCEL_ENV;
  if (value === "preview" || value === "production") return value;
  return "development";
}
