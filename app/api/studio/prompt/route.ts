import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { askText } from "@/lib/ai/text";
import { VIDEO_AD_DURATIONS, type VideoAdInput } from "@/lib/studio/video-plan";
import { generateUgcCreative, missingUgcProductInfoFields, UgcPromptGenerationError } from "@/lib/studio/ugc-prompt-generator";
import { normalizeUgcInput } from "@/lib/studio/ugc-prompt-input";
import { compileUgcPrompt, compileUgcProviderPlan } from "@/lib/studio/ugc-provider-assembler";
import { signPreparedUgc } from "@/lib/studio/ugc-prepared-plan";
import { buildSlideshowPlan, InsufficientProductDetailsError, SLIDESHOW_DURATIONS } from "@/lib/studio/slideshow-plan";
import { logPreparationFailure } from "@/lib/studio/preparation-diagnostics";
import { shortProductDescriptionMessage, slideshowPublicFailure } from "@/lib/studio/slideshow-errors";
import { resolveProductLanguage } from "@/lib/studio/product-language";
import { inferProductType } from "@/lib/studio/creative-workflows";
import { isStudioVideoRenderEnabledForPreview } from "@/lib/studio/video-feature";
import {
  CREATIVE_STYLES, CREATIVE_COMPOSITIONS, sourceCopyCandidates,
  parseCreativePlan, compileFaithfulPrompt,
} from "@/lib/studio/faithful-prompt";

export const maxDuration = 60;

