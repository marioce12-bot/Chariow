import { createHash, createPublicKey, verify } from "node:crypto";

type FalJwk = { kty?: string; crv?: string; x?: string };
let jwksCache: { keys: FalJwk[]; expiresAt: number } | null = null;
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_JWKS_AGE_MS = 24 * 60 * 60 * 1000;

export class FalWebhookVerificationUnavailableError extends Error {
  constructor() { super("fal.ai webhook signing keys are unavailable"); }
}

export async function readFalWebhookBody(request: Request): Promise<Buffer | null> {
  const announcedLength = Number(request.headers.get("content-length") ?? 0);
  if (announcedLength > MAX_BODY_BYTES) return null;
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), length);
}

async function signingKeys() {
  if (jwksCache && jwksCache.expiresAt > Date.now()) return jwksCache.keys;
  let response: Response;
  try {
    response = await fetch("https://rest.fal.ai/.well-known/jwks.json", {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new FalWebhookVerificationUnavailableError();
  }
  if (!response.ok) throw new FalWebhookVerificationUnavailableError();
  const body = await response.json().catch(() => null) as { keys?: FalJwk[] } | null;
  const keys = Array.isArray(body?.keys)
    ? body.keys.filter((key) => key.kty === "OKP" && key.crv === "Ed25519" && typeof key.x === "string")
    : [];
  if (!keys.length) throw new FalWebhookVerificationUnavailableError();
  const cacheControl = response.headers.get("cache-control") ?? "";
  const maxAge = Number(cacheControl.match(/(?:^|,)\s*max-age=(\d+)/i)?.[1] ?? 3600);
  const ttl = Math.max(60_000, Math.min(MAX_JWKS_AGE_MS, maxAge * 1000));
  jwksCache = { keys, expiresAt: Date.now() + ttl };
  return keys;
}

export async function verifyFalWebhook(headers: Headers, rawBody: Buffer) {
  const requestId = headers.get("x-fal-webhook-request-id");
  const userId = headers.get("x-fal-webhook-user-id");
  const timestamp = headers.get("x-fal-webhook-timestamp");
  const signatureHex = headers.get("x-fal-webhook-signature");
  if (!requestId || !userId || !timestamp || !signatureHex ||
      requestId.length > 256 || userId.length > 256 || !/^\d{10}$/.test(timestamp) ||
      !/^[0-9a-f]{128}$/i.test(signatureHex)) return false;
  const issuedAt = Number(timestamp);
  if (!Number.isSafeInteger(issuedAt) || Math.abs(Math.floor(Date.now() / 1000) - issuedAt) > 300) return false;

  const bodyHash = createHash("sha256").update(rawBody).digest("hex");
  const message = Buffer.from(`${requestId}\n${userId}\n${timestamp}\n${bodyHash}`, "utf8");
  const signature = Buffer.from(signatureHex, "hex");
  const keys = await signingKeys();
  for (const jwk of keys) {
    try {
      const key = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: jwk.x! }, format: "jwk" });
      if (verify(null, message, key, signature)) return true;
    } catch {
      // Ignore an invalid/unsupported published key and try the next rotation key.
    }
  }
  return false;
}

export function resetFalWebhookKeyCacheForTests() {
  jwksCache = null;
}
