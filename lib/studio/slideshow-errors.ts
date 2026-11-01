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
const VOICE_REQUIRED = {
  fr: "La voix off est obligatoire pour chaque diaporama. Cette action a été arrêtée sans nouveau visuel ni nouveau crédit ; les visuels déjà créés sont conservés.",
  en: "Every slideshow requires a voiceover. This action stopped without creating new images or consuming new credits; existing images are preserved.",
};
const VOICE_UNAVAILABLE = {
  fr: "La voix off obligatoire n’est pas disponible actuellement. Aucun nouveau visuel ni crédit n’a été consommé ; les visuels existants sont conservés.",
  en: "The required voiceover is currently unavailable. No new images or credits were used; existing images are preserved.",
};
/** Preserve only known user-actionable public errors; never echo provider/runtime diagnostics. */
export function publicSlideshowError(message: unknown, locale?: string | null, errorCode?: string | null) {
  if (errorCode === "SLIDESHOW_VOICE_RETRYABLE") return locale === "en" ? VOICE_RETRYABLE.en : VOICE_RETRYABLE.fr;
  if (errorCode === "SLIDESHOW_VOICE_UNCERTAIN") return locale === "en" ? VOICE_UNCERTAIN.en : VOICE_UNCERTAIN.fr;
  if (errorCode === "SLIDESHOW_VOICE_REQUIRED") return locale === "en" ? VOICE_REQUIRED.en : VOICE_REQUIRED.fr;
  if (errorCode === "SLIDESHOW_VOICE_UNAVAILABLE") return locale === "en" ? VOICE_UNAVAILABLE.en : VOICE_UNAVAILABLE.fr;
  if (typeof message !== "string") return slideshowPublicFailure(locale);
  const text = message.trim();
  if (/^The description is too short for a (25|30|40)-second narration\. Add product details; no images were generated and no credits were consumed\.$/.test(text) || /^La description est trop courte pour une narration de (25|30|40) s\. Ajoute des phrases décrivant le produit ; aucune image n’a été générée et aucun crédit n’a été consommé\.$/.test(text)) return text;
  if (/^Add product details below, then click Retry\.$/.test(text) || /^Complète la description ci-dessous, puis appuie sur Relancer\.$/.test(text)) return text;
  if (/^(Insufficient balance: this slideshow costs \d+ Studio credits, you have \d+\. Top up before creating\.|Solde insuffisant : ce diaporama coûte \d+ crédits Studio, il te reste \d+\. Recharge tes crédits avant de créer\.)$/.test(text)) return text;
  if (/^(Trop de demandes\. Patiente une minute\.|Paramètres de diaporama invalides\.|Diaporama indisponible dans cet environnement\.)$/.test(text)) return text;
  return slideshowPublicFailure(locale);
}
