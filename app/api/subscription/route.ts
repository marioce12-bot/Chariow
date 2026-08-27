import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { data, error } = await supabase.rpc("reset_subscription_period_if_needed", { target_user_id: user.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ subscription: data });
}

export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => null);
  if (!body?.plan || !["starter", "pro"].includes(body.plan)) return NextResponse.json({ error: "Plan invalide" }, { status: 400 });
  const limit = body.plan === "pro" ? 1200 : 400;
  const { data, error } = await supabase.from("subscriptions").update({ plan: body.plan, messages_limit: limit, status: "active" }).eq("user_id", user.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ subscription: data });
}
