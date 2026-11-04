export type StoreConnectionReminderLocale = "fr" | "en";

export function storeConnectionReminderCopy(
  locale: StoreConnectionReminderLocale,
  name: string,
  dashboardUrl: string,
) {
  const safeName = name.trim() || (locale === "fr" ? "à toi" : "there");
  if (locale === "en") {
    return {
      subject: "Your first step is underway — connect your Chariow store",
      text: `Hi ${safeName},\n\nYour first step toward managing your store better has begun. One step is still missing: connect your Chariow store to continue.\n\nOpen your Vendeo account: ${dashboardUrl}\n\nThe Vendeo team`,
      html: `<p>Hi ${escapeHtml(safeName)},</p><p>Your first step toward managing your store better has begun. One step is still missing: connect your Chariow store to continue.</p><p><a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#111827;color:#fff;text-decoration:none;font-weight:600">Connect my store</a></p><p>The Vendeo team</p>`,
    };
  }
  return {
    subject: "Ton premier pas est lancé — connecte ta boutique Chariow",
    text: `Bonjour ${safeName},\n\nTon premier pas pour mieux gérer ta boutique vient de commencer. Il manque encore une étape pour continuer : connecter ta boutique Chariow.\n\nOuvre ton compte Vendeo : ${dashboardUrl}\n\nL’équipe Vendeo`,
    html: `<p>Bonjour ${escapeHtml(safeName)},</p><p>Ton premier pas pour mieux gérer ta boutique vient de commencer. Il manque encore une étape pour continuer : connecter ta boutique Chariow.</p><p><a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#111827;color:#fff;text-decoration:none;font-weight:600">Connecter ma boutique</a></p><p>L’équipe Vendeo</p>`,
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}
