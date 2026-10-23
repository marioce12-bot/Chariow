import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

const KEY = "vendeo_onboarding_v1";
const phases = new Set(["pending", "welcome", "tour", "done"]);
type Phase = "pending" | "welcome" | "tour" | "done";
type MetadataState = { phase?: Phase };

export async function GET() {
  const { supabase, user, response } = await requireUser({ allowUnsubscribed: true });
  if (!user) return response;
  const { data: stores, error } = await supabase.from("stores")
    .select("id,connection_status,connected_at").eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const metadata = user.user_metadata ?? {};
  const state = metadata[KEY] as MetadataState | undefined;
  if (state?.phase && phases.has(state.phase)) return NextResponse.json({ phase: state.phase });
  // Existing store history disqualifies legacy accounts and reconnects, regardless of active status.
  const eligible = (stores ?? []).length === 0;
  if (!eligible) return NextResponse.json({ phase: "done", eligible: false });
  return NextResponse.json({ phase: undefined, eligible: true });
}

export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser({ allowUnsubscribed: true });
  if (!user) return response;
  const body = await request.json().catch(() => null) as { phase?: unknown } | null;
  if (!body || typeof body !== "object" || Array.isArray(body) || typeof body.phase !== "string" || !phases.has(body.phase)) {
    return NextResponse.json({ error: "Phase d’onboarding invalide" }, { status: 400 });
  }
  const metadata = user.user_metadata ?? {};
  const current = (metadata[KEY] as MetadataState | undefined)?.phase;
  const phase = body.phase as Phase;
  const { data: stores, error: storesError } = await supabase.from("stores")
    .select("id").eq("user_id", user.id);
  if (storesError) return NextResponse.json({ error: storesError.message }, { status: 500 });

  // Pending is only an initial marker for a truly new account. Preserve legacy
  // users' successful login even when they already have stores/history.
  if (phase === "pending" && ((stores ?? []).length > 0 || (current && current !== "pending"))) {
    return NextResponse.json({ phase: current && current !== "pending" ? current : "done", eligible: false });
  }
  const validTransition = phase === "pending"
    ? current === undefined || current === "pending"
    : phase === "welcome" ? current === "pending" || current === "welcome"
      : phase === "tour" ? current === "welcome" || current === "tour"
        : phase === "done" && (current === "tour" || current === "welcome" || current === "done");
  if (!validTransition) return NextResponse.json({ phase: current ?? "done", eligible: false });
  if (phase === "welcome") {
    const { data: connectedStores, error: connectedError } = await supabase.from("stores")
      .select("id").eq("user_id", user.id).eq("connection_status", "connected");
    if (connectedError) return NextResponse.json({ error: connectedError.message }, { status: 500 });
    if (!(connectedStores ?? []).length) return NextResponse.json({ phase: current ?? "done", eligible: false });
  }
  const { error } = await supabase.auth.updateUser({ data: {
    ...metadata,
    [KEY]: { ...(metadata[KEY] && typeof metadata[KEY] === "object" ? metadata[KEY] : {}), phase },
  } });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ phase });
}
