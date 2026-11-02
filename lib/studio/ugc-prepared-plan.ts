import { createHmac, timingSafeEqual } from "node:crypto";
import type { UgcCreativeDirection, UgcGeneratorInput, UgcProductAnalysis } from "./ugc-prompt-generator";

type Prepared = { version: 1; userId: string; expires: number; input: UgcGeneratorInput; analysis: UgcProductAnalysis; creative: UgcCreativeDirection; prompt: string };
const key = () => process.env.STUDIO_UGC_SIGNING_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
const signature = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");
export function signPreparedUgc(userId: string, input: UgcGeneratorInput, result: {analysis: UgcProductAnalysis; creative: UgcCreativeDirection}, prompt: string) {
  const secret = key();
  if (!secret) return null;
  const payload = Buffer.from(JSON.stringify({ version: 1, userId, expires: Date.now() + 30 * 60_000, input, ...result, prompt } satisfies Prepared)).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}
export function readPreparedUgc(token: unknown, userId: string, input: UgcGeneratorInput, prompt: string): Prepared | null {
  const secret = key();
  if (!secret || typeof token !== "string" || token.length > 100_000) return null;
  const [payload, provided, extra] = token.split(".");
  if (!payload || !provided || extra) return null;
  const expected = Buffer.from(signature(payload, secret));
  const actual = Buffer.from(provided);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString()) as Prepared;
    if (value.version !== 1 || value.userId !== userId || value.expires < Date.now() || value.prompt !== prompt) return null;
    if (JSON.stringify(value.input.product) !== JSON.stringify(input.product) || JSON.stringify(value.input.options) !== JSON.stringify(input.options)) return null;
    return value;
  } catch { return null; }
}
