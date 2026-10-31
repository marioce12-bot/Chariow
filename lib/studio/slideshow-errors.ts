export function slideshowPublicFailure(locale?: string | null) {
  return locale === "en"
    ? "The montage did not finish. Your completed images are kept; follow the recovery action shown here before retrying."
    : "Le montage n’a pas abouti. Tes visuels terminés sont conservés ; suis l’action indiquée ici pour le terminer.";
}
export type VoiceSourceRetryInfo = { availableWords: number; requiredWords: number; maximumWords: number; providerAttempts: number };
/** Exact legacy narration-budget diagnostic; it was emitted only while building a measured retry plan. */
export function parseVoiceSourceRetryInfo(message: unknown): VoiceSourceRetryInfo | null {
  if (typeof message !== "string") return null;
  const french = message.match(/^Source insuffisante pour une narration couvrant (25|30|40)s \((\d+) mots disponibles, (\d+) requis\); TTS non lancé\.$/);
  const english = message.match(/^Insufficient source for a narration covering (25|30|40)s \((\d+) words available, (\d+) required\); TTS not sent\.$/);
  const match = french ?? english;
  if (!match) return null;
  const availableWords = Number(match[2]), requiredWords = Number(match[3]);
  if (!Number.isSafeInteger(availableWords) || !Number.isSafeInteger(requiredWords) || availableWords < 0 || requiredWords <= availableWords) return null;
  // Reconstruct the measured window used by the worker (1.02–1.14 times the
  // target speech pace). The legacy error persisted only its lower bound.
  const maximumWords = Math.max(requiredWords, Math.floor(requiredWords / 1.02 * 1.14));
  return { availableWords, requiredWords, maximumWords, providerAttempts: 1 };
}
const VOICE_RETRYABLE = {
  fr: "Le service vocal a refusé la demande avant de produire l’audio. Les visuels déjà créés sont conservés ; tu peux relancer sans les recréer.",
  en: "The voice service refused the request before producing audio. Your completed images are preserved; you can retry without recreating them.",
};
const VOICE_UNCERTAIN = {
  fr: "Le résultat de la narration n’a pas pu être vérifié. Tes visuels sont conservés et aucune nouvelle demande vocale ne sera lancée automatiquement.",
  en: "The narration result could not be verified. Your visuals are preserved, and no new voice request will be made automatically.",
};
const VOICE_SOURCE_INSUFFICIENT = {
  fr: "La description du produit dans ta boutique est un peu courte pour ajuster la narration à la durée choisie. Ajoute quelques faits précis ci-dessous ; le texte servira uniquement à ce diaporama, les visuels restent conservés.",
  en: "The product description is a little short to fit the narration to the selected duration. Add a few precise facts below; they will be used only for this slideshow, and your completed visuals are kept.",
};
/** Preserve only known user-actionable public errors; never echo provider/runtime diagnostics. */
export function publicSlideshowError(message: unknown, locale?: string | null, errorCode?: string | null) {
  if (errorCode === "SLIDESHOW_VOICE_SOURCE_INSUFFICIENT") return locale === "en" ? VOICE_SOURCE_INSUFFICIENT.en : VOICE_SOURCE_INSUFFICIENT.fr;
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
