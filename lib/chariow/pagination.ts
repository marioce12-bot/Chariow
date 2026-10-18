type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
export function collectionRows(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const row = record(value);
  for (const key of ["data", "items", "sales", "products", "results"]) {
    if (Array.isArray(row[key])) return row[key] as unknown[];
    if (row[key] && typeof row[key] === "object") {
      const nested = collectionRows(row[key]);
      if (nested.length) return nested;
    }
  }
  return [];
}
export type CollectionCoverage = { complete: boolean; fetched: number; pages: number; reason: string | null };
function cursorState(value: unknown, pageSize: number) {
  const row = record(value);
  const data = record(row.data);
  const meta = record(row.meta ?? data.meta ?? row.pagination ?? data.pagination);
  const links = record(row.links ?? data.links ?? meta.links);
  const candidate = meta.next_cursor ?? row.next_cursor ?? data.next_cursor;
  let next = typeof candidate === "string" && candidate.trim() ? candidate : null;
  if (!next && typeof links.next === "string") {
    try { next = new URL(links.next, "https://mcp.chariow.com").searchParams.get("cursor"); } catch { /* no usable cursor */ }
  }
  const rows = collectionRows(value);
  const explicitEnd = candidate === null || links.next === null || meta.has_more === false || row.has_more === false;
  const hasMore = meta.has_more === true || row.has_more === true || Boolean(links.next);
  return { next, complete: !next && !hasMore && (explicitEnd || rows.length < pageSize) };
}
export async function collectChariowPages(
  call: (args: Record<string, unknown>) => Promise<unknown>,
  args: Record<string, unknown> = {},
  maxPages = 20,
): Promise<{ data: unknown[]; coverage: CollectionCoverage }> {
  const data: unknown[] = [];
  const seenIds = new Set<string>();
  const cursors = new Set<string>();
  let cursor: string | null = null;
  let pages = 0;
  for (; pages < maxPages;) {
    let response: unknown;
    try { response = await call({ ...args, per_page: 100, ...(cursor ? { cursor } : {}) }); }
    catch (error) {
      if (!pages) throw error;
      return { data, coverage: { complete: false, fetched: data.length, pages, reason: "Une page Chariow n’a pas pu être récupérée." } };
    }
    pages++;
    for (const item of collectionRows(response)) {
      const row = record(item);
      const id = row.id ?? row.sale_id ?? row.order_id ?? row.uuid;
      if (id != null) {
        const key = String(id);
        if (seenIds.has(key)) continue;
        seenIds.add(key);
      }
      data.push(item);
    }
    const state = cursorState(response, 100);
    if (!state.next) return { data, coverage: { complete: state.complete, fetched: data.length, pages, reason: state.complete ? null : "Chariow ne fournit pas de curseur permettant de confirmer la fin de la liste." } };
    if (cursors.has(state.next)) return { data, coverage: { complete: false, fetched: data.length, pages, reason: "Chariow a renvoyé un curseur déjà parcouru." } };
    cursors.add(state.next);
    cursor = state.next;
  }
  return { data, coverage: { complete: false, fetched: data.length, pages, reason: "La limite de pages de cette synchronisation est atteinte." } };
}
