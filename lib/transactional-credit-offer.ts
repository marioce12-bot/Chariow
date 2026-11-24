const BREVO_BLOCKLIST_URL = "https://api.brevo.com/v3/smtp/blockedContacts";
const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";
const BLOCKLIST_PAGE_SIZE = 100;
const MAX_BLOCKLIST_CONTACTS = 100_000;

export const CREDIT_OFFER_EMAIL = {
  subject: "Confirmation : 100 crédits ajoutés à votre compte Vendeo",
  text: "Bonjour,\n\nPour clôturer novembre en beauté, 100 crédits gratuits ont été ajoutés à votre compte Vendeo. Vous pouvez les utiliser dès maintenant dans le Studio.\n\nÀ bientôt,\nL’équipe Vendeo.",
  html: `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>Confirmation de crédits Vendeo</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f7f8fa;color:#192434;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">
      Confirmation : 100 crédits ajoutés à votre compte Vendeo.
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#f7f8fa;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #e3e8ef;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="height:5px;background-color:#2563eb;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:26px 32px 20px;border-bottom:1px solid #e3e8ef;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td valign="middle" style="width:38px;height:38px;border-radius:11px;background-color:#2563eb;color:#ffffff;text-align:center;font-size:20px;font-weight:700;">V</td>
                    <td valign="middle" style="padding-left:11px;color:#192434;font-size:20px;font-weight:700;letter-spacing:-0.3px;">Vendeo</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 32px 18px;">
                <p style="margin:0 0 18px;color:#192434;font-size:16px;line-height:1.65;">Bonjour,</p>
                <p style="margin:0 0 18px;color:#405064;font-size:16px;line-height:1.75;">
                  Pour clôturer novembre en beauté, <strong style="color:#2563eb;font-weight:700;">100 crédits gratuits</strong> ont été ajoutés à votre compte Vendeo. Vous pouvez les utiliser dès maintenant dans le Studio.
                </p>
                <p style="margin:0;color:#192434;font-size:16px;line-height:1.7;">
                  À bientôt,<br><strong style="color:#138573;font-weight:700;">L’équipe Vendeo.</strong>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 30px;">
                <div style="height:1px;background-color:#e3e8ef;font-size:0;line-height:0;">&nbsp;</div>
              </td>
            </tr>
          </table>
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
            <tr><td style="padding:16px 12px 0;color:#647184;text-align:center;font-size:12px;line-height:1.5;">Vendeo</td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
};

export type TransactionalSuppressionRead =
  | { ok: true; blockedEmails: Set<string>; count: number }
  | { ok: false; code: string };

export type CreditOfferEmailResult =
  | { status: "accepted"; messageId: string | null }
  | { status: "rejected"; code: string }
  | { status: "unknown"; code: string };

type BlockedContact = {
  email?: unknown;
  senderEmail?: unknown;
};

type BlockedContactsResponse = {
  contacts?: unknown;
  count?: unknown;
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Reads the complete transaction-level suppression list with no sender filter.
 * All returned addresses are excluded conservatively, regardless of sender.
 * Any missing page, malformed response, changing total, or error fails closed.
 */
export async function readTransactionalSuppressionList(
  fetcher: typeof fetch = fetch,
): Promise<TransactionalSuppressionRead> {
  const apiKey = process.env.BREVO_API_KEY;
  const sender = process.env.EMAIL_FROM;
  if (!apiKey || !sender || !isEmail(sender)) return { ok: false, code: "brevo_not_configured" };

  const blockedEmails = new Set<string>();
  let offset = 0;
  let expectedCount: number | null = null;

  while (expectedCount === null || offset < expectedCount) {
    if (offset > MAX_BLOCKLIST_CONTACTS) return { ok: false, code: "brevo_blocklist_too_large" };
    const query = new URLSearchParams({ limit: String(BLOCKLIST_PAGE_SIZE), offset: String(offset) });
    let response: Response;
    try {
      response = await fetcher(`${BREVO_BLOCKLIST_URL}?${query.toString()}`, {
        method: "GET",
        headers: { accept: "application/json", "api-key": apiKey },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      return { ok: false, code: "brevo_blocklist_unreachable" };
    }
    if (!response.ok) return { ok: false, code: `brevo_blocklist_http_${response.status}` };

    let payload: BlockedContactsResponse;
    try {
      payload = await response.json() as BlockedContactsResponse;
    } catch {
      return { ok: false, code: "brevo_blocklist_invalid_json" };
    }
    if (!Number.isSafeInteger(payload.count) || Number(payload.count) < 0 || Number(payload.count) > MAX_BLOCKLIST_CONTACTS) {
      return { ok: false, code: "brevo_blocklist_invalid_count" };
    }
    if (expectedCount === null) expectedCount = Number(payload.count);
    else if (Number(payload.count) !== expectedCount) return { ok: false, code: "brevo_blocklist_changed_during_read" };

    if (!Array.isArray(payload.contacts)) return { ok: false, code: "brevo_blocklist_invalid_contacts" };
    const contacts = payload.contacts as BlockedContact[];
    if (contacts.length > BLOCKLIST_PAGE_SIZE || offset + contacts.length > expectedCount) {
      return { ok: false, code: "brevo_blocklist_invalid_page" };
    }
    if (contacts.length === 0 && offset < expectedCount) return { ok: false, code: "brevo_blocklist_incomplete" };

    for (const contact of contacts) {
      if (typeof contact.email !== "string" || !isEmail(contact.email)) {
        return { ok: false, code: "brevo_blocklist_invalid_contact" };
      }
      if (contact.senderEmail !== undefined && contact.senderEmail !== null && typeof contact.senderEmail !== "string") {
        return { ok: false, code: "brevo_blocklist_invalid_sender" };
      }
      blockedEmails.add(normalizeEmail(contact.email));
    }

    offset += contacts.length;
    if (expectedCount === 0) break;
  }

  if (offset !== expectedCount) return { ok: false, code: "brevo_blocklist_incomplete" };
  return { ok: true, blockedEmails, count: expectedCount };
}

/** Sends the exact one-recipient transactional confirmation; never logs PII. */
export async function sendCreditOfferConfirmation(
  email: string,
  fetcher: typeof fetch = fetch,
): Promise<CreditOfferEmailResult> {
  const apiKey = process.env.BREVO_API_KEY;
  const sender = process.env.EMAIL_FROM;
  if (!apiKey || !sender) return { status: "rejected", code: "brevo_not_configured" };
  if (!isEmail(email)) return { status: "rejected", code: "invalid_recipient" };

  try {
    const response = await fetcher(BREVO_SEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: JSON.stringify({
        sender: { email: sender, name: process.env.EMAIL_FROM_NAME || "Vendeo" },
        to: [{ email }],
        subject: CREDIT_OFFER_EMAIL.subject,
        textContent: CREDIT_OFFER_EMAIL.text,
        htmlContent: CREDIT_OFFER_EMAIL.html,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return response.status >= 500 || response.status === 429
        ? { status: "unknown", code: `brevo_send_http_${response.status}` }
        : { status: "rejected", code: `brevo_send_http_${response.status}` };
    }
    let messageId: string | null = null;
    try {
      const payload = await response.json() as { messageId?: unknown };
      if (typeof payload.messageId === "string") messageId = payload.messageId;
    } catch {
      // A 2xx from Brevo still means the request was accepted even without a body.
    }
    return { status: "accepted", messageId };
  } catch {
    // The remote outcome is ambiguous; the caller must not automatically retry.
    return { status: "unknown", code: "brevo_send_outcome_unknown" };
  }
}

export function normalizeSuppressionEmail(email: string) {
  return normalizeEmail(email);
}

export function isValidOfferEmail(email: string) {
  return isEmail(email.trim());
}
