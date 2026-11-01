import http from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  handleStudioProxy,
  isStudioApiPath,
  parseStudioUpstream,
  STUDIO_PROXY_TIMEOUT_MS,
} from "./studio-proxy.mjs";

let upstreamServer;
let proxyServer;
let upstreamUrl;
let proxyUrl;
let received;
const openedServers = [];

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  openedServers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP server address");
  return `http://127.0.0.1:${address.port}`;
}

async function close(server) {
  if (!server?.listening) return;
  await new Promise((resolve) => server.close(resolve));
}

function createProxy(options = {}) {
  return http.createServer((req, res) => {
    if (!handleStudioProxy(req, res, { upstreamUrl, allowInsecureLocalhost: true, timeoutMs: 1_000, ...options })) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
    }
  });
}

beforeEach(async () => {
  received = [];
  upstreamServer = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      received.push({ method: req.method, url: req.url, headers: req.headers, body });
      if (req.url?.startsWith("/api/studio/unauth") && !req.headers.cookie && !req.headers.authorization) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "authentication required" }));
        return;
      }
      if (req.url?.startsWith("/api/studio/cookies")) {
        res.writeHead(204, {
          "Set-Cookie": [
            "sb-project-auth-token=refreshed; Domain=project.vercel.app; Path=/; HttpOnly; Secure; SameSite=Lax",
            "unrelated_session=must-not-cross-host; Domain=vercel.app; Path=/; HttpOnly",
          ],
        });
        res.end();
        return;
      }
      if (req.url?.startsWith("/api/studio/error")) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "upstream unavailable" }));
        return;
      }
      if (req.url?.startsWith("/api/studio/slow")) {
        setTimeout(() => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        }, 150);
        return;
      }
      res.writeHead(201, { "Content-Type": "application/json", "Cache-Control": "public, max-age=600" });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  upstreamUrl = await listen(upstreamServer);
  proxyServer = createProxy();
  proxyUrl = await listen(proxyServer);
});

afterEach(async () => {
  await Promise.all(openedServers.splice(0).reverse().map(close));
});

describe("Render to Vercel Studio proxy", () => {
  it("forwards an authenticated request, body and query while filtering unrelated cookies and internal secrets", async () => {
    const response = await fetch(`${proxyUrl}/api/studio/tasks?source=dashboard`, {
      method: "POST",
      headers: {
        Origin: proxyUrl,
        Authorization: "Bearer user-session-token",
        Cookie: "sb-project-auth-token=auth-cookie; unrelated_session=private-cookie",
        "Content-Type": "application/json",
        "X-Studio-Task-Token": "must-not-be-forwarded",
      },
      body: JSON.stringify({ prompt: "test" }),
    });

    expect(response.status).toBe(201);
    expect(received).toHaveLength(1);
    expect(received[0].method).toBe("POST");
    expect(received[0].url).toBe("/api/studio/tasks?source=dashboard");
    expect(received[0].headers.authorization).toBe("Bearer user-session-token");
    expect(received[0].headers.cookie).toBe("sb-project-auth-token=auth-cookie");
    expect(received[0].headers["x-studio-task-token"]).toBeUndefined();
    expect(received[0].body).toBe(JSON.stringify({ prompt: "test" }));
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("returns the upstream authentication refusal for an unauthenticated request", async () => {
    const response = await fetch(`${proxyUrl}/api/studio/unauth`, { headers: { Origin: proxyUrl } });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "authentication required" });
  });

  it("forwards only Supabase refresh cookies and removes Vercel Domain attributes", async () => {
    const response = await fetch(`${proxyUrl}/api/studio/cookies`);
    expect(response.status).toBe(204);
    const cookies = response.headers.get("set-cookie") ?? "";
    expect(cookies).toContain("sb-project-auth-token=refreshed");
    expect(cookies).not.toContain("Domain=");
    expect(cookies).not.toContain("unrelated_session");
  });

  it("forwards upstream 5xx responses without exposing proxy internals", async () => {
    const response = await fetch(`${proxyUrl}/api/studio/error`);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "upstream unavailable" });
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });

  it("rejects cross-origin mutations before contacting Vercel", async () => {
    const response = await fetch(`${proxyUrl}/api/studio/tasks`, {
      method: "POST",
      headers: { Origin: "https://attacker.invalid", "Content-Type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(403);
    expect(received).toHaveLength(0);
  });

  it("returns 504 when the configured upstream deadline expires", async () => {
    const shortProxy = createProxy({ timeoutMs: 20 });
    const shortProxyUrl = await listen(shortProxy);
    const response = await fetch(`${shortProxyUrl}/api/studio/slow`);
    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({ error: "Studio upstream timed out" });
  });

  it("confines routing to safe /api/studio paths and requires a direct HTTPS Vercel origin in production", () => {
    expect(isStudioApiPath("/api/studio/tasks?x=1")).toBe(true);
    expect(isStudioApiPath("/api/studioo/tasks")).toBe(false);
    expect(isStudioApiPath("/api/studio/../admin")).toBe(false);
    expect(isStudioApiPath("/api/studio/%2f..%2fadmin")).toBe(false);
    expect(() => parseStudioUpstream("https://example.com")).toThrow("Vercel project host");
    expect(() => parseStudioUpstream("https://project.vercel.app/api")).toThrow("bare origin");
    expect(parseStudioUpstream("https://project.vercel.app").hostname).toBe("project.vercel.app");
    expect(STUDIO_PROXY_TIMEOUT_MS).toBe(285_000);
  });
});
