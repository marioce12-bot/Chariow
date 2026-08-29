export const ADMIN_COOKIE = "vendeo_admin_session";

export async function isAdminSessionValidEdge(value: string | undefined | null) {
  const sessionSecret = process.env.ADMIN_PASSWORD_SECRET || process.env.TOKEN_ENCRYPTION_KEY;
  if (!value || !sessionSecret) return false;
  const [expiresAt, signature] = value.split(".");
  if (!expiresAt || !signature || Number(expiresAt) < Date.now()) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(sessionSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(expiresAt));
  const expected = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return signature === expected;
}
