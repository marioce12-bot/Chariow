import { META_GRAPH_BASE_URL } from "./api";

export interface MetaPixel {
  id: string;
  name: string;
  last_fired_time?: string | null;
}

const MAX_PIXEL_PAGES = 10;

/**
 * Récupère tous les pixels d'un compte publicitaire Meta (pagination incluse).
 * Ne lève jamais : renvoie l'erreur à part, pour qu'un échec sur les pixels
 * (permission manquante, compte restreint...) ne casse jamais la connexion Meta.
 */
export async function fetchMetaAdPixels(accountId: string, accessToken: string): Promise<{ pixels: MetaPixel[]; error: string | null }> {
  const pixels: MetaPixel[] = [];
  const first = new URL(`${META_GRAPH_BASE_URL}/${accountId}/adspixels`);
  first.searchParams.set("fields", "id,name,last_fired_time");
  first.searchParams.set("limit", "100");
  first.searchParams.set("access_token", accessToken);
  let next: string | null = first.toString();
  let pages = 0;
  try {
    while (next && pages < MAX_PIXEL_PAGES) {
      const response: Response = await fetch(next, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        return { pixels, error: typeof json?.error?.message === "string" ? json.error.message : `Lecture des pixels Meta impossible (${response.status})` };
      }
      if (Array.isArray(json.data)) {
        for (const row of json.data as Array<Record<string, unknown>>) {
          const id = String(row.id ?? "");
          if (!id) continue;
          pixels.push({
            id,
            name: typeof row.name === "string" && row.name ? row.name : `Pixel ${id}`,
            last_fired_time: typeof row.last_fired_time === "string" ? row.last_fired_time : null,
          });
        }
      }
      next = typeof json?.paging?.next === "string" ? json.paging.next : null;
      pages += 1;
    }
  } catch (error) {
    return { pixels, error: error instanceof Error ? error.message : "Lecture des pixels Meta impossible" };
  }
  return { pixels, error: null };
}

/**
 * Enregistre la liste de pixels d'un compte pub (upsert) et supprime ceux qui
 * n'existent plus côté Meta. À n'appeler qu'avec une liste issue d'un appel réussi.
 */
export async function saveMetaPixels(supabase: any, userId: string, adAccountId: string, pixels: MetaPixel[]) {
  const now = new Date().toISOString();
  if (pixels.length) {
    const rows = pixels.map((pixel) => ({
      user_id: userId,
      ad_account_id: adAccountId,
      pixel_id: pixel.id,
      name: pixel.name,
      ...(pixel.last_fired_time ? { last_fired_at: pixel.last_fired_time } : {}),
      last_synced_at: now,
    }));
    await supabase.from("meta_pixels").upsert(rows, { onConflict: "ad_account_id,pixel_id" });
  }
  let cleanup = supabase.from("meta_pixels").delete().eq("ad_account_id", adAccountId);
  if (pixels.length) cleanup = cleanup.not("pixel_id", "in", `(${pixels.map((pixel) => `"${pixel.id}"`).join(",")})`);
  await cleanup;
}

/** Récupère les pixels chez Meta puis les enregistre. Utilisé à la connexion du compte Meta. */
export async function syncMetaPixels(supabase: any, userId: string, account: { id: string; meta_account_id: string }, accessToken: string) {
  const { pixels, error } = await fetchMetaAdPixels(`act_${account.meta_account_id}`, accessToken);
  if (error) return { count: 0, error };
  await saveMetaPixels(supabase, userId, account.id, pixels);
  return { count: pixels.length, error: null };
}

/** Pixels déjà enregistrés pour un compte pub (repli si l'appel live ne renvoie rien). */
export async function loadStoredMetaPixels(supabase: any, adAccountId: string): Promise<Array<{ id: string; name: string }>> {
  const { data } = await supabase.from("meta_pixels").select("pixel_id,name").eq("ad_account_id", adAccountId).order("name", { ascending: true });
  return (data ?? []).map((row: { pixel_id: string; name: string | null }) => ({ id: row.pixel_id, name: row.name ?? `Pixel ${row.pixel_id}` }));
}
