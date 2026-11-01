import http from "node:http";
import https from "node:https";

export const STUDIO_PROXY_TIMEOUT_MS = 285_000;
const REQUEST_HEADERS = new Set([
  "accept",
  "accept-language",
  "authorization",
  "content-disposition",
  "content-length",
  "content-type",
  "if-match",
  "if-modified-since",
  "if-none-match",
  "origin",
  "range",
  "user-agent",
  "x-csrf-token",
  "x-idempotency-key",
  "x-request-id",
]);
const RESPONSE_HEADERS = new Set([
  "accept-ranges",
  "content-disposition",
  "content-length",
  "content-type",
  "etag",
  "last-modified",
]);
const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function sendJson(res, status, error) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  const body = JSON.stringify({ error });
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function isLocalHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function parseStudioUpstream(value, { allowInsecureLocalhost = false } = {}) {
  if (!value || typeof value !== "string") throw new TypeError("STUDIO_UPSTREAM_URL is required");
  const upstream = new URL(value);
  if (upstream.username || upstream.password || upstream.search || upstream.hash || upstream.pathname !== "/") {
    throw new TypeError("STUDIO_UPSTREAM_URL must be a bare origin without credentials, path, query or fragment");
  }
  const isLocalHttp = allowInsecureLocalhost && upstream.protocol === "http:" && isLocalHost(upstream.hostname);
  if (upstream.protocol !== "https:" && !isLocalHttp) {
    throw new TypeError("STUDIO_UPSTREAM_URL must use HTTPS");
  }
  if (!allowInsecureLocalhost && !upstream.hostname.toLowerCase().endsWith(".vercel.app")) {
    throw new TypeError("STUDIO_UPSTREAM_URL must point directly to the Vercel project host");
  }
  return upstream;
}

