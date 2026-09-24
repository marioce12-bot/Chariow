// Envoi d'emails transactionnels et de notifications via l'API Resend.
// Un seul fournisseur (Resend) couvre à la fois les emails d'authentification
// Supabase (via son endpoint SMTP, configuré dans le dashboard Supabase) et
// les notifications administrateur ci-dessous (via son API HTTP).

const RESEND_API_URL = "https://api.resend.com/emails";

type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    console.warn("Email non envoyé : RESEND_API_KEY ou EMAIL_FROM manquant.");
    return;
  }
  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to: input.to, subject: input.subject, html: input.html, text: input.text }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error("Resend email error", response.status, body);
    }
  } catch (error) {
    console.error("Resend email send error", error instanceof Error ? error.message : "unknown");
  }
}

// Envoie une notification à l'email administrateur configuré. Ne lève jamais
// d'erreur : une notification qui échoue ne doit pas casser le flux métier
// (webhook de paiement, hook d'inscription, etc.).
export async function notifyAdmin(subject: string, html: string): Promise<void> {
  const to = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!to) return;
  await sendEmail({ to, subject, html });
}

export function moneyXOF(value: number): string {
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value)} XOF`;
}
