import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchCachedTrends } from "@/lib/market-radar";

const POPULAR_TOPICS = ["canva", "mobile money", "whatsapp business", "formation en ligne", "ebook", "marketing digital", "business en ligne"];
const COUNTRIES = ["BJ", "CI", "TG", "SN", "CM", "BF"];

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const supabase = createAdminClient();
  let warmed = 0;
  for (const country of COUNTRIES) {
    for (const topic of POPULAR_TOPICS) {
      const result = await fetchCachedTrends(supabase, topic, country);
      if (result.source === "live") warmed += 1;
    }
  }
  return NextResponse.json({ warmed, total: COUNTRIES.length * POPULAR_TOPICS.length });
}
