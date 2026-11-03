import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { askText } from "@/lib/ai/text";
import { VIDEO_AD_DURATIONS, type VideoAdInput } from "@/lib/studio/video-plan";
import { generateUgcPrompt, missingUgcProductInfoFields, UgcPromptGenerationError } from "@/lib/studio/ugc-prompt-generator";
import { normalizeUgcInput } from "@/lib/studio/ugc-prompt-input";
import { compileUgcPrompt, compileUgcProviderPlan } from "@/lib/studio/ugc-provider-assembler";
import { signPreparedUgc } from "@/lib/studio/ugc-prepared-plan";
import { buildSlideshowPlan, InsufficientProductDetailsError, SLIDESHOW_DURATIONS } from "@/lib/studio/slideshow-plan";
import { logPreparationFailure } from "@/lib/studio/preparation-diagnostics";
import { shortProductDescriptionMessage, slideshowPublicFailure } from "@/lib/studio/slideshow-errors";
import { resolveProductLanguage } from "@/lib/studio/product-language";
import { inferProductType } from "@/lib/studio/creative-workflows";
import { isStudioVideoEnabled } from "@/lib/studio/video-feature";
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
  const userBrief = typeof body?.userBrief === "string" ? body.userBrief.trim().slice(0, 4_000) : "";
  const previousPrompt = typeof body?.previousPrompt === "string" ? body.previousPrompt.trim().slice(0, 4_000) : "";
  const requested = body?.character === "with" ? "with" : body?.character === "without" ? "without" : "auto";
  const character = requested === "auto" && /sans personne|sans personnage|pas de personne|pas de personnage|aucune personne|no person|without (a )?(person|people|character)/i.test(userBrief) ? "without" : requested;
  const candidates = sourceCopyCandidates(description);
  const price = typeof product?.price === "number" || typeof product?.price === "string" ? String(product.price).slice(0, 40) : "";
  const currency = typeof product?.currency === "string" ? product.currency.slice(0, 10) : "";
  const allowedPrice = price && /prix|price|tarif/i.test(userBrief) ? [price, currency].filter(Boolean).join(" ") : undefined;

  if (body?.mediaType === "video") {
    const isSlideshow = body?.videoMode === "slideshow";
    const allowedDurations = isSlideshow ? SLIDESHOW_DURATIONS : VIDEO_AD_DURATIONS;
    const duration = Number(body?.duration ?? (isSlideshow ? 25 : 10));
    if (!(allowedDurations as readonly number[]).includes(duration)) {
      const keyPath = isSlideshow ? "duration" : "options.duration";
      const error = body?.locale === "en"
        ? `Invalid ${keyPath}: allowed durations are ${allowedDurations.join(", ")} seconds.`
        : `Durée invalide pour ${keyPath} : valeurs autorisées ${allowedDurations.join(", ")} secondes.`;
      return NextResponse.json({ error, code: "invalid_input", keyPath, supported: allowedDurations }, { status: 400 });
    }
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
        ? "Add meaningful product details; a generic type or category alone is not enough to identify the product theme."
        : "Ajoute des informations produit suffisamment précises : un type ou une catégorie générique ne suffit pas à identifier le thème.",
    }, { status: 400 });
    let assemblyStage = "model_generation";
    try {
      const narrative = await generateUgcPrompt(generatorInput);
      assemblyStage = "editable_prompt_assembly";
      const prompt = compileUgcPrompt(generatorInput, narrative);
      assemblyStage = "provider_plan_assembly";
      const plan = compileUgcProviderPlan(generatorInput, narrative);
      return NextResponse.json({ prompt, plan, preparedUgc: signPreparedUgc(user.id, generatorInput, narrative, prompt), contentLanguage, locked: !(await isStudioVideoEnabled()) });
    } catch (error) {
      const diagnostic = error instanceof UgcPromptGenerationError
        ? {
          stage: error.stage, type: error.details.type, keyPath: error.details.path ?? null,
          httpStatus: error.details.httpStatus ?? null,
          upstreamCode: error.details.upstreamCode ?? null,
          upstreamMessage: error.details.upstreamMessage ?? null,
          upstreamProvider: error.details.upstreamProvider ?? null,
          retryAfter: error.details.retryAfter ?? null,
        }
        : { stage: assemblyStage, type: error instanceof Error ? error.name : "unknown_error", keyPath: null, httpStatus: null };
      console.error("Studio UGC preparation failed", diagnostic);
      if (error instanceof UgcPromptGenerationError && error.stage === "input") {
        return NextResponse.json({
          error: error.message,
          code: error.details.type ?? "invalid_input",
          keyPath: error.details.path ?? null,
        }, { status: 400 });
      }
      const failureRule = error instanceof UgcPromptGenerationError ? error.details.type : "prompt_assembly_error";
      const ugcError = error instanceof UgcPromptGenerationError ? error : null;
      const locale = body?.locale === "en" ? "en" : "fr";
      const waitSeconds = ugcError?.details.retryAfter && /^\d+$/.test(ugcError.details.retryAfter)
        ? Math.max(1, Math.min(3600, Number(ugcError.details.retryAfter))) : null;
      let publicError = locale === "en" ? "The scenario could not be generated. Please try again." : "Le scénario n’a pas pu être généré, réessaie.";
      if (failureRule === "provider_rate_limited") publicError = locale === "en"
        ? `OpenRouter temporarily rate-limited this model. Wait${waitSeconds ? ` ${waitSeconds} seconds` : " a minute"} and try again; if it continues, check the model's request limits.`
        : `OpenRouter limite temporairement les requêtes de ce modèle. Attends${waitSeconds ? ` ${waitSeconds} secondes` : " une minute"} puis réessaie; si ça continue, vérifie les limites de requêtes du modèle.`;
      else if (failureRule === "provider_credits_required") publicError = locale === "en"
        ? "OpenRouter reports a credit or payment issue. Check the account balance and billing status."
        : "OpenRouter signale un problème de crédits ou de paiement. Vérifie le solde et l’état de facturation du compte.";
      else if (failureRule === "provider_auth_error") publicError = locale === "en"
        ? "OpenRouter rejected the configured API key. Check the Production key and its permissions."
        : "OpenRouter refuse la clé API configurée. Vérifie la clé utilisée en Production et ses autorisations.";
      else if (failureRule === "wrong_beat_count") {
        const expected = duration === 10 ? 3 : duration === 15 ? 4 : 5;
        publicError = locale === "en"
          ? `The AI returned the wrong number of scenes. It must return exactly ${expected} for ${duration} seconds; regenerate the prompt.`
          : `L’IA a renvoyé un mauvais nombre de temps. Il en faut exactement ${expected} pour ${duration} secondes; régénère le prompt.`;
      } else if (failureRule === "word_count_mismatch") publicError = locale === "en"
        ? "The AI's dialogue did not fit the required duration. Regenerate the prompt."
        : "Les dialogues générés ne respectaient pas le nombre de mots prévu pour cette durée. Régénère le prompt.";
      const status = ugcError?.details.type === "provider_timeout" ? 504
        : ugcError?.details.httpStatus === 429 ? 429
          : 502;
      return NextResponse.json({
        error: publicError,
        code: "ugc_prompt_generation_failed",
        failureRule,
        retryAfterSeconds: waitSeconds,
      }, { status });
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
