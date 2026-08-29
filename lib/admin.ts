import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, isAdminSessionValid } from "@/lib/admin-password";
import { createAdminClient } from "@/lib/supabase/admin";

export type AdminRole = "super_admin" | "support" | "analyst";

export async function requireAdmin(roles?: AdminRole[]) {
  const cookieStore = await cookies();
  if (isAdminSessionValid(cookieStore.get(ADMIN_COOKIE)?.value)) return { supabase: createAdminClient(), user: null, admin: { id: "password-admin", role: "super_admin" as AdminRole }, response: null };
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { supabase, user: null, admin: null, response: NextResponse.json({ error: "Authentification requise" }, { status: 401 }) };
  const { data: admin, error } = await supabase.rpc("get_current_admin", { target_user_id: user.id });
  const currentAdmin = Array.isArray(admin) ? admin[0] : admin;
  if (error || !currentAdmin || (roles && !roles.includes(currentAdmin.role as AdminRole))) return { supabase, user: null, admin: null, response: NextResponse.json({ error: "Accès administrateur requis" }, { status: 403 }) };
  return { supabase, user, admin: currentAdmin, response: null };
}

export async function writeAdminAudit(supabase: any, adminUserId: string, action: string, resourceType: string, resourceId?: string | null, metadata: Record<string, unknown> = {}) {
  const { error } = await supabase.from("admin_audit_logs").insert({ admin_user_id: adminUserId, action, resource_type: resourceType, resource_id: resourceId ?? null, metadata });
  if (error) console.error("Admin audit log failed", { code: error.code, message: error.message });
}
