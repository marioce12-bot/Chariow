import crypto from "node:crypto";

export function verifyChariowSignature(rawBody: string, signature: string | null, secret: string | undefined) {
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const actual = signature.replace(/^sha256=/, "");
  return actual.length === expected.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export function calculateVendeoAttributedRoas(netRevenue: number, metaSpend: number) {
  return metaSpend > 0 ? netRevenue / metaSpend : null;
}