function pathnameOf(rawUrl) {
  const value = typeof rawUrl === "string" ? rawUrl : "/";
  if (!value.startsWith("/") || value.startsWith("//") || /[\r\n]/.test(value)) return null;
  const rawPath = value.split(/[?#]/, 1)[0];
  for (const segment of rawPath.split("/")) {
    try {
      const decoded = decodeURIComponent(segment);
      if (decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\")) return null;
    } catch {
      return null;
    }
  }
  try {
    const parsed = new URL(value, "http://render-proxy.invalid");
    if (parsed.origin !== "http://render-proxy.invalid") return null;
    return parsed.pathname;
  } catch {
    return null;
  }
}

export function isStudioApiPath(rawUrl) {
  const pathname = pathnameOf(rawUrl);
  return pathname === "/api/studio" || Boolean(pathname?.startsWith("/api/studio/"));
}

function requestProtocol(req) {
  const forwarded = req.headers["x-forwarded-proto"];
  const candidate = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0]?.trim();
  if (candidate === "https" || candidate === "http") return candidate;
  if (req.socket?.encrypted) return "https";
  return process.env.NODE_ENV === "production" ? "https" : "http";
}

function sameOriginRequest(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = req.headers.host;
  if (typeof host !== "string" || !host) return false;
  try {
    return new URL(origin).origin === new URL(`${requestProtocol(req)}://${host}`).origin;
  } catch {
    return false;
  }
}

function safeCookieHeader(header) {
  if (typeof header !== "string") return "";
  return header
    .split(";")
    .map((part) => part.trim())
    .filter((part) => /^sb-[^=;\s]+=/.test(part))
    .join("; ");
}

function safeSetCookies(value) {
  const cookies = Array.isArray(value) ? value : value ? [value] : [];
  return cookies
    .filter((cookie) => /^sb-[^=;\s]+=/.test(String(cookie).trim()))
    .map((cookie) => String(cookie).replace(/;\s*domain=[^;]*/ig, ""));
}

function makeTarget(req, upstream) {
  const rawUrl = typeof req.url === "string" ? req.url : "/";
  const target = new URL(rawUrl, upstream.origin);
  if (target.origin !== upstream.origin || !(target.pathname === "/api/studio" || target.pathname.startsWith("/api/studio/"))) {
    throw new TypeError("Only /api/studio/* paths may be proxied");
  }
  const host = typeof req.headers.host === "string" ? req.headers.host : "";
  if (host) {
    try {
      if (new URL(`${requestProtocol(req)}://${host}`).origin === upstream.origin) {
        throw new TypeError("STUDIO_UPSTREAM_URL would proxy to itself");
      }
    } catch (error) {
      if (error instanceof TypeError && error.message.includes("proxy to itself")) throw error;
    }
  }
  return target;
}

function forwardedRequestHeaders(req) {
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (!REQUEST_HEADERS.has(key) || value == null) continue;
    if (key === "origin" && !sameOriginRequest(req)) continue;
    if (key === "content-length" && !/^\d+$/.test(String(value))) continue;
    headers[key] = value;
  }
  const cookies = safeCookieHeader(req.headers.cookie);
  if (cookies) headers.cookie = cookies;
  return headers;
}

function rewrittenLocation(value, upstream, req) {
  if (typeof value !== "string") return undefined;
  try {
    const location = new URL(value, upstream.origin);
    if (location.origin !== upstream.origin) return value;
    const host = typeof req.headers.host === "string" ? req.headers.host : "";
    if (!host) return `${location.pathname}${location.search}${location.hash}`;
    return `${requestProtocol(req)}://${host}${location.pathname}${location.search}${location.hash}`;
  } catch {
    return value;
  }
}

/** Returns false for paths owned by Next; handles only /api/studio and descendants. */
export function handleStudioProxy(req, res, options = {}) {
  if (!isStudioApiPath(req.url)) return false;
  let upstream;
  let target;
  try {
    upstream = parseStudioUpstream(options.upstreamUrl ?? process.env.STUDIO_UPSTREAM_URL, {
      allowInsecureLocalhost: options.allowInsecureLocalhost === true,
    });
    target = makeTarget(req, upstream);
  } catch (error) {
    sendJson(res, 503, error instanceof Error ? error.message : "Studio proxy is not configured");
    return true;
  }

  if (!sameOriginRequest(req)) {
    sendJson(res, 403, "Cross-origin Studio request rejected");
    return true;
  }

  const transport = upstream.protocol === "https:" ? https : http;
  const outgoing = transport.request({
    protocol: upstream.protocol,
    hostname: upstream.hostname,
    port: upstream.port || undefined,
    method: req.method,
    path: `${target.pathname}${target.search}`,
    headers: forwardedRequestHeaders(req),
  }, (upstreamResponse) => {
    const responseHeaders = { ...SECURITY_HEADERS };
    for (const [key, value] of Object.entries(upstreamResponse.headers)) {
      if (RESPONSE_HEADERS.has(key) && value != null) responseHeaders[key] = value;
    }
    const cookies = safeSetCookies(upstreamResponse.headers["set-cookie"]);
    if (cookies.length) responseHeaders["Set-Cookie"] = cookies;
    const location = rewrittenLocation(upstreamResponse.headers.location, upstream, req);
    if (location) responseHeaders.Location = location;
    res.writeHead(upstreamResponse.statusCode ?? 502, responseHeaders);
    upstreamResponse.on("error", () => res.destroy());
    upstreamResponse.pipe(res);
  });

  let timedOut = false;
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
    ? options.timeoutMs
    : STUDIO_PROXY_TIMEOUT_MS;
  const timer = setTimeout(() => {
    timedOut = true;
    outgoing.destroy(new Error("Studio upstream timeout"));
    sendJson(res, 504, "Studio upstream timed out");
  }, timeoutMs);
  timer.unref?.();
  const clearTimer = () => clearTimeout(timer);
  res.once("finish", clearTimer);
  res.once("close", clearTimer);
  outgoing.on("error", () => {
    clearTimer();
    if (timedOut) return;
    sendJson(res, 502, "Studio upstream unavailable");
  });
  req.once("aborted", () => {
    clearTimer();
    outgoing.destroy();
  });
  req.pipe(outgoing);
  return true;
}
