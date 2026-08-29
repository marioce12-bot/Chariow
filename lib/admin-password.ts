import crypto from "node:crypto";

export const ADMIN_COOKIE = "vendeo_admin_session";

function secret() {
  return process.env.ADMIN_PASSWORD_SECRET || process.env.TOKEN_ENCRYPTION_KEY || "";
}

export function createAdminSession(password: string) {
  const configured = process.env.ADMIN_PASSWORD;
  if (!configured || !secret() || password !== configured) return null;
  const expiresAt = Date.now() + 8 * 60 * 60 * 1000;
  const payload = `${expiresAt}`;
  const signature = crypto.createHmac("sha256", secret()).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

export function isAdminSessionValid(value: string | undefined | null) {
  if (!value || !secret()) return false;
  const [expiresAt, signature] = value.split(".");
  if (!expiresAt || !signature || Number(expiresAt) < Date.now()) return false;
  const expected = crypto.createHmac("sha256", secret()).update(expiresAt).digest("hex");
  return signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
