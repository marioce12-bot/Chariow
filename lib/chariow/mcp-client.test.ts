import { afterEach, describe, expect, it, vi } from "vitest";
import { ChariowMcpClient } from "./mcp-client";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Chariow MCP HTTP retry policy", () => {
  it("does not retry an unauthorized request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("Unauthorized", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new ChariowMcpClient({ endpoint: "https://chariow.example/mcp" });

    await expect(client.initialize()).rejects.toThrow(/returned 401/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("backs off exponentially on 429 and retries up to a successful response", async () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 9, 24, 12) });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new ChariowMcpClient({ endpoint: "https://chariow.example/mcp" });

    const result = client.initialize();
    await vi.advanceTimersByTimeAsync(249);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(499);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toEqual({ tools: [] });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const ids = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).id);
    expect(ids).toEqual([1, 1, 1]);
  });
});
