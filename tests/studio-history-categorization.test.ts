import { beforeEach, describe, expect, it, vi } from "vitest";

const { signedUrl } = vi.hoisted(() => ({ signedUrl: vi.fn(async (path: string) => `signed:${path}`) }));
vi.mock("@/lib/studio/media", () => ({ signedStudioUrl: signedUrl }));
import { enrichHistory, linkedSourceIds, readStudioHistory } from "@/lib/studio/history";

const U = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const image = (n: number, created_at: string, extra: Record<string, any> = {}) => ({ id: id(n), user_id: U, kind: "image", prompt: `image ${n}`, status: "completed", created_at, storage_path: `${U}/${id(n)}.png`, metadata: {}, ...extra });
const slideshow = (n: number, created_at: string, sourceIds: string[], extra: Record<string, any> = {}) => ({ id: id(n), user_id: U, kind: "video", prompt: "private provider prompt", status: "completed", created_at, storage_path: `${U}/${id(n)}.mp4`, metadata: { type: "slideshow", imageGenerationIds: sourceIds }, ...extra });

type Filter = (row: any) => boolean;
function pathValue(row: any, path: string): any {
  if (path === "id" || path === "kind" || path === "user_id" || path === "created_at") return row[path];
  if (path === "options->>type") return row.options?.type;
  if (path === "metadata->>type") return row.metadata?.type;
  if (path === "metadata->>taskKind") return row.metadata?.taskKind;
  if (path.startsWith("metadata->")) return path.slice(10).split("->").reduce((v, p) => v?.[p.replaceAll('"', "")], row.metadata);
  return undefined;
}
function expression(expr: string): Filter {
  // The OR syntax emitted by history.ts is deliberately interpreted against fixture rows,
  // rather than returning canned pages: these predicates are what exercise categorization.
  if (expr.includes("metadata->imageGenerationIds.cs.")) {
    const ids = [...expr.matchAll(/\[\"([0-9a-f-]{36})\"\]/g)].map(m => m[1]);
    const legacy = [...expr.matchAll(/\{"id":"([0-9a-f-]{36})"\}/g)].map(m => m[1]);
    return r => [...(r.metadata?.imageGenerationIds ?? []), ...(r.metadata?.images ?? []).map((x: any) => x.id)].some(x => ids.includes(x) || legacy.includes(x));
  }
  if (expr.startsWith("created_at.lt.")) {
    const m = expr.match(/^created_at\.lt\.([^,]+),and\(created_at\.eq\.([^,]+),id\.lt\.([^)]+)\)$/);
    if (m) return r => r.created_at < m[1] || (r.created_at === m[2] && r.id < m[3]);
    return r => r.created_at < expr.slice("created_at.lt.".length);
  }
  const clauses = expr.split(",");
  return row => clauses.some(clause => {
    const m = clause.match(/^(.+?)\.(eq|neq|is)\.(.*)$/);
    if (!m) return false;
    const [, path, op, raw] = m; const value = pathValue(row, path);
    const expected = raw === "null" ? null : raw;
    return op === "eq" ? value === expected : op === "neq" ? value !== expected : (expected === null ? value == null : value === expected);
  });
}
class MemorySupabase {
  calls: any[] = [];
  constructor(public rows: any[]) {}
  from(table: string) {
    const state: { filters: Filter[]; orders: { column: string; ascending: boolean }[]; start?: number; end?: number; max?: number } = { filters: [], orders: [] };
    const q: any = {
      select: () => q,
      eq: (col: string, val: any) => { state.filters.push(r => pathValue(r, col) === val); return q; },
      neq: (col: string, val: any) => { state.filters.push(r => pathValue(r, col) !== val); return q; },
      in: (col: string, vals: any[]) => { state.filters.push(r => vals.includes(pathValue(r, col))); return q; },
      or: (expr: string) => { state.filters.push(expression(expr)); return q; },
      lt: (col: string, val: string) => { state.filters.push(r => pathValue(r, col) < val); return q; },
      order: (column: string, opts: any = {}) => { state.orders.push({ column, ascending: opts.ascending !== false }); return q; },
      limit: (n: number) => { state.max = n; return q; },
      range: (start: number, end: number) => { state.start = start; state.end = end; return q; },
      then: (resolve: any, reject: any) => {
        try {
          this.calls.push({ table, ...state });
          let data = this.rows.filter(r => state.filters.every(f => f(r)));
          for (const ord of [...state.orders].reverse()) data.sort((a,b) => (a[ord.column] < b[ord.column] ? -1 : a[ord.column] > b[ord.column] ? 1 : 0) * (ord.ascending ? 1 : -1));
          if (state.start !== undefined) data = data.slice(state.start, (state.end ?? state.start) + 1);
          if (state.max !== undefined) data = data.slice(0, state.max);
          return Promise.resolve(resolve({ data, error: null }));
        } catch (e) { return Promise.resolve(reject(e)); }
      },
    };
    return q;
  }
}

beforeEach(() => signedUrl.mockClear());

describe("studio history categorization", () => {
  it("shows a saved final MP4 once in All and Video, while retaining source images in Images", async () => {
    const source = image(1, "2025-01-01T00:00:00.000Z");
    const final = slideshow(2, "2025-01-02T00:00:00.000Z", [source.id], { storage_path: `${U}/final.mp4` });
    const db = new MemorySupabase([source, final]);
    const all = await readStudioHistory(db, U, null, null);
    expect(all.items.map(x => x.id)).toEqual([final.id]);
    expect(all.items[0]).toMatchObject({ kind: "video", creationType: "slideshow", mediaUrl: `signed:${U}/final.mp4`, prompt: "Diaporama" });
    expect(all.items[0].prompt).not.toContain("private");
    expect((await readStudioHistory(db, U, "video", null)).items.map(x => x.id)).toEqual([final.id]);
    expect((await readStudioHistory(db, U, "image", null)).items.map(x => x.id)).toEqual([source.id]);
  });

  it("does not delete, recreate, or expose a technical task when a final exists; pending task without final remains visible without a render", async () => {
    const technical = { id: id(10), user_id: U, kind: "image", status: "completed", created_at: "2025-01-03T00:00:00.000Z", storage_path: `${U}/task.mp4`, options: { type: "studio_background_task" }, metadata: { type: "studio_background_task", taskKind: "slideshow", result: { generationId: id(11) }, input: { prompt: "secret", duration: 12 }, imageGenerationIds: [id(1)] } };
    const final = slideshow(11, "2025-01-03T00:00:01.000Z", [id(1)]);
    const pending = { id: id(12), user_id: U, kind: "image", status: "processing", created_at: new Date().toISOString(), storage_path: null, options: { type: "studio_background_task" }, metadata: { type: "studio_background_task", taskKind: "slideshow", input: { duration: 8, prompt: "secret" }, imageGenerationIds: [id(1)] } };
    const db = new MemorySupabase([technical, final, pending]);
    const result = await readStudioHistory(db, U, null, null);
    expect(result.items.map(x => x.id)).toEqual([pending.id, final.id]);
    expect(result.items[0]).toMatchObject({ mediaUrl: null, mediaState: "processing", metadata: { type: "slideshow", duration: 8, taskId: pending.id } });
    expect(result.items[0].prompt).not.toContain("secret");
    expect(result.items[1].mediaUrl).toBe(`signed:${U}/${final.id}.mp4`);
    expect(result.items.some(x => x.id === technical.id)).toBe(false);
    expect(signedUrl).not.toHaveBeenCalledWith(`${U}/task.mp4`);
  });

  it("links legacy sources using saved final membership even when the final is beyond the requested page", async () => {
    const source = image(20, "2025-01-01T00:00:00.000Z");
    const final = slideshow(21, "2025-01-02T00:00:00.000Z", [source.id]);
    const db = new MemorySupabase([source, final]);
    expect((await readStudioHistory(db, U, null, null)).items.map(x => x.id)).toEqual([final.id]);
    expect((await readStudioHistory(db, U, "image", null)).items.map(x => x.id)).toEqual([source.id]);
    const links = await linkedSourceIds(db, U, [source]);
    expect([...links]).toEqual([source.id]);
    expect(db.calls.some(c => c.filters.length > 1 && c.table === "studio_generations")).toBe(true);
  });

  it("paginates deterministically across equal timestamps using the id tie-break cursor", async () => {
    const rows = Array.from({ length: 23 }, (_, i) => image(i + 100, "2025-02-01T12:00:00.000Z"));
    const db = new MemorySupabase(rows);
    const first = await readStudioHistory(db, U, "image", null);
    expect(first.items).toHaveLength(20);
    expect(first.nextCursor).toBe(`${first.items[19].created_at}|${first.items[19].id}`);
    const second = await readStudioHistory(db, U, "image", first.nextCursor);
    expect(second.items).toHaveLength(3);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.items, ...second.items].map(x => x.id)).size).toBe(23);
  });

  it("isolates history, linked sources, and thumbnails by user", async () => {
    const source = image(31, "2025-01-01T00:00:00.000Z");
    const foreignFinal = { ...slideshow(32, "2025-01-02T00:00:00.000Z", [source.id]), user_id: OTHER };
    const ownFinal = slideshow(33, "2025-01-03T00:00:00.000Z", [source.id]);
    const db = new MemorySupabase([source, foreignFinal, ownFinal]);
    expect((await readStudioHistory(db, U, null, null)).items.map(x => x.id)).toEqual([ownFinal.id]);
    expect([...await linkedSourceIds(db, U, [source])]).toEqual([source.id]);
    const other = await linkedSourceIds(db, OTHER, [source]);
    expect(other.size).toBe(1); // foreign final links it for OTHER, not for U.
    expect((await readStudioHistory(db, OTHER, null, null)).items.map(x => x.id)).toEqual([foreignFinal.id]);
  });

  it("reports absent media as missing without attempting to regenerate it", async () => {
    const row = slideshow(40, "2025-03-01T00:00:00.000Z", [], { storage_path: null });
    const db = new MemorySupabase([row]);
    const result = await readStudioHistory(db, U, "video", null);
    expect(result.items[0]).toMatchObject({ mediaUrl: null, mediaState: "missing", status: "completed" });
    expect(signedUrl).not.toHaveBeenCalled();
  });

  it("never signs a foreign path or treats a source PNG as a final MP4", async () => {
    const rows = [
      slideshow(41, "2025-03-01T00:00:00.000Z", [], { storage_path: `${OTHER}/foreign.mp4` }),
      slideshow(42, "2025-03-01T00:00:00.000Z", [], { storage_path: `${U}/source.png` }),
    ];
    const result = await enrichHistory(new MemorySupabase(rows), U, rows);
    expect(result.every(row => row.mediaState === "missing" && row.mediaUrl === null)).toBe(true);
    expect(signedUrl).not.toHaveBeenCalled();
  });

  it.each(["not-a-date|bad-id", "2025-03-01T00:00:00.000Z),id.gt.0|bad-id", `2025-03-01T00:00:00.000Z|${id(1)}|extra`])("rejects an invalid cursor %s", async cursor => {
    await expect(readStudioHistory(new MemorySupabase([]), U, null, cursor)).rejects.toThrow("Curseur d’historique invalide.");
  });

  it("keeps technical non-slideshow work out and never exposes its provider inputs", async () => {
    const task = { id: id(51), user_id: U, kind: "image", status: "failed", created_at: "2025-03-02T00:00:00.000Z", storage_path: null, options: { type: "studio_background_task" }, metadata: { type: "studio_background_task", taskKind: "poster", input: { prompt: "hidden" } } };
    const db = new MemorySupabase([task]);
    expect((await readStudioHistory(db, U, null, null)).items).toEqual([]);
    expect((await readStudioHistory(db, U, "video", null)).items).toEqual([]);
  });
});
