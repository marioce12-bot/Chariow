import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { META_GRAPH_BASE_URL } from "@/lib/meta/api";
import { fetchMetaGraph } from "@/lib/meta/graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACCOUNT_NAME = "Marioce Atin";
const CAMPAIGN_ID = "120254598064950655";
const AD_SET_ID = "120254598065610655";
const CAMPAIGN_FIELDS = ["id", "status", "effective_status", "objective"] as const;
const AD_SET_FIELDS = [
  "id",
  "status",
  "effective_status",
  "targeting",
  "optimization_goal",
  "destination_type",
  "promoted_object",
] as const;

type MetaObject = Record<string, unknown>;
type AccountMetadata = {
  id?: unknown;
  name?: unknown;
  meta_account_id?: unknown;
  is_active?: unknown;
};

function errorResponse(status: number) {
  return NextResponse.json({ error: "Lecture Meta indisponible" }, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

async function readMetaObject(id: string, fields: readonly string[], accessToken: string): Promise<MetaObject> {
  const url = new URL(`${META_GRAPH_BASE_URL}/${encodeURIComponent(id)}`);
  url.searchParams.set("fields", fields.join(","));
  url.searchParams.set("access_token", accessToken);

  // One bounded GET per fixed object ID. No write methods and no retry path.
  const response = await fetchMetaGraph(url, { method: "GET", cache: "no-store" });
  const json = await response.json().catch(() => null) as MetaObject | null;
  if (!response.ok || !json || typeof json !== "object" || Array.isArray(json)) {
    throw new Error("Meta object read failed");
  }
  return json;
}

function onlyRequestedFields(object: MetaObject, expectedId: string, fields: readonly string[]) {
  if (String(object.id ?? "") !== expectedId) throw new Error("Unexpected Meta object ID");
  return Object.fromEntries(fields.map((field) => [field, object[field] ?? null]));
}

export async function GET(_request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response ?? errorResponse(401);

  const allowedUserId = process.env.META_PAUSED_SALES_TEST_USER_ID;
  if (process.env.VERCEL_ENV !== "preview" || process.env.META_PAUSED_SALES_TEST_ENABLED !== "true" || !allowedUserId) {
    return errorResponse(404);
  }
  if (user.id !== allowedUserId) return errorResponse(403);

  try {
    // Inspect only the four permitted metadata columns before deciding whether
    // exactly one account belongs to this test. Never read tokens during matching.
    const { data: accounts, error: metadataError } = await supabase.from("meta_ad_accounts")
      .select("id,name,meta_account_id,is_active")
      .eq("user_id", user.id)
      .eq("name", ACCOUNT_NAME)
      .limit(2);
    if (metadataError || !Array.isArray(accounts)) return errorResponse(503);

    const matches = (accounts as AccountMetadata[]).filter((account) => account?.name === ACCOUNT_NAME);
    if (matches.length !== 1) return errorResponse(503);

    const account = matches[0];
    if (account.is_active !== true || typeof account.id !== "string" || !account.id ||
        typeof account.meta_account_id !== "string" || !account.meta_account_id.trim()) {
      return errorResponse(503);
    }

    // A second, row-scoped query reads the encrypted token only after a unique
    // metadata match; neither the token nor the selected account is returned.
    const { data: credentials, error: credentialError } = await supabase.from("meta_ad_accounts")
      .select("access_token_encrypted")
      .eq("id", account.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (credentialError || typeof credentials?.access_token_encrypted !== "string") return errorResponse(503);

    const accessToken = decryptSecret(credentials.access_token_encrypted);
    const [campaign, adSet] = await Promise.all([
      readMetaObject(CAMPAIGN_ID, CAMPAIGN_FIELDS, accessToken),
      readMetaObject(AD_SET_ID, AD_SET_FIELDS, accessToken),
    ]);

    return NextResponse.json({
      campaign: onlyRequestedFields(campaign, CAMPAIGN_ID, CAMPAIGN_FIELDS),
      ad_set: onlyRequestedFields(adSet, AD_SET_ID, AD_SET_FIELDS),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    // Do not return or log tokens, Graph error payloads, or unrelated fields.
    return errorResponse(502);
  }
}
