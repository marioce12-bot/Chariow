import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { endpointHash, encryptSubscription, getVapidKeys, validatePushEndpoint, validateSubscription } from "@/lib/push/server";

function originAllowed(request: NextRequest) {
  const origin = request.headers.get("origin");
  return !origin || origin === request.nextUrl.origin;
}

export async function GET() {
  const { user, response } = await requireUser({ allowUnsubscribed: true });
  if (!user) return response;
  try { return NextResponse.json(await getVapidKeys()); }
  catch { return NextResponse.json({ error: "Push configuration unavailable" }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  if (!originAllowed(request)) return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
  const { user, response } = await requireUser({ allowUnsubscribed: true });
  if (!user) return response;
  let parsed;
  try { parsed = validateSubscription(await request.json()); }
  catch { return NextResponse.json({ error: "Invalid push subscription" }, { status: 400 }); }
  const admin = createAdminClient();
  const hash = endpointHash(parsed.endpoint);
  const { data: prior, error: lookupError } = await admin.from("web_push_subscriptions").select("id,user_id").eq("endpoint_hash", hash).maybeSingle();
  if (lookupError) return NextResponse.json({ error: "Could not save subscription" }, { status: 500 });
  if (prior && prior.user_id !== user.id) return NextResponse.json({ error: "Endpoint already belongs to another user" }, { status: 409 });
  const values = { user_id: user.id, endpoint_hash: hash, endpoint: parsed.endpoint, subscription_encrypted: encryptSubscription(parsed.keys), last_seen_at: new Date().toISOString() };
  const result = prior
    ? await admin.from("web_push_subscriptions").update(values).eq("id", prior.id).eq("user_id", user.id)
    : await admin.from("web_push_subscriptions").insert(values);
  if (result.error) return NextResponse.json({ error: "Could not save subscription" }, { status: 500 });
  return NextResponse.json({ saved: true }, { status: prior ? 200 : 201 });
}

export async function DELETE(request: NextRequest) {
  if (!originAllowed(request)) return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
  const { user, response } = await requireUser({ allowUnsubscribed: true });
  if (!user) return response;
  let endpoint: string;
  try { endpoint = validatePushEndpoint((await request.json())?.endpoint); }
  catch { return NextResponse.json({ error: "Invalid push subscription" }, { status: 400 }); }
  const admin = createAdminClient();
  const { error } = await admin.from("web_push_subscriptions").delete().eq("endpoint_hash", endpointHash(endpoint)).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "Could not remove subscription" }, { status: 500 });
  return NextResponse.json({ removed: true });
}
