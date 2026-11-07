import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const { user, response } = await requireUser({ allowUnsubscribed: true });
  if (!user) return response;

  let rewardId = "";
  try {
    const body = await request.json();
    rewardId = typeof body?.rewardId === "string" ? body.rewardId : "";
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (!UUID_PATTERN.test(rewardId)) {
    return NextResponse.json({ error: "Récompense invalide." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("activate_referral_subscription_reward", {
    target_user_id: user.id,
    target_reward_id: rewardId,
  });
  if (error) {
    console.error("referral reward activation failed", error.message, error.code);
    return NextResponse.json({ error: "Impossible d’activer l’abonnement offert." }, { status: 500 });
  }

  const result = data as {
    ok?: boolean;
    duplicate?: boolean;
    code?: string;
    reward_id?: string;
    milestone_count?: number;
    starts_on?: string;
    ends_on?: string;
  } | null;
  if (!result?.ok) {
    if (result?.code === "reward_not_found") {
      return NextResponse.json({ error: "Aucun abonnement offert disponible pour cette demande." }, { status: 404 });
    }
    if (result?.code === "subscription_not_found") {
      return NextResponse.json({ error: "L’abonnement Vendeo est introuvable." }, { status: 409 });
    }
    return NextResponse.json({ error: "L’activation n’a pas abouti." }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    duplicate: result.duplicate === true,
    reward: {
      id: result.reward_id,
      milestoneCount: result.milestone_count,
      startsOn: result.starts_on,
      endsOn: result.ends_on,
    },
  });
}
