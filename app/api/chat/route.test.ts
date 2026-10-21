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
import { POST, maxDuration } from "@/app/api/chat/route";

function makeSupabase() {
  const db: Record<string, any> = { history: [] };
  function builder(table: string) {
    const obj: any = { table, result: undefined };
    for (const method of ["select", "eq", "in", "gte", "lte", "order", "limit", "update", "insert"]) obj[method] = vi.fn((value: any) => { if (method === "insert") { obj.insertValue = value; if (table === "messages") { obj.insertedRow = { id: `message-${db.history.length + 1}`, attachments: [], created_at: new Date(db.history.length).toISOString(), ...value }; db.history.push(obj.insertedRow); } } return obj; });
    obj.maybeSingle = vi.fn(async () => ({ data: { id: "conversation-1", title: "Titre" }, error: null }));
    obj.single = vi.fn(async () => ({ data: table === "conversations" ? { id: "conversation-1", title: obj.insertValue?.title ?? "Titre" } : obj.insertedRow ?? { id: "message-id", role: "assistant", content: "ok", attachments: [], created_at: "now" }, error: null }));
    obj.then = (resolve: any, reject: any) => Promise.resolve({ data: table === "messages" ? [...db.history].reverse() : [], error: null }).then(resolve, reject);
    return obj;
  }
  return { from: vi.fn((table: string) => builder(table)), rpc: vi.fn().mockResolvedValue({ data: { free_messages_used: 1, free_messages_limit: 20, messages_used_this_month: 1, messages_limit: 100, plan: "free", status: "active" }, error: null }), get history() { return db.history; }, set history(value: any[]) { db.history = value; } };
}

describe("POST /api/chat provider selection", () => {
  it("allows up to 120 seconds for the chat route", () => { expect(maxDuration).toBe(120); });
  let supabase: ReturnType<typeof makeSupabase>;
  beforeEach(() => {
    vi.clearAllMocks(); supabase = makeSupabase();
    vi.mocked(requireUser).mockResolvedValue({ supabase: supabase as any, user: { id: "user-1" }, response: null } as any);
    askGemini.mockResolvedValue("Réponse en français");
  });
  it("sends chronological prior turns and current French message to Gemini 3.6; never calls Imole", async () => {
    supabase.history = [{ role: "user", content: "Première question" }, { role: "assistant", content: "Première réponse" }];
    const response = await POST(new Request("http://localhost/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "Et ensuite ?", conversationId: "conversation-1" }) }));
    expect(response.status).toBe(200);
    const [messages, options] = askGemini.mock.calls[0];
    expect(options).toEqual({ model: "gemini-3.6-flash", timeoutMs: 60000, thinkingLevel: "LOW" });
    expect(messages.slice(-3).map((m: any) => [m.role, m.content])).toEqual([["user", "Première question"], ["assistant", "Première réponse"], ["user", "Et ensuite ?"]]);
    expect(askImole).not.toHaveBeenCalled();
  });
  it("mémorise un échange français de cinq tours, dont le budget en XOF, dans la même conversation", async () => {
    const turns = [
      { user: "Je veux lancer une publicité pour mon ebook de cuisine.", assistant: "Très bien, quel public souhaitez-vous cibler ?" },
      { user: "Des femmes de 25 à 40 ans au Sénégal.", assistant: "Quel budget quotidien et quelle durée prévoyez-vous ?" },
      { user: "Mon budget est de 5 000 XOF par jour pendant 7 jours.", assistant: "Je retiens 5 000 XOF par jour pendant 7 jours." },
      { user: "Ce sera sur Facebook et Instagram.", assistant: "Quel texte créatif souhaitez-vous utiliser ?" },
      { user: "Utilise « Des recettes simples pour toute la famille ».", assistant: "C'est noté : la publicité utilisera ce texte, au Sénégal, pour les femmes de 25 à 40 ans, avec un budget de 5 000 XOF par jour pendant 7 jours." },
    ];
    for (const turn of turns) {
      askGemini.mockResolvedValueOnce(turn.assistant);
      const response = await POST(new Request("http://localhost/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: turn.user, conversationId: "conversation-1" }) }));
      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload).toMatchObject({ conversationId: "conversation-1", message: { role: "assistant", content: turn.assistant } });
      expect(supabase.history.slice(-2).map(({ role, content }: any) => [role, content])).toEqual([["user", turn.user], ["assistant", turn.assistant]]);
    }
    expect(supabase.history).toHaveLength(10);
    expect(supabase.history.filter(({ role }: any) => role === "user").map(({ content }: any) => content)).toContain("Mon budget est de 5 000 XOF par jour pendant 7 jours.");
    const finalHistory = askGemini.mock.calls[4][0];
    expect(finalHistory.slice(-2).map((item: any) => [item.role, item.content])).toEqual([["assistant", turns[3].assistant], ["user", turns[4].user]]);
    expect(finalHistory.at(-1)).toMatchObject({ role: "user", content: turns[4].user });
    expect(finalHistory.some((item: any) => item.content?.includes("5 000 XOF"))).toBe(true);
    expect(askGemini).toHaveBeenCalledTimes(5);
    expect(askImole).not.toHaveBeenCalled();
  });
  it.each(["quota 429", "model 404", "timeout", "empty response"])("returns controlled failure for Gemini %s without provider fallback", async (failure) => {
    askGemini.mockRejectedValue(new Error(failure));
    const response = await POST(new Request("http://localhost/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "Bonjour" }) }));
    expect(response.status).toBe(502);
    expect(askGemini).toHaveBeenCalledTimes(1);
    expect(askGemini.mock.calls[0][1]).toEqual({ model: "gemini-3.6-flash", timeoutMs: 60000, thinkingLevel: "LOW" });
    expect(askImole).not.toHaveBeenCalled();
  });
});
