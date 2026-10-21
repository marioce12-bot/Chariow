import { signedStudioUrl } from "@/lib/studio/media";

export const HISTORY_PAGE_SIZE = 20;
const BATCH_SIZE = 40;
const TASK_TYPE = "studio_background_task";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export function isSlideshow(row: any) {
  return row.metadata?.type === "slideshow" || row.options?.type === "slideshow" || row.metadata?.taskKind === "slideshow";
}
export function sourceIds(row: any): string[] {
  const ids = row.metadata?.imageGenerationIds ?? row.metadata?.images?.map((image: any) => image.id) ?? [];
  return Array.isArray(ids) ? ids.filter((id: unknown): id is string => typeof id === "string" && uuid.test(id)) : [];
}
function isTask(row: any) {
  return row.metadata?.type === TASK_TYPE || row.options?.type === TASK_TYPE;
}
function cursorFor(row: any) { return `${row.created_at}|${row.id}`; }
function afterCursor(query: any, cursor: string | null) {
  if (!cursor) return query;
  const [createdAt, id] = cursor.split("|");
  if (cursor.split("|").length > 2 || !timestamp.test(createdAt) || !Number.isFinite(Date.parse(createdAt)) || (id && !uuid.test(id))) throw new Error("Curseur d’historique invalide.");
  return id ? query.or(`created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`) : query.lt("created_at", createdAt);
}

/** Resolve legacy source membership from saved final objects, not from prompt text or image order. */
export async function linkedSourceIds(supabase: any, userId: string, rows: any[]) {
  const candidates = rows.filter(row => row.kind === "image" && !isSlideshow(row) && uuid.test(row.id)).map(row => row.id);
  const linked = new Set<string>();
  if (!candidates.length) return linked;
  const clauses = candidates.flatMap(id => [
    `metadata->imageGenerationIds.cs.["${id}"]`,
    `metadata->images.cs.[{"id":"${id}"}]`,
  ]).join(",");
  for (let offset = 0; ; offset += 200) {
    const { data, error } = await supabase.from("studio_generations")
      .select("id,metadata")
      .eq("user_id", userId)
      .or("metadata->>type.eq.slideshow,options->>type.eq.slideshow,metadata->>taskKind.eq.slideshow")
      .or(clauses)
      .order("id")
      .range(offset, offset + 199);
    if (error) throw error;
    for (const row of data ?? []) for (const id of sourceIds(row)) linked.add(id);
    if ((data?.length ?? 0) < 200 || candidates.every(id => linked.has(id))) break;
  }
  return linked;
}

export async function enrichHistory(supabase: any, userId: string, rows: any[]) {
  const thumbnailIds = [...new Set(rows.filter(isSlideshow).map(row => sourceIds(row)[0]).filter(Boolean))];
  const thumbnails = new Map<string, string>();
  if (thumbnailIds.length) {
    const { data, error } = await supabase.from("studio_generations").select("id,storage_path").eq("user_id", userId).in("id", thumbnailIds).limit(HISTORY_PAGE_SIZE);
    if (error) throw error;
    for (const row of data ?? []) if (row.storage_path?.startsWith(`${userId}/`)) thumbnails.set(row.id, row.storage_path);
  }
  return Promise.all(rows.map(async row => {
    const slideshow = isSlideshow(row);
    const task = isTask(row);
    // A technical task is only shown when no final object was ever saved. Never recreate a deleted final.
    const ownedPath = typeof row.storage_path === "string" && row.storage_path.startsWith(`${userId}/`);
    const storagePath = !task && ownedPath && (!slideshow || /\.mp4$/i.test(row.storage_path)) ? row.storage_path : null;
    const mediaUrl = storagePath ? await signedStudioUrl(storagePath).catch(() => null) : null;
    const thumbnailPath = thumbnails.get(sourceIds(row)[0]);
    const thumbnailUrl = thumbnailPath ? await signedStudioUrl(thumbnailPath).catch(() => null) : null;
    const stale = task && row.status === "processing" && Date.now() - Date.parse(row.metadata.updatedAt || row.created_at) > 7 * 60_000;
    const processing = row.status === "processing" && !stale;
    const mediaState = mediaUrl ? "ready" : processing ? "processing" : slideshow || row.status === "completed" ? "missing" : "failed";
    const { metadata, ...rest } = row;
    // Do not send provider prompts or the full task input as the label of a final slideshow.
    const publicMetadata = task ? { type: "slideshow", duration: metadata.input?.duration, imageGenerationIds: sourceIds(row), taskId: row.id } : metadata;
    return {
      ...rest, metadata: publicMetadata,
      kind: slideshow ? "video" : row.kind,
      creationType: slideshow ? "slideshow" : row.kind,
      prompt: slideshow ? "Diaporama" : row.prompt,
      status: stale ? "failed" : row.status,
      mediaUrl, thumbnailUrl, mediaState,
      sourceImageCount: slideshow ? sourceIds(row).length : undefined,
    };
  }));
}

/** A final slideshow occupies one history card in All/Video; sources remain reusable in Images. */
export async function readStudioHistory(supabase: any, userId: string, kind: string | null, cursor: string | null) {
  const items: any[] = [];
  let scanCursor = cursor;
  let hasMore = false;
  // Bound work per request; a continuation cursor is preserved even when a long legacy source run is skipped.
  for (let batch = 0; batch < 10 && items.length < HISTORY_PAGE_SIZE; batch++) {
    let query = supabase.from("studio_generations").select("*").eq("user_id", userId)
      .or("options->>type.is.null,options->>type.neq.studio_background_task,metadata->>taskKind.eq.slideshow")
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(BATCH_SIZE);
    if (kind === "video") query = query.or("kind.eq.video,metadata->>type.eq.slideshow,options->>type.eq.slideshow,metadata->>taskKind.eq.slideshow");
    if (kind === "image") query = query.eq("kind", "image").or("metadata->>type.is.null,metadata->>type.neq.slideshow").or("options->>type.is.null,options->>type.neq.slideshow").or("metadata->>taskKind.is.null,metadata->>taskKind.neq.slideshow");
    query = afterCursor(query, scanCursor);
    const { data, error } = await query;
    if (error) throw error;
    const rows = data ?? [];
    if (!rows.length) { hasMore = false; break; }
    const sources = kind === "image" ? new Set<string>() : await linkedSourceIds(supabase, userId, rows);
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      scanCursor = cursorFor(row);
      hasMore = index < rows.length - 1 || rows.length === BATCH_SIZE;
      if (isTask(row) && (!isSlideshow(row) || row.metadata?.result?.generationId)) continue;
      if (kind !== "image" && sources.has(row.id) && !isSlideshow(row)) continue;
      items.push(row);
      if (items.length === HISTORY_PAGE_SIZE) break;
    }
    if (rows.length < BATCH_SIZE && items.length < HISTORY_PAGE_SIZE) { hasMore = false; break; }
  }
  return { items: await enrichHistory(supabase, userId, items), nextCursor: hasMore ? scanCursor : null };
}
