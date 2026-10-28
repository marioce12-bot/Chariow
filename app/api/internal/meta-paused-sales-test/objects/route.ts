import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { META_GRAPH_BASE_URL } from "@/lib/meta/api";
import { fetchMetaGraph } from "@/lib/meta/graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAMPAIGN_ID = "120254598064950655";
const AD_SET_ID = "120254598065610655";
const OBJECT_FIELDS = "id,status,effective_status,objective,targeting,optimization_goal,destination_type,promoted_object";
const RESPONSE_FIELDS = [
  "id",
  "status",
  "effective_status",
  "objective",
  "targeting",
  "optimization_goal",
  "destination_type",
  "promoted_object",
] as const;

type MetaObject = Record<string, unknown>;

function errorResponse(status: number) {
  return NextResponse.json({ error: "Lecture Meta indisponible" }, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

async function readMetaObject(id: string, accessToken: string): Promise<MetaObject> {
  const url = new URL(`${META_GRAPH_BASE_URL}/${encodeURIComponent(id)}`);
  url.searchParams.set("fields", OBJECT_FIELDS);
  url.searchParams.set("access_token", accessToken);

  // One bounded GET per fixed object ID. No write methods and no retry path.
  const response = await fetchMetaGraph(url, { method: "GET", cache: "no-store" });
  const json = await response.json().catch(() => null) as MetaObject | null;
  if (!response.ok || !json || typeof json !== "object" || Array.isArray(json)) {
    throw new Error("Meta object read failed");
  }
  return json;
}

function onlyRequestedFields(object: MetaObject, expectedId: string) {
  if (String(object.id ?? "") !== expectedId) throw new Error("Unexpected Meta object ID");
  return Object.fromEntries(RESPONSE_FIELDS.map((field) => [field, object[field] ?? null]));
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
    const { data: account, error } = await supabase.from("meta_ad_accounts")
      .select("access_token_encrypted")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (error || typeof account?.access_token_encrypted !== "string") return errorResponse(503);

    const accessToken = decryptSecret(account.access_token_encrypted);
    const [campaign, adSet] = await Promise.all([
      readMetaObject(CAMPAIGN_ID, accessToken),
      readMetaObject(AD_SET_ID, accessToken),
    ]);

    return NextResponse.json({
      campaign: onlyRequestedFields(campaign, CAMPAIGN_ID),
      ad_set: onlyRequestedFields(adSet, AD_SET_ID),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    // Do not return or log tokens, Graph error payloads, or unrelated fields.
    return errorResponse(502);
  }
}