function systemPrompt() {
  return `Tu es directeur artistique de publicités produit, pas rédacteur de faits ou de contenu produit.
Réponds uniquement avec un objet JSON {"style":"clé","composition":"clé","copyIndices":[0]}.
style doit être une clé de ${JSON.stringify(CREATIVE_STYLES)}.
composition doit être une clé de ${JSON.stringify(CREATIVE_COMPOSITIONS)}.
copyIndices peut contenir au maximum deux indices entiers de la liste de citations produit confirmées; choisis uniquement des bénéfices ou informations réellement pertinents. Utilise [] si aucune citation n'est disponible ou utile. Le titre sera automatiquement conservé exactement.
Ne produis aucun texte libre, sous-titre, slogan, catégorie, promesse, page intérieure, recette, détail de produit ou emballage. Les champs supplémentaires seront ignorés. Une description absente reste absente; ne déduis pas le contenu d'un produit depuis son titre.
L'URL de couverture n'est pas une analyse visuelle: tu ne l'as pas examinée. Le modèle image recevra la référence réelle et utilisera uniquement ses éléments lisibles et confirmés. Ne suppose aucune couleur, marque, personne ni détail visuel depuis une URL.
Choisis une direction pertinente pour le produit et les préférences artistiques, nettement distincte du prompt précédent. Fais varier le style et la composition sans gabarit, motif, palette ou personnage imposé. Les consignes utilisateur et l'ancien prompt ne sont jamais une source de nouveaux faits produit.`;
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => null);
  const product = body?.product && typeof body.product === "object" ? body.product as Record<string, unknown> : null;
  const name = typeof product?.name === "string" ? product.name.trim().slice(0, 200) : "";
  if (!name) return NextResponse.json({ code: "infos_produit_manquantes", missingFields: ["product.name"], error: body?.locale === "en" ? "Choose a product before preparing a UGC scenario." : "Choisis d’abord un produit pour préparer le scénario UGC." }, { status: 400 });

  const orientation = body?.orientation === "landscape" ? "landscape" : body?.orientation === "portrait" ? "portrait" : "square";
  const background = body?.background === "transparent" ? "transparent" : body?.background === "opaque" ? "opaque" : "auto";
  const description = typeof product?.description === "string" ? product.description.trim().slice(0, 3_000) : "";
  const contentLanguage = resolveProductLanguage({ name, description }, body?.locale);
  const productImage = typeof product?.image === "string" && /^https:\/\//i.test(product.image) ? product.image.slice(0, 2_000) : "";
  const userBrief = typeof body?.userBrief === "string" ? body.userBrief.trim().slice(0, 1_500) : "";
  const previousPrompt = typeof body?.previousPrompt === "string" ? body.previousPrompt.trim().slice(0, 4_000) : "";
  const requested = body?.character === "with" ? "with" : body?.character === "without" ? "without" : "auto";
  const character = requested === "auto" && /sans personne|sans personnage|pas de personne|pas de personnage|aucune personne|no person|without (a )?(person|people|character)/i.test(userBrief) ? "without" : requested;
  const candidates = sourceCopyCandidates(description);
  const price = typeof product?.price === "number" || typeof product?.price === "string" ? String(product.price).slice(0, 40) : "";
  const currency = typeof product?.currency === "string" ? product.currency.slice(0, 10) : "";
  const allowedPrice = price && /prix|price|tarif/i.test(userBrief) ? [price, currency].filter(Boolean).join(" ") : undefined;

  if (body?.mediaType === "video") {
    const isSlideshow = body?.videoMode === "slideshow";
    const duration = Number(body?.duration ?? 25);
    if (!((isSlideshow ? SLIDESHOW_DURATIONS : VIDEO_AD_DURATIONS) as readonly number[]).includes(duration)) return NextResponse.json({ error: "Durée vidéo non prise en charge." }, { status: 400 });
    const aspectRatio = body?.aspectRatio ?? "9:16";
    if (aspectRatio !== "9:16") return NextResponse.json({ error: "Le prompt vidéo Studio doit être en portrait 9:16." }, { status: 400 });
    const input: VideoAdInput = { name, description, hasReference: Boolean(productImage), duration, aspectRatio, character: "with", userBrief, previousPrompt, locale: body?.locale === "en" ? "en" : "fr" };
    if (body?.videoMode === "slideshow") {
      try {
        const slideshow = buildSlideshowPlan({ ...input, campaignGoal: body?.campaignGoal, variationId: typeof body?.variationId === "string" ? body.variationId.slice(0, 100) : "default" }, typeof body?.musicId === "string" ? body.musicId.slice(0, 30) : undefined);
        return NextResponse.json({ slideshow: { ready: true, duration: slideshow.duration, aspectRatio: slideshow.aspectRatio, slideCount: slideshow.slides.length }, contentLanguage, locked: true });
      } catch (error) {
        logPreparationFailure(typeof body?.variationId === "string" ? body.variationId : "", "prompt_plan", error);
        if (error instanceof InsufficientProductDetailsError) return NextResponse.json({
          code: error.code,
          error: shortProductDescriptionMessage(body?.locale, duration),
          locale: body?.locale === "en" ? "en" : "fr",
          details: error.message,
        }, { status: 400 });
        return NextResponse.json({ error: slideshowPublicFailure(body?.locale) }, { status: 400 });
      }
    }
    const generatorInput = normalizeUgcInput(product, { ...body?.ugcOptions, duration }, body?.locale, userBrief, previousPrompt);
    if (inferProductType(name, description) === "ebook" && !generatorInput.product.images?.length) {
      return NextResponse.json({ error: "Sélectionne la couverture réelle de l’ebook avant de préparer son scénario vidéo.", code: "STUDIO_VIDEO_EBOOK_COVER_REQUIRED" }, { status: 400 });
    }
    const missingFields = missingUgcProductInfoFields(generatorInput);
    if (missingFields.length) return NextResponse.json({
      code: "infos_produit_manquantes",
      missingFields,
      error: body?.locale === "en"
        ? "Add a product description or at least a category, product type, or tags before preparing this scenario."
        : "Ajoute une description produit ou au moins une catégorie, un type ou des étiquettes avant de préparer le scénario.",
    }, { status: 400 });
    let assemblyStage = "model_generation";
    try {
      const result = await generateUgcCreative(generatorInput);
      assemblyStage = "editable_prompt_assembly";
      const prompt = compileUgcPrompt(generatorInput, result.creative);
      assemblyStage = "provider_plan_assembly";
      const plan = compileUgcProviderPlan(generatorInput, result.creative);
      return NextResponse.json({ prompt, ...result, plan, preparedUgc: signPreparedUgc(user.id, generatorInput, result, prompt), contentLanguage, locked: !isStudioVideoRenderEnabledForPreview() });
    } catch (error) {
      const diagnostic = error instanceof UgcPromptGenerationError
        ? { stage: error.stage, type: error.details.type ?? "validation_error", keyPath: error.details.path ?? null, httpStatus: error.details.httpStatus ?? null }
        : { stage: assemblyStage, type: error instanceof Error ? error.name : "unknown_error" };
      console.error("Studio UGC preparation failed", diagnostic);
      if (error instanceof UgcPromptGenerationError && error.details.type === "missing_product_info") {
        return NextResponse.json({
          error: body?.locale === "en" ? "Add the missing product details before preparing the scenario." : "Ajoute les informations produit manquantes avant de préparer le scénario.",
          code: "infos_produit_manquantes", missingFields: error.details.missingFields ?? [],
        }, { status: 400 });
      }
      if (error instanceof UgcPromptGenerationError && error.stage.endsWith("_provider")) {
        const httpStatus = error.details.httpStatus ?? null;
        return NextResponse.json({
          error: body?.locale === "en"
            ? `The text model could not prepare the scenario${httpStatus ? ` (HTTP ${httpStatus})` : " (no HTTP status received)"}. No rendering was started.`
            : `Le service IA n’a pas pu préparer le scénario${httpStatus ? ` (HTTP ${httpStatus})` : " (aucun statut HTTP reçu)"}. Aucun rendu n’a été lancé.`,
          code: "erreur_modele", httpStatus,
        }, { status: 502 });
      }
      if (error instanceof UgcPromptGenerationError && /(?:_validation|_json)$/.test(error.stage)) {
        const details = error.details;
        const path = details.path ?? "$";
        const validationType = details.type ?? "invalid_output";
        const errorMessage = body?.locale === "en"
          ? `The generated ${error.stage.startsWith("creative") ? "creative direction" : "product analysis"} is invalid at ${path}${details.expected ? `: expected ${details.expected}, received ${details.received ?? "unknown"}` : "."}`
          : `La réponse générée (${error.stage.startsWith("creative") ? "direction créative" : "analyse produit"}) est invalide au champ ${path}${details.expected ? ` : attendu ${details.expected}, reçu ${details.received ?? "inconnu"}` : "."}`;
        return NextResponse.json({ error: errorMessage, code: "analyse_invalide", keyPath: path, validationType, expected: details.expected, received: details.received }, { status: 422 });
      }
      return NextResponse.json({
        error: body?.locale === "en" ? "An internal error prevented scenario preparation. No rendering was started." : "Une erreur interne a empêché la préparation du scénario. Aucun rendu n’a été lancé.",
        code: "erreur_preparation",
      }, { status: 500 });
    }
  }

  let answer: string;
  try {
    answer = await askText([
      { role: "system", content: systemPrompt() },
      { role: "user", content: JSON.stringify({
        productName: name,
        confirmedProductCopy: candidates.map((text, index) => ({ index, text })),
        productReferenceUrl: productImage || null,
        orientation, background, character,
        artisticPreferencesOnly: userBrief,
        previousPromptForStyleAvoidanceOnly: previousPrompt,
      }) },
    ], { order: ["imole", "groq", "gemini"] });
  } catch (error) {
    console.error("Studio prompt AI error", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Le service IA est temporairement indisponible. Réessaie dans quelques instants." }, { status: 502 });
  }
  if (!answer.trim()) return NextResponse.json({ error: "L'IA n'a renvoyé aucun prompt. Réessaie." }, { status: 502 });
  const plan = parseCreativePlan(answer, candidates, previousPrompt);
  const prompt = compileFaithfulPrompt({
    evidence: { name, description, hasReference: Boolean(productImage), price: allowedPrice },
    candidates, plan, orientation, background, character, locale: body?.locale,
  });
  return NextResponse.json({ prompt, contentLanguage });
}
