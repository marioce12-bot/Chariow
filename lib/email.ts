// Envoi d'emails transactionnels et de notifications via l'API Brevo.
// Un seul fournisseur (Brevo) couvre à la fois les emails d'authentification
// Supabase (via son relais SMTP, configuré dans le dashboard Supabase) et les
// notifications administrateur ci-dessous (via son API HTTP).

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const BREVO_EVENTS_URL = "https://api.brevo.com/v3/events";
const BREVO_CONTACTS_URL = "https://api.brevo.com/v3/contacts";

function maskEmailAddress(email: string) {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "[email masqué]";
  return `${email[0]}***@${email.slice(at + 1)}`;
}

function redactBrevoLogText(text: string, email: string, apiKey: string) {
  const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text
    .replace(new RegExp(escapedEmail, "gi"), maskEmailAddress(email))
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, maskEmailAddress)
    .split(apiKey).join("[clé API masquée]");
}

type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    console.warn("Email non envoyé : BREVO_API_KEY ou EMAIL_FROM manquant.");
    return false;
  }
  try {
    const recipients = (Array.isArray(input.to) ? input.to : [input.to]).map((email) => ({ email }));
    const response = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: JSON.stringify({
        sender: { email: from, name: process.env.EMAIL_FROM_NAME || "Vendeo" },
        to: recipients,
        subject: input.subject,
        htmlContent: input.html,
        ...(input.text ? { textContent: input.text } : {}),
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error("Brevo email error", response.status, body);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Brevo email send error", error instanceof Error ? error.message : "unknown");
    return false;
  }
}

// Envoie une notification aux emails administrateur configurés. La variable
// ADMIN_NOTIFICATION_EMAIL accepte une liste séparée par des virgules pour
// notifier plusieurs administrateurs (ex. "a@domaine.com,b@domaine.com").
// Ne lève jamais d'erreur : une notification qui échoue ne doit pas casser le
// flux métier (webhook de paiement, hook d'inscription, etc.).
export async function notifyAdmin(subject: string, html: string): Promise<void> {
  const raw = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!raw) return;
  const recipients = raw
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
  if (recipients.length === 0) return;
  await sendEmail({ to: recipients, subject, html });
}

/** Starts the Brevo automation; the two-hour wait belongs to Brevo, not Vercel. */
export async function trackBrevoEvent(eventName: string, email: string, properties: Record<string, unknown> = {}) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.error("Brevo event skipped: BREVO_API_KEY missing");
    return false;
  }
  if (!/^[A-Za-z0-9_-]{1,255}$/.test(eventName)) {
    console.error("Brevo event skipped: invalid event name");
    return false;
  }
  const eventProperties = Object.fromEntries(Object.entries(properties).filter(([key, value]) =>
    /^[A-Za-z0-9_-]{1,255}$/.test(key)
      && (typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))),
  ));
  try {
    const response = await fetch(BREVO_EVENTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: JSON.stringify({
        event_name: eventName,
        identifiers: { email_id: email },
        event_date: new Date().toISOString(),
        event_properties: eventProperties,
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error("Brevo event rejected with status", response.status, {
        email: maskEmailAddress(email),
        body: redactBrevoLogText(body, email, apiKey),
      });
      return false;
    }
    return response.ok;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error("Brevo event error", redactBrevoLogText(message, email, apiKey));
    return false;
  }
}

export async function upsertBrevoContact(email: string, attributes: Record<string, unknown> = {}) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.error("Brevo contact upsert skipped: BREVO_API_KEY missing");
    return false;
  }
  try {
    const response = await fetch(BREVO_CONTACTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: JSON.stringify({ email, attributes, updateEnabled: true }),
    });
    if (!response.ok) {
      console.error("Brevo contact upsert rejected with status", response.status);
      return false;
    }
    return response.ok;
  } catch (error) {
    console.error("Brevo contact upsert error", error instanceof Error ? error.message : "unknown");
    return false;
  }
}

export async function updateBrevoContact(email: string, attributes: Record<string, unknown>) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return false;
  try {
    const response = await fetch(`${BREVO_CONTACTS_URL}/${encodeURIComponent(email)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: JSON.stringify({ attributes }),
    });
    return response.ok;
  } catch (error) {
    console.error("Brevo contact update error", error instanceof Error ? error.message : "unknown");
    return false;
  }
}

export function moneyXOF(value: number): string {
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value)} XOF`;
}
