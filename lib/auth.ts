import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireActiveSubscription } from "@/lib/subscription/access";

interface RequireUserOptions {
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

  if (!options.allowUnsubscribed) {
    const blocked = await requireActiveSubscription(user.id);
    if (blocked) return { supabase, user: null, response: blocked };
  }

  return { supabase, user, response: null };
}
