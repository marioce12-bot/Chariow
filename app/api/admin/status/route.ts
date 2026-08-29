import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { data, error } = await supabase.rpc("get_current_admin", { target_user_id: user.id });
  if (error) return NextResponse.json({ authenticated: true, admin: false, reason: "admin_schema_missing_or_unavailable" }, { status: 200 });
  const admin = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ authenticated: true, admin: Boolean(admin?.is_active), role: admin?.role ?? null });
}
