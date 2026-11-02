import crypto from "node:crypto";

export function verifyChariowSignature(rawBody: string, signature: string | null, secret: string | undefined) {
  if (!secret || !signature) return false;
  const actual = signature.replace(/^sha256=/, "");
  if (!/^[a-f0-9]{64}$/i.test(actual)) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), expected);
}

export function calculateVendeoAttributedRoas(netRevenue: number, metaSpend: number) {
  return metaSpend > 0 ? netRevenue / metaSpend : null;
}
