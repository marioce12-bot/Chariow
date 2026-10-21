import { createHmac, timingSafeEqual } from "node:crypto";

export type CampaignAction = "edit" | "delete" | "pause" | "activate" | "duplicate";
export type Changes = { title?: string; daily_budget?: number };
export const CONFIRM_ACTIONS = new Set<CampaignAction>(["delete", "pause", "activate"]);
const TTL_MS = 5 * 60_000;
function secret() {
  const value = process.env.TOKEN_ENCRYPTION_KEY;
  if (!value) throw new Error("Action confirmation is not configured");
  return value;
}
export function normalizeChanges(action: CampaignAction, value: unknown): Changes {
  if (value == null) {
    if (action === "edit") throw new Error("Aucune modification demandée");
    return {};
  }
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Paramètres invalides");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["title", "daily_budget"].includes(key))) throw new Error("Paramètre non pris en charge");
  const result: Changes = {};
  if (input.title !== undefined) {
    if (typeof input.title !== "string" || !input.title.trim() || input.title.trim().length > 200) throw new Error("Titre invalide");
    result.title = input.title.trim();
  }
  if (input.daily_budget !== undefined) {
    if (typeof input.daily_budget !== "number" || !Number.isFinite(input.daily_budget) || input.daily_budget < 1) throw new Error("Budget invalide");
    result.daily_budget = input.daily_budget;
  }
  if (action !== "edit" && Object.keys(result).length) throw new Error("Paramètres inattendus pour cette action");
  if (action === "edit" && !Object.keys(result).length) throw new Error("Aucune modification demandée");
  return result;
}
export function issueConfirmation(input: { userId: string; campaignId: string; action: CampaignAction; changes: Changes; status: string; updatedAt: string }) {
  const payload = Buffer.from(JSON.stringify({ ...input, exp: Date.now() + TTL_MS })).toString("base64url");
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}
export function verifyConfirmation(token: unknown, expected: { userId: string; campaignId: string; action: CampaignAction; changes: Changes; status: string; updatedAt: string }) {
  if (typeof token !== "string" || token.length > 4096) return false;
  if (token.split(".").length !== 2) return false;
  const [payload, supplied] = token.split(".");
  if (!payload || !supplied) return false;
  const actual = createHmac("sha256", secret()).update(payload).digest();
  let given: Buffer;
  try { given = Buffer.from(supplied, "base64url"); } catch { return false; }
  if (actual.length !== given.length || !timingSafeEqual(actual, given)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.exp > Date.now() && data.exp <= Date.now() + TTL_MS + 1000 && data.userId === expected.userId && data.campaignId === expected.campaignId && data.action === expected.action && data.status === expected.status && data.updatedAt === expected.updatedAt && JSON.stringify(data.changes) === JSON.stringify(expected.changes);
  } catch { return false; }
}
export function isConfirmationRequired(action: CampaignAction, changes: Changes) {
  return CONFIRM_ACTIONS.has(action) || changes.daily_budget !== undefined;
}
export function platformStatusFromMeta(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  return typeof row.effective_status === "string" ? row.effective_status : typeof row.status === "string" ? row.status : null;
}
