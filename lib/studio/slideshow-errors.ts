export function slideshowPublicFailure(locale?: string | null) {
  return locale === "en"
    ? "The slideshow could not be created. Check your history before trying again."
    : "Le diaporama n’a pas pu être créé. Consultez l’historique avant de réessayer.";
}
const VOICE_RETRYABLE = {
  fr: "Le service vocal a refusé la demande avant de produire l’audio. Les visuels déjà créés sont conservés ; tu peux relancer sans les recréer.",
  en: "The voice service refused the request before producing audio. Your completed images are preserved; you can retry without recreating them.",
};
const VOICE_UNCERTAIN = {
  fr: "Le résultat de la demande vocale n’a pas pu être confirmé. Pour éviter un doublon, la reprise est bloquée ; consulte l’historique avant toute nouvelle action.",
  en: "The voice request outcome could not be confirmed. To avoid a duplicate, resuming is blocked; check your history before taking further action.",
};
/** Preserve only known user-actionable public errors; never echo provider/runtime diagnostics. */
export function publicSlideshowError(message: unknown, locale?: string | null, errorCode?: string | null) {
  if (errorCode === "SLIDESHOW_VOICE_RETRYABLE") return locale === "en" ? VOICE_RETRYABLE.en : VOICE_RETRYABLE.fr;
  if (errorCode === "SLIDESHOW_VOICE_UNCERTAIN") return locale === "en" ? VOICE_UNCERTAIN.en : VOICE_UNCERTAIN.fr;
  if (typeof message !== "string") return slideshowPublicFailure(locale);
  const text = message.trim();
  if (/^The description is too short for a (25|30|40)-second narration\. Add product details; no images were generated and no credits were consumed\.$/.test(text) || /^La description est trop courte pour une narration de (25|30|40) s\. Ajoute des phrases décrivant le produit ; aucune image n’a été générée et aucun crédit n’a été consommé\.$/.test(text)) return text;
  if (/^Add product details below, then click Retry\.$/.test(text) || /^Complète la description ci-dessous, puis appuie sur Relancer\.$/.test(text)) return text;
  if (/^(Insufficient balance: this slideshow costs \d+ Studio credits, you have \d+\. Top up before creating\.|Solde insuffisant : ce diaporama coûte \d+ crédits Studio, il te reste \d+\. Recharge tes crédits avant de créer\.)$/.test(text)) return text;
  if (/^(Trop de demandes\. Patiente une minute\.|Paramètres de diaporama invalides\.|Diaporama indisponible dans cet environnement\.)$/.test(text)) return text;
  return slideshowPublicFailure(locale);
}
