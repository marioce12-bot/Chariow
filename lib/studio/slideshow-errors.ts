export function slideshowPublicFailure(locale?: string | null) {
  return locale === "en"
    ? "The slideshow could not be created. Check your history before trying again."
    : "Le diaporama n’a pas pu être créé. Consultez l’historique avant de réessayer.";
}

export type SlideshowDescriptionRequirements = {
  duration: number;
  requiredWords: number;
  missingWords: number;
  wordCount?: number;
};

export function slideshowStoryboardDetailsMessage(locale?: string | null) {
  return locale === "en"
    ? "The product description in your store does not contain enough distinct information to prepare this slideshow. Update it in your store, then come back and click “Retry”. No images were generated and no credits were used."
    : "La description du produit dans ta boutique ne contient pas assez d'informations distinctes pour préparer ce diaporama. Mets-la à jour dans ta boutique, puis reviens ici et appuie sur « Réessayer ». Aucune image n'a été générée et aucun crédit n'a été consommé.";
}

function validDescriptionRequirements(value: unknown): SlideshowDescriptionRequirements | null {
  if (!value || typeof value !== "object") return null;
  const fields = value as Record<string, unknown>;
  if (![25, 30, 40].includes(fields.duration as number)) return null;
  if (!Number.isInteger(fields.requiredWords) || (fields.requiredWords as number) <= 0 || (fields.requiredWords as number) > 1_000) return null;
  if (!Number.isInteger(fields.missingWords) || (fields.missingWords as number) < 0 || (fields.missingWords as number) > 1_000) return null;
  if (fields.wordCount !== undefined && (!Number.isInteger(fields.wordCount) || (fields.wordCount as number) < 0 || (fields.wordCount as number) > 10_000)) return null;
  return {
    duration: fields.duration as number,
    requiredWords: fields.requiredWords as number,
    missingWords: fields.missingWords as number,
    ...(typeof fields.wordCount === "number" ? { wordCount: fields.wordCount } : {}),
  };
}

export function slideshowDescriptionTooShortMessage(value: unknown, locale?: string | null) {
  const requirements = validDescriptionRequirements(value);
  if (!requirements || requirements.missingWords === 0) return slideshowStoryboardDetailsMessage(locale);
  const { duration, requiredWords, missingWords } = requirements;
  return locale === "en"
    ? `The description of this product in your store is too short for a ${duration}-second voiceover. It needs about ${requiredWords} words describing the product (what it contains, what it is for, and who it is for); it is missing about ${missingWords}. Complete the description in your store, then come back here and click “Retry”. No images were generated and no credits were used.`
    : `La description de ce produit dans ta boutique est trop courte pour une voix off de ${duration} secondes. Il faut environ ${requiredWords} mots décrivant le produit (ce qu'il contient, à quoi il sert, pour qui) ; il en manque environ ${missingWords}. Complète la description dans ta boutique, puis reviens ici et appuie sur « Réessayer ». Aucune image n'a été générée et aucun crédit n'a été consommé.`;
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
export function publicSlideshowError(
  message: unknown,
  locale?: string | null,
  errorCode?: string | null,
  requirements?: unknown,
) {
  if (errorCode === "INSUFFICIENT_PRODUCT_DETAILS") {
    return slideshowDescriptionTooShortMessage(requirements, locale);
  }
  if (errorCode === "SLIDESHOW_VOICE_RETRYABLE") return locale === "en" ? VOICE_RETRYABLE.en : VOICE_RETRYABLE.fr;
  if (errorCode === "SLIDESHOW_VOICE_UNCERTAIN") return locale === "en" ? VOICE_UNCERTAIN.en : VOICE_UNCERTAIN.fr;
  if (typeof message !== "string") return slideshowPublicFailure(locale);
  const text = message.trim();
  if (/^(Insufficient balance: this slideshow costs \d+ Studio credits, you have \d+\. Top up before creating\.|Solde insuffisant : ce diaporama coûte \d+ crédits Studio, il te reste \d+\. Recharge tes crédits avant de créer\.)$/.test(text)) return text;
  if (/^(Trop de demandes\. Patiente une minute\.|Paramètres de diaporama invalides\.|Diaporama indisponible dans cet environnement\.)$/.test(text)) return text;
  return slideshowPublicFailure(locale);
}
