import { assertSlideshowPlan, buildSlideshowPlan, MAX_SLIDESHOW_IMAGES, MIN_SLIDESHOW_IMAGES } from "@/lib/studio/slideshow-plan";

/** Recompile instead of trusting the client prompt, count, or slide index. No I/O. */
export function validateSlideshowImageRequest(value: unknown, environment: string | undefined) {
  if (environment !== "preview") throw new Error("Le diaporama est disponible en Preview uniquement.");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Storyboard requis.");
  const request = value as Record<string, unknown>;
  if (!Number.isInteger(request.imageCount) || (request.imageCount as number) < MIN_SLIDESHOW_IMAGES || (request.imageCount as number) > MAX_SLIDESHOW_IMAGES) throw new Error("Le diaporama doit contenir exactement 5 images.");
  const product = request.product as Record<string, unknown> | null;
  if (!product || typeof product.name !== "string" || !product.name.trim()) throw new Error("Produit requis.");
  const referenceUrl = typeof product.image === "string" && /^https:\/\//i.test(product.image) ? product.image.slice(0, 2000) : "";
  const plan = buildSlideshowPlan({
    name: product.name.slice(0, 200), description: typeof product.description === "string" ? product.description.trim().slice(0, 3000) : "",
    hasReference: Boolean(referenceUrl), duration: Number(request.duration), aspectRatio: String(request.aspectRatio), character: "without",
    locale: request.locale === "en" ? "en" : "fr", campaignGoal: request.campaignGoal,
  });
  assertSlideshowPlan(plan);
  if (request.imageCount !== plan.slides.length || !Number.isInteger(request.slideIndex) || (request.slideIndex as number) < 0 || (request.slideIndex as number) >= plan.slides.length) throw new Error("Le storyboard a changé. Prépare à nouveau les prompts.");
  return { prompt: plan.slides[request.slideIndex as number].prompt, referenceUrls: referenceUrl ? [referenceUrl] : [], orientation: plan.aspectRatio === "9:16" ? "portrait" as const : plan.aspectRatio === "16:9" ? "landscape" as const : "square" as const };
}
