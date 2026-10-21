import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateStudioImage } from "@/lib/studio/image-generation";
import { buildSlideshowPlan } from "@/lib/studio/slideshow-plan";
import {
  preflightSlideshow,
  renderSlideshow,
} from "@/lib/studio/slideshow-server";
import { signedStudioUrl } from "@/lib/studio/media";

export const TASK_TYPE = "studio_background_task";
export type TaskMetadata = {
  type: typeof TASK_TYPE;
  taskKind: "image" | "slideshow";
  input: any;
  revision: number;
  phase: "queued" | "running" | "completed" | "failed";
  message: string;
  progress: number;
  updatedAt: string;
  images: Array<{ id: string; url: string }>;
  result?: any;
  error?: string;
};
export function taskToken(id: string, revision: number) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Configuration serveur indisponible.");
  return createHmac("sha256", secret)
    .update(`studio-task:${id}:${revision}`)
    .digest("hex");
}
export function validTaskToken(id: string, revision: number, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  return timingSafeEqual(
    Buffer.from(taskToken(id, revision)),
    Buffer.from(token),
  );
}
export function workerOrigin() {
  // Never forward an internal credential to a client-controlled Host header.
  return process.env.VERCEL_ENV === "production"
    ? "https://www.vendeo-studio.site"
    : `https://${process.env.VERCEL_URL}`;
}
export async function dispatchTask(id: string, revision: number) {
  const response = await fetch(`${workerOrigin()}/api/studio/tasks/worker`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-studio-task-token": taskToken(id, revision),
    },
    body: JSON.stringify({ id, revision }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok)
    throw new Error(
      "Le suivi serveur n’a pas pu continuer. Aucune étape payante n’est relancée.",
    );
}
export async function publicTask(row: any) {
  const metadata = row.metadata as TaskMetadata;
  let result = metadata.result;
  let images = metadata.images ?? [];
  if (images.length) {
    const { data } = await createAdminClient()
      .from("studio_generations")
      .select("id,storage_path")
      .in(
        "id",
        images.map((image) => image.id),
      )
      .eq("user_id", row.user_id)
      .limit(5);
    images = await Promise.all(
      images.map(async (image) => {
        const saved = data?.find((item: any) => item.id === image.id);
        return saved?.storage_path
          ? { ...image, url: await signedStudioUrl(saved.storage_path) }
          : image;
      }),
    );
  }
  if (result?.generationId) {
    const { data } = await createAdminClient()
      .from("studio_generations")
      .select("storage_path,metadata")
      .eq("id", result.generationId)
      .eq("user_id", row.user_id)
      .maybeSingle();
    if (data?.storage_path) {
      const url = await signedStudioUrl(data.storage_path);
      result = {
        ...result,
        ...(metadata.taskKind === "image"
          ? { imageUrl: url }
          : { videoUrl: url, ...(data.metadata?.type === "slideshow" ? { musicId: data.metadata.musicId, attribution: data.metadata.attribution, duration: data.metadata.duration } : {}) }),
      };
    } else if (!data) result = null; // A deliberately deleted creation must not reappear.
  }
  // Provider work is never repeated after an uncertain timeout.
  const stale =
    row.status === "processing" &&
    Date.now() - Date.parse(metadata.updatedAt) > 7 * 60_000;
  return {
    id: row.id,
    kind: metadata.taskKind,
    status: stale ? "failed" : row.status,
    phase: metadata.phase,
    progress: metadata.progress,
    message: metadata.message,
    error: stale
      ? "Le suivi de cette génération a été interrompu. Consulte l’historique : aucune nouvelle génération n’a été lancée automatiquement."
      : metadata.error,
    images,
    result,
    createdAt: row.created_at,
  };
}
export async function failTask(
  id: string,
  error: unknown,
  expected?: { revision: number; phase: string },
) {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("studio_generations")
    .select("metadata,status")
    .eq("id", id)
    .maybeSingle();
  if (!row || row.status !== "processing") return;
  if (
    expected &&
    (row.metadata?.revision !== expected.revision ||
      row.metadata?.phase !== expected.phase)
  )
    return;
  const message =
    error instanceof Error ? error.message : "Génération interrompue.";
  await admin
    .from("studio_generations")
    .update({
      status: "failed",
      error: message,
      metadata: {
        ...row.metadata,
        phase: "failed",
        error: message,
        message,
        updatedAt: new Date().toISOString(),
      },
    })
    .eq("id", id)
    .eq("status", "processing")
    .eq("metadata->>revision", String(row.metadata.revision))
    .eq("metadata->>phase", row.metadata.phase);
}
export async function runTaskStep(id: string, revision: number) {
  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("studio_generations")
    .select("id,user_id,status,metadata")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (
    !row ||
    row.status !== "processing" ||
    row.metadata?.type !== TASK_TYPE ||
    row.metadata.phase !== "queued" ||
    row.metadata.revision !== revision
  )
    return;
  const meta = row.metadata as TaskMetadata;
  const claimed = {
    ...meta,
    phase: "running",
    updatedAt: new Date().toISOString(),
  };
  const claim = await admin
    .from("studio_generations")
    .update({ metadata: claimed })
    .eq("id", id)
    .eq("status", "processing")
    .eq("metadata->>phase", "queued")
    .eq("metadata->>revision", String(revision))
    .select("id");
  if (claim.error) throw claim.error;
  if (!claim.data?.length) return; // A duplicate worker must not reserve credits or call a provider.
  try {
    let result: any;
    let images = meta.images;
    if (meta.taskKind === "image") {
      const response = await generateStudioImage(row.user_id, meta.input);
      result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Génération impossible.");
    } else if (revision === 0) {
      await preflightSlideshow(meta.input.musicId);
    } else if (images.length < 5) {
      const { product, duration, campaignGoal, locale } = meta.input;
      const plan = buildSlideshowPlan({
        name: product.name,
        description: product.description || "",
        hasReference: Boolean(product.image),
        duration,
        aspectRatio: "9:16",
        character: "auto",
        userBrief: "",
        previousPrompt: "",
        locale,
        campaignGoal,
      });
      const slide = plan.slides[images.length];
      const response = await generateStudioImage(row.user_id, {
        prompt: slide.prompt,
        quality: "medium",
        resolution: "hd",
        orientation: "portrait",
        background: "opaque",
        referenceUrls: product.image ? [product.image] : [],
        slideshow: {
          product,
          duration,
          aspectRatio: "9:16",
          locale,
          campaignGoal,
          imageCount: 5,
          slideIndex: slide.index,
        },
      });
      const image = await response.json();
      if (!response.ok || !image.generationId || !image.imageUrl)
        throw new Error(
          image.error ||
            "Visuel incomplet. Consulte l’historique sans relancer les images.",
        );
      images = [...images, { id: image.generationId, url: image.imageUrl }];
    } else {
      result = await renderSlideshow(
        row.user_id,
        images.map((image) => image.id),
        meta.input.duration,
        meta.input.musicId,
      );
    }
    const complete = Boolean(result);
    const next: TaskMetadata = {
      ...meta,
      images,
      revision: revision + 1,
      phase: complete ? "completed" : "queued",
      progress: complete ? 100 : Math.min(95, 5 + images.length * 17),
      message: complete
        ? "Création prête."
        : images.length === 5
          ? "Montage du diaporama…"
          : `Génération du visuel ${images.length + 1}/5…`,
      updatedAt: new Date().toISOString(),
      ...(result ? { result } : {}),
    };
    const saved = await admin
      .from("studio_generations")
      .update({ status: complete ? "completed" : "processing", metadata: next })
      .eq("id", id)
      .eq("metadata->>phase", "running")
      .eq("metadata->>revision", String(revision));
    if (saved.error) throw saved.error;
    // Each step has its own server execution budget. Browser lifetime is irrelevant.
    if (!complete) {
      try {
        await dispatchTask(id, next.revision);
      } catch (error) {
        await failTask(id, error, { revision: next.revision, phase: "queued" });
      }
    }
  } catch (error) {
    await failTask(id, error, { revision, phase: "running" });
  }
}
