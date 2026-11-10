import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

const PAGE_SIZE = 500;
const MAX_ROWS = 50_000;

export async function GET() {
  const { admin, response } = await requireAdmin(["super_admin", "support"]);
  if (!admin) return response ?? NextResponse.json({ error: "Accès administrateur requis" }, { status: 403 });

  const service = createAdminClient();
  const campaignRows: Array<{ user_id: string }> = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await service
      .from("ad_campaigns")
      .select("user_id", { count: "exact" })
      .eq("status", "active")
      .not("user_id", "is", null)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      console.error("Admin active campaign account read unavailable", { code: error.code ?? "unknown" });
      return NextResponse.json({ error: "Comptes avec campagnes actives indisponibles." }, { status: 500 });
    }
    campaignRows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
    if (offset + PAGE_SIZE >= MAX_ROWS) {
      return NextResponse.json({ error: "Trop de campagnes actives pour une lecture complète." }, { status: 503 });
    }
  }

  const counts = new Map<string, number>();
  for (const row of campaignRows) {
    if (typeof row.user_id === "string" && row.user_id) counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1);
  }
  const userIds = [...counts.keys()];
  const profiles: Array<{ id: string; email: string | null; full_name: string | null }> = [];
  for (let offset = 0; offset < userIds.length; offset += PAGE_SIZE) {
    const { data, error } = await service
      .from("profiles")
      .select("id,email,full_name")
      .in("id", userIds.slice(offset, offset + PAGE_SIZE));
    if (error) {
      console.error("Admin active campaign profile lookup unavailable", { code: error.code ?? "unknown" });
      return NextResponse.json({ error: "Comptes avec campagnes actives indisponibles." }, { status: 500 });
    }
    profiles.push(...(data ?? []));
  }
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const accounts = [...counts.entries()]
    .map(([userId, activeCampaignsCount]) => {
      const profile = profileById.get(userId);
      return profile ? {
        id: userId,
        email: profile.email,
        full_name: profile.full_name,
        active_campaigns_count: activeCampaignsCount,
      } : null;
    })
    .filter((account): account is NonNullable<typeof account> => account !== null)
    .sort((a, b) => b.active_campaigns_count - a.active_campaigns_count || (a.full_name ?? a.email ?? a.id).localeCompare(b.full_name ?? b.email ?? b.id));

  return NextResponse.json({ accounts, total: accounts.length });
}
