export function slideshowPublicFailure(locale?: string | null) {
  return locale === "en"
    ? "The slideshow could not be created. Check your history before trying again."
    : "Le diaporama n’a pas pu être créé. Consultez l’historique avant de réessayer.";
}
/** Preserve only known user-actionable public errors; never echo provider/runtime diagnostics. */
export function publicSlideshowError(message: unknown, locale?: string | null) {
  if (typeof message !== "string") return slideshowPublicFailure(locale);
  const text = message.trim();
  if (/^Add product details below, then click Retry\.$/.test(text) || /^Complète la description ci-dessous, puis appuie sur Relancer\.$/.test(text)) return text;
  if (/^(Insufficient balance: this slideshow costs \d+ Studio credits, you have \d+\. Top up before creating\.|Solde insuffisant : ce diaporama coûte \d+ crédits Studio, il te reste \d+\. Recharge tes crédits avant de créer\.)$/.test(text)) return text;
  if (/^(Trop de demandes\. Patiente une minute\.|Paramètres de diaporama invalides\.|Diaporama indisponible dans cet environnement\.)$/.test(text)) return text;
  return slideshowPublicFailure(locale);
}
