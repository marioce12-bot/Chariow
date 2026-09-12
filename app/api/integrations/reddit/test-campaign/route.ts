import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { testCreateDraftCampaign } from "@/lib/reddit/api";

// Route de diagnostic (temporaire) : ouvre cette URL dans le navigateur une fois
// connecté à Reddit Ads pour voir la vraie réponse de l'API à une tentative de
// création de campagne. Ne dépense rien (status PAUSED).
export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const { data: integration } = await supabase.from("reddit_integrations").select("access_token_encrypted").eq("user_id", user.id).eq("is_active", true).maybeSingle();
  if (!integration) return NextResponse.json({ error: "Aucune intégration Reddit Ads active. Connecte-toi d'abord via /api/integrations/reddit/connect" }, { status: 400 });

  const { data: account } = await supabase.from("reddit_ad_accounts").select("reddit_ad_account_id,admin_approval_status,name").eq("user_id", user.id).eq("is_active", true).limit(1).maybeSingle();
  if (!account) return NextResponse.json({ error: "Aucun compte publicitaire Reddit trouvé sur ce compte utilisateur" }, { status: 400 });

  const accessToken = decryptSecret(integration.access_token_encrypted);
  const result = await testCreateDraftCampaign(account.reddit_ad_account_id, accessToken);

  return NextResponse.json({
    ad_account: account.name,
    admin_approval_status_from_earlier_sync: account.admin_approval_status,
    test_result: {
      http_status: result.status,
      succeeded: result.ok,
      reddit_response: result.raw,
    },
    how_to_read_this: result.ok
      ? "Succès : la création de campagne a fonctionné sans approbation supplémentaire."
      : "Regarde reddit_response : une erreur de type 'not authorized'/'pending'/'forbidden' confirme le partner-level gating ; une erreur de validation sur les champs (objective, funding_instrument, etc.) veut dire qu'on est passé l'authentification et qu'il faut juste ajuster le payload.",
  });
}
