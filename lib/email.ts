// Envoi d'emails transactionnels et de notifications via l'API Brevo.
// Un seul fournisseur (Brevo) couvre à la fois les emails d'authentification
// Supabase (via son relais SMTP, configuré dans le dashboard Supabase) et les
// notifications administrateur ci-dessous (via son API HTTP).

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    console.warn("Email non envoyé : BREVO_API_KEY ou EMAIL_FROM manquant.");
    return;
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
    }
  } catch (error) {
    console.error("Brevo email send error", error instanceof Error ? error.message : "unknown");
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

export function moneyXOF(value: number): string {
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value)} XOF`;
}
