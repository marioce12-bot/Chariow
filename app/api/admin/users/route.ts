import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { admin, response } = await requireAdmin(["super_admin", "support"]);
  if (!admin) return response ?? NextResponse.json({ error: "Accès administrateur requis" }, { status: 403 });
  const params = new URL(request.url).searchParams;
  // Keep PostgREST filter syntax out of user-supplied search terms.
  const query = (params.get("q") ?? "").replace(/[^\p{L}\p{N}@._+\-\s]/gu, " ").trim().slice(0, 100);
  const rawPage = Number(params.get("page") ?? 0);
  const page = Number.isInteger(rawPage) ? Math.max(0, Math.min(rawPage, 10000)) : 0;
  const size = 40;
  let search = createAdminClient().from("profiles").select("id,email,full_name", { count: "exact" });
  if (query) search = search.or(`email.ilike.%${query}%,full_name.ilike.%${query}%`);
  const { data, count, error } = await search.order("created_at", { ascending: false }).order("id").range(page * size, page * size + size - 1);
  if (error) return NextResponse.json({ error: "Recherche des utilisateurs impossible." }, { status: 500 });
  return NextResponse.json({ users: data ?? [], total: count ?? 0, page, hasMore: (page + 1) * size < (count ?? 0) });
}
