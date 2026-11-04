import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { storeConnectionReminderCopy } from "@/lib/onboarding/store-connection-reminder";

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const BATCH_SIZE = 200;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const now = Date.now();
  const cutoff = new Date(now - TWO_HOURS_MS).toISOString();
  const { data: config, error: configError } = await admin
    .from("store_connection_reminder_config")
    .select("eligible_after")
    .eq("id", true)
    .maybeSingle();
  if (configError) return NextResponse.json({ error: "Reminder configuration unavailable" }, { status: 500 });

  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("id,email,full_name,preferred_locale,created_at")
    .gte("created_at", config?.eligible_after ?? new Date(now).toISOString())
    .lte("created_at", cutoff)
    .not("email", "is", null)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);
  if (profilesError) return NextResponse.json({ error: "Unable to load reminder recipients" }, { status: 500 });

  const ids = (profiles ?? []).map((profile) => profile.id);
  if (ids.length === 0) return NextResponse.json({ scanned: 0, sent: 0, skipped: 0, failed: 0 });

  const { data: connectedStores, error: storesError } = await admin
    .from("stores")
    .select("user_id")
    .in("user_id", ids)
    .eq("platform", "chariow")
    .eq("is_active", true)
    .eq("connection_status", "connected");
  if (storesError) return NextResponse.json({ error: "Unable to check store connections" }, { status: 500 });
  const connectedUserIds = new Set((connectedStores ?? []).map((store) => store.user_id));

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const profile of profiles ?? []) {
    if (connectedUserIds.has(profile.id) || !profile.email) {
      skipped += 1;
      continue;
    }

    const { data: claim, error: claimError } = await admin
      .from("store_connection_reminder_sends")
      .insert({ user_id: profile.id })
      .select("user_id")
      .maybeSingle();
    if (claimError || !claim) {
      skipped += 1;
      continue;
    }

    const locale = profile.preferred_locale === "en" ? "en" : "fr";
    const dashboardUrl = `${process.env.NEXT_PUBLIC_SITE_URL || "https://www.vendeo-studio.site"}/dashboard`;
    const copy = storeConnectionReminderCopy(locale, profile.full_name || "", dashboardUrl);
    const delivered = await sendEmail({ to: profile.email, ...copy });
    if (!delivered) {
      await admin.from("store_connection_reminder_sends").delete().eq("user_id", profile.id);
      failed += 1;
      continue;
    }

    const { error: markError } = await admin
      .from("store_connection_reminder_sends")
      .update({ sent_at: new Date().toISOString() })
      .eq("user_id", profile.id);
    if (markError) failed += 1;
    else sent += 1;
  }

  return NextResponse.json({ scanned: profiles?.length ?? 0, sent, skipped, failed });
}
