// Publicité carrousel Meta : plusieurs images (2 à 10 cartes) dans une même annonce.
export const MAX_CAROUSEL_EXTRA_IMAGES = 9; // + l'image principale = 10 cartes, le maximum de Meta
export const MIN_CAROUSEL_CARDS = 2;

/** Nettoie une liste d'URL de carrousel : https uniquement, sans doublon, 9 images supplémentaires au plus. */
export function parseCarouselUrls(value: unknown, mainUrl?: string | null): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>(mainUrl ? [mainUrl.trim()] : []);
  const urls: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const url = item.trim();
    if (!url.startsWith("https://") || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= MAX_CAROUSEL_EXTRA_IMAGES) break;
  }
  return urls;
}

export type CarouselCard = { url: string; hash?: string };

/**
 * `object_story_spec` d'une annonce carrousel : une carte par image, même lien, même titre et même bouton.
 * `withTopLevelCallToAction` ajoute aussi le bouton au niveau de l'annonce (link_data.call_to_action) :
 * sans lui, le bouton n'existe que sur chaque carte et Ads Manager n'affiche aucun bouton choisi pour l'annonce.
 */
export function buildCarouselObjectStorySpec(input: { pageId: string; link: string; message: string; headline: string; callToAction: string; cards: CarouselCard[]; withTopLevelCallToAction?: boolean }) {
  return {
    page_id: input.pageId,
    link_data: {
      link: input.link,
      message: input.message,
      ...(input.withTopLevelCallToAction ? { call_to_action: { type: input.callToAction, value: { link: input.link } } } : {}),
      // Meta ordonne les cartes lui-même selon leurs performances ; on garde l'ordre choisi par l'utilisateur.
      multi_share_optimized: false,
      multi_share_end_card: false,
      child_attachments: input.cards.map((card) => ({
        link: input.link,
        name: input.headline,
        ...(card.hash ? { image_hash: card.hash } : { picture: card.url }),
        call_to_action: { type: input.callToAction, value: { link: input.link } },
      })),
    },
  };
}
