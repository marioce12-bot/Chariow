import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireActiveSubscription } from "@/lib/subscription/access";

interface RequireUserOptions {
  allowPendingAccount?: boolean;
  /**
   * À n'utiliser que pour les routes qui doivent rester accessibles sans
   * abonnement actif : lecture de l'abonnement, paiement, suppression du compte.
   * Par défaut, un compte sans essai valide ni abonnement payant reçoit un 402.
   */
  allowUnsubscribed?: boolean;
}

export async function requireUser(options: RequireUserOptions = {}) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { supabase, user: null, response: NextResponse.json({ error: "Authentification requise" }, { status: 401 }) };

  if (!options.allowPendingAccount) {
    const { data: retention, error: retentionError } = await supabase.rpc("account_retention_status");
    if (retentionError) return { supabase, user: null, response: NextResponse.json({ error: "Statut du compte indisponible" }, { status: 503 }) };
    if (retention?.state !== "active") return { supabase, user: null, response: NextResponse.json({ error: "Compte en attente de suppression", code: "ACCOUNT_PENDING_DELETION", restore_url: "/account/restore" }, { status: 403 }) };
  }
  if (!options.allowUnsubscribed) {
    const blocked = await requireActiveSubscription(user.id);
    if (blocked) return { supabase, user: null, response: blocked };
  }

  return { supabase, user, response: null };
}
