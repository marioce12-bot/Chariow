import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export async function GET() {
  const { supabase, user, response } = await requireUser({ allowUnsubscribed: true });
  if (!user) return response;
  const { data, error } = await supabase.from("profiles").select("preferred_locale").eq("id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ locale: data?.preferred_locale === "en" ? "en" : "fr" });
}

export async function PATCH(request: Request) {
  const { supabase, user, response } = await requireUser({ allowUnsubscribed: true });
  if (!user) return response;
  const body = await request.json().catch(() => null) as { locale?: unknown } | null;
  if (body?.locale !== "fr" && body?.locale !== "en") return NextResponse.json({ error: "Langue invalide" }, { status: 400 });
  const { error } = await supabase.from("profiles").update({ preferred_locale: body.locale }).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ locale: body.locale });
}
