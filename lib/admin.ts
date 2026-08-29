import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type AdminRole = "super_admin" | "support" | "analyst";

export async function requireAdmin(roles?: AdminRole[]) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { supabase, user: null, admin: null, response: NextResponse.json({ error: "Authentification requise" }, { status: 401 }) };
  const { data: admin, error } = await supabase.from("admin_users").select("id,user_id,role,is_active").eq("user_id", user.id).eq("is_active", true).maybeSingle();
  if (error || !admin || (roles && !roles.includes(admin.role as AdminRole))) return { supabase, user: null, admin: null, response: NextResponse.json({ error: "Accès administrateur requis" }, { status: 403 }) };
  return { supabase, user, admin, response: null };
}

export async function writeAdminAudit(supabase: any, adminUserId: string, action: string, resourceType: string, resourceId?: string | null, metadata: Record<string, unknown> = {}) {
  const { error } = await supabase.from("admin_audit_logs").insert({ admin_user_id: adminUserId, action, resource_type: resourceType, resource_id: resourceId ?? null, metadata });
  if (error) console.error("Admin audit log failed", { code: error.code, message: error.message });
}
