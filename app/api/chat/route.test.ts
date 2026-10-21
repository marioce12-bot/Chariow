import { beforeEach, describe, expect, it, vi } from "vitest";

const { askGemini, askImole } = vi.hoisted(() => ({ askGemini: vi.fn(), askImole: vi.fn() }));
vi.mock("@/lib/ai/gemini", () => ({ askGemini }));
vi.mock("@/lib/ai/imole", () => ({ askImole }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/chariow/analytics", () => ({ getChariowSnapshot: vi.fn(), serializeChariowContext: vi.fn() }));
vi.mock("@/lib/ai/format", () => ({ cleanAiText: (text: string) => text }));
vi.mock("@/lib/profitability-aggregates", () => ({ calculateProfitabilityAggregate: vi.fn() }));
vi.mock("@/lib/meta/diagnostic-server", () => ({ buildDiagnosticReports: vi.fn().mockResolvedValue({ reports: [] }) }));
vi.mock("@/lib/crypto", () => ({ decryptSecret: vi.fn() }));
vi.mock("@/lib/meta/api", () => ({ fetchMetaAccounts: vi.fn() }));
vi.mock("@/lib/shop/chat", () => ({ VITRINE_PROMPT: "", processVitrineAnswer: ({ answer }: { answer: string }) => answer, wantsVitrine: () => false }));
vi.mock("@/lib/chariow/chat-product", () => ({ resolveCampaignAnswer: (answer: string) => answer }));
import { requireUser } from "@/lib/auth";
import { POST } from "@/app/api/chat/route";

function makeSupabase() {
  const db: Record<string, any> = { history: [] };
  function builder(table: string) {
    const obj: any = { table, result: undefined };
    for (const method of ["select", "eq", "in", "gte", "lte", "order", "limit", "update", "insert"]) obj[method] = vi.fn((value: any) => { if (method === "insert") obj.insertValue = value; return obj; });
    obj.maybeSingle = vi.fn(async () => ({ data: { id: "conversation-1", title: "Titre" }, error: null }));
    obj.single = vi.fn(async () => ({ data: table === "conversations" ? { id: "conversation-1", title: obj.insertValue?.title ?? "Titre" } : { id: "message-id", role: "assistant", content: "ok", attachments: [], created_at: "now" }, error: null }));
    obj.then = (resolve: any, reject: any) => Promise.resolve({ data: table === "messages" ? (db.history ?? []) : [], error: null }).then(resolve, reject);
    return obj;
  }
  return { from: vi.fn((table: string) => builder(table)), rpc: vi.fn().mockResolvedValue({ data: { free_messages_used: 1, free_messages_limit: 20, messages_used_this_month: 1, messages_limit: 100, plan: "free", status: "active" }, error: null }), get history() { return db.history; }, set history(value: any[]) { db.history = value; } };
}

describe("POST /api/chat provider selection", () => {
  let supabase: ReturnType<typeof makeSupabase>;
  beforeEach(() => {
    vi.clearAllMocks(); supabase = makeSupabase();
    vi.mocked(requireUser).mockResolvedValue({ supabase: supabase as any, user: { id: "user-1" }, response: null } as any);
    askGemini.mockResolvedValue("Réponse en français");
  });
  it("sends chronological prior turns and current French message to Gemini 3.6; never calls Imole", async () => {
    supabase.history = [{ role: "assistant", content: "Première réponse" }, { role: "user", content: "Première question" }];
    const response = await POST(new Request("http://localhost/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "Et ensuite ?", conversationId: "conversation-1" }) }));
    expect(response.status).toBe(200);
    const [messages, options] = askGemini.mock.calls[0];
    expect(options).toEqual({ model: "gemini-3.6-flash" });
    expect(messages.slice(-3).map((m: any) => [m.role, m.content])).toEqual([["user", "Première question"], ["assistant", "Première réponse"], ["user", "Et ensuite ?"]]);
    expect(askImole).not.toHaveBeenCalled();
  });
  it.each(["quota 429", "model 404", "timeout", "empty response"])("returns controlled failure for Gemini %s without provider fallback", async (failure) => {
    askGemini.mockRejectedValue(new Error(failure));
    const response = await POST(new Request("http://localhost/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "Bonjour" }) }));
    expect(response.status).toBe(502);
    expect(askGemini).toHaveBeenCalledTimes(1);
    expect(askGemini.mock.calls[0][1]).toEqual({ model: "gemini-3.6-flash" });
    expect(askImole).not.toHaveBeenCalled();
  });
});
