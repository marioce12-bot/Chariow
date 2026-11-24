import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CREDIT_OFFER_EMAIL,
  readTransactionalSuppressionList,
  sendCreditOfferConfirmation,
} from "./transactional-credit-offer";

const fetchMock = vi.fn();
const sender = "notifications@vendeo.example";

beforeEach(() => {
  vi.stubEnv("BREVO_API_KEY", "test-brevo-key");
  vi.stubEnv("EMAIL_FROM", sender);
  vi.stubEnv("EMAIL_FROM_NAME", "Vendeo test");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("readTransactionalSuppressionList", () => {
  it("reads every page without a sender filter and conservatively excludes every returned address", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      email: `blocked${index}@example.test`,
      senderEmail: sender,
      blockedAt: "2026-11-01T00:00:00Z",
      reason: { code: "hardBounce" },
    }));
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ contacts: firstPage, count: 101 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ contacts: [{
        email: "Last@Example.Test",
        senderEmail: "other-sender@example.test",
        blockedAt: "2026-11-02T00:00:00Z",
        reason: { code: "adminBlocked" },
      }], count: 101 }), { status: 200 }));

    const result = await readTransactionalSuppressionList();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.count).toBe(101);
    expect(result.blockedEmails.has("last@example.test")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstUrl = new URL(String(fetchMock.mock.calls[0][0]));
    const secondUrl = new URL(String(fetchMock.mock.calls[1][0]));
    expect(firstUrl.pathname).toBe("/v3/smtp/blockedContacts");
    expect(firstUrl.searchParams.get("limit")).toBe("100");
    expect(firstUrl.searchParams.get("offset")).toBe("0");
    expect(firstUrl.searchParams.has("senders")).toBe(false);
    expect(secondUrl.searchParams.get("offset")).toBe("100");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "GET", headers: { "api-key": "test-brevo-key" } });
  });

  it("fails closed when no API key is configured", async () => {
    vi.stubEnv("BREVO_API_KEY", "");
    await expect(readTransactionalSuppressionList()).resolves.toEqual({ ok: false, code: "brevo_not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed for an incomplete or malformed blocklist response", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ contacts: [], count: 1 }), { status: 200 }));
    await expect(readTransactionalSuppressionList()).resolves.toEqual({ ok: false, code: "brevo_blocklist_incomplete" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed if the suppression count changes during pagination", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ contacts: Array.from({ length: 100 }, (_, i) => ({ email: `b${i}@example.test`, senderEmail: sender })), count: 101 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ contacts: [{ email: "last@example.test", senderEmail: sender }], count: 102 }), { status: 200 }));
    await expect(readTransactionalSuppressionList()).resolves.toEqual({ ok: false, code: "brevo_blocklist_changed_during_read" });
  });

  it("fails closed on a Brevo API error", async () => {
    fetchMock.mockResolvedValue(new Response("unavailable", { status: 503 }));
    await expect(readTransactionalSuppressionList()).resolves.toEqual({ ok: false, code: "brevo_blocklist_http_503" });
  });
});

describe("sendCreditOfferConfirmation", () => {
  it("sends the exact approved copy to one recipient and returns only the Brevo message id", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ messageId: "<accepted-id>" }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }));

    await expect(sendCreditOfferConfirmation("alice@example.test")).resolves.toEqual({ status: "accepted", messageId: "<accepted-id>" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    const payload = JSON.parse(String(request.body));
    expect(payload.to).toEqual([{ email: "alice@example.test" }]);
    expect(payload.to).toHaveLength(1);
    expect(payload.subject).toBe(CREDIT_OFFER_EMAIL.subject);
    expect(payload.textContent).toBe(CREDIT_OFFER_EMAIL.text);
    expect(payload.textContent).not.toMatch(/essai|trial/i);
    expect(payload.htmlContent).toBe(CREDIT_OFFER_EMAIL.html);
    expect(payload.htmlContent).toContain("background-color:#f7f8fa");
    expect(payload.htmlContent).toContain("color:#2563eb");
    expect(payload.htmlContent).toContain("color:#138573");
    expect(payload.htmlContent).not.toMatch(/essai|trial/i);
    expect(request.headers).toMatchObject({ "api-key": "test-brevo-key" });
  });

  it("marks ambiguous server/network outcomes unknown rather than retryable", async () => {
    fetchMock.mockResolvedValue(new Response("temporary failure", { status: 503 }));
    await expect(sendCreditOfferConfirmation("alice@example.test")).resolves.toEqual({ status: "unknown", code: "brevo_send_http_503" });

    fetchMock.mockRejectedValueOnce(new Error("network failure"));
    await expect(sendCreditOfferConfirmation("alice@example.test")).resolves.toEqual({ status: "unknown", code: "brevo_send_outcome_unknown" });
  });

  it("does not make an API request for an invalid recipient", async () => {
    await expect(sendCreditOfferConfirmation("not-an-email")).resolves.toEqual({ status: "rejected", code: "invalid_recipient" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
