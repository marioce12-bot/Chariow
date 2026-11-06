import { NextResponse } from "next/server";
import { requireAdmin, writeAdminAudit } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

type Context = { params: Promise<{ id: string }> };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function failure(status: number, code: string, error: string) {
  return NextResponse.json({ error, code }, { status });
}

export async function DELETE(request: Request, context: Context) {
  const { supabase, admin, user, response } = await requireAdmin(["super_admin"]);
  if (!admin || !supabase)
    return response ?? failure(403, "admin_required", "Accès super administrateur requis.");

  const { id } = await context.params;
  if (!UUID_PATTERN.test(id))
    return failure(400, "invalid_user_id", "Identifiant utilisateur invalide.");
  if (user?.id === id)
    return failure(403, "self_delete_forbidden", "Un administrateur ne peut pas supprimer son propre compte.");

  const body = await request.json().catch(() => null);
  const confirmation =
    typeof body?.confirmation === "string" ? body.confirmation.trim() : "";
  if (!confirmation)
    return failure(400, "confirmation_required", "Saisissez l’adresse e-mail ou l’identifiant du compte à supprimer.");

  const service = createAdminClient();
  const { data: target, error: targetError } = await service
    .from("profiles")
    .select("id,email")
    .eq("id", id)
    .maybeSingle();
  if (targetError) {
    console.error("Admin user lookup failed", { code: targetError.code ?? "unknown" });
    return failure(500, "user_lookup_failed", "Impossible de vérifier ce compte.");
  }
  if (!target)
    return failure(404, "user_not_found", "Ce compte utilisateur n’existe plus.");

  const targetEmail = typeof target.email === "string" ? target.email.trim() : "";
  const expectedConfirmation = targetEmail || id;
  if (expectedConfirmation.toLowerCase() !== confirmation.toLowerCase())
    return failure(400, "confirmation_mismatch", "La valeur saisie ne correspond pas au compte.");

  const { data: protectedAdmin, error: adminLookupError } = await service
    .from("admin_users")
    .select("user_id")
    .eq("user_id", id)
    .maybeSingle();
  if (adminLookupError) {
    console.error("Admin account protection check failed", {
      code: adminLookupError.code ?? "unknown",
    });
    return failure(500, "admin_check_failed", "Impossible de vérifier les droits de ce compte.");
  }
  if (protectedAdmin)
    return failure(409, "admin_account_protected", "Les comptes administrateurs ne peuvent pas être supprimés depuis cette liste.");

  const { error: deleteError } = await service.auth.admin.deleteUser(id);
  if (deleteError) {
    console.error("Admin user deletion failed", {
      code: deleteError.code ?? "unknown",
      userId: id,
    });
    if (deleteError.code === "23503")
      return failure(409, "dependency_conflict", "Des données liées empêchent la suppression de ce compte.");
    return failure(500, "deletion_failed", "La suppression du compte a échoué.");
  }

  if (admin.id !== "password-admin") {
    await writeAdminAudit(supabase, admin.id, "user_account_deleted", "profile", id);
  } else {
    console.info("Admin account deletion completed from password session", {
      userId: id,
    });
  }

  return NextResponse.json({ deleted: true, user_id: id });
}
