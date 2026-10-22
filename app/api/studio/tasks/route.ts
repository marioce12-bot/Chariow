import { NextResponse, after } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveSubscription } from "@/lib/subscription/access";
import { rateLimit } from "@/lib/shop/rate-limit";
import { buildSlideshowPlan, InsufficientProductDetailsError, SLIDESHOW_DURATIONS } from "@/lib/studio/slideshow-plan";
import { assertSlideshowVoiceAllowed, buildSlideshowVoicePlan, slideshowVoiceAvailability } from "@/lib/studio/slideshow-voice";
import { isPreviewEnabled } from "@/lib/studio/slideshow-server";
import {
  TASK_TYPE,
  logTaskEvent,
  failTask,
  StudioTaskError,
  publicTask,
  runTaskStep,
  type TaskMetadata,
} from "@/lib/studio/background-tasks";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { data, error } = await createAdminClient()
    .from("studio_generations")
    .select("id,user_id,status,metadata,created_at")
    .eq("user_id", user.id)
    .eq("metadata->>type", TASK_TYPE)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error)
    return NextResponse.json({ error: "Suivi indisponible." }, { status: 503 });
  return NextResponse.json(
    { tasks: await Promise.all((data ?? []).map(publicTask)) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => null);
  if (
    !body ||
    typeof body.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      body.id,
    ) ||
    !["image", "slideshow"].includes(body.kind) ||
    !body.input ||
    JSON.stringify(body.input).length > 20_000
  )
    return NextResponse.json({ error: "Demande invalide." }, { status: 400 });
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("studio_generations")
    .select("id,user_id,status,metadata,created_at")
    .eq("id", body.id)
    .maybeSingle();
  if (existing) {
    if (existing.user_id !== user.id || existing.metadata?.type !== TASK_TYPE)
      return NextResponse.json(
        { error: "Demande indisponible." },
        { status: 409 },
      );
    return NextResponse.json({ task: await publicTask(existing) }); // Never dispatch a repeated POST.
  }
  if (
    body.kind === "slideshow" &&
    slideshowVoiceAvailability().voiceoverEnabled &&
    slideshowVoiceAvailability().available &&
    body.input.voiceover !== true
  )
    return NextResponse.json(
      {
        code: "STUDIO_CLIENT_UPDATE_REQUIRED",
        error: "Actualisez la page pour activer la narration vocale, puis relancez votre diaporama.",
      },
      { status: 409 },
    );
  const blocked = await requireActiveSubscription(user.id);
  if (blocked) return blocked;
  if (rateLimit(`studio-task:${user.id}`, 6))
    return NextResponse.json(
      { error: "Trop de demandes. Patiente une minute." },
      { status: 429 },
    );
  if (
    body.kind === "slideshow" &&
    (!isPreviewEnabled() ||
      typeof body.input.product?.name !== "string" ||
      !body.input.product.name.trim() ||
      !(SLIDESHOW_DURATIONS as readonly number[]).includes(
        body.input.duration,
      ) ||
      typeof body.input.musicId !== "string" ||
      (body.input.musicId && !/^[a-zA-Z0-9_-]{1,80}$/.test(body.input.musicId)))
  )
    return NextResponse.json(
      { error: "Paramètres de diaporama invalides." },
      { status: 400 },
    );
  if (
    body.kind === "image" &&
    (typeof body.input.prompt !== "string" ||
      !body.input.prompt.trim() ||
      body.input.prompt.length > 4000)
  )
    return NextResponse.json(
      { error: "Décris l’image à créer." },
      { status: 400 },
    );
  if (body.kind === "slideshow") {
    // Same bounded source as the free planner and image validator; never queue
    // an invalid storyboard, reserve credits, or call a provider to diagnose it.
    const product = body.input.product;
    product.description = typeof product.description === "string" ? product.description.trim().slice(0, 3000) : "";
    try {
      if (body.input.voiceover === true) {
        // Fail before image credits or provider calls while Preview validation is locked.
        assertSlideshowVoiceAllowed();
        const voice = buildSlideshowVoicePlan(product, body.input.duration, body.input.locale);
        body.input.locale = voice.language;
        body.input.musicId = voice.musicId;
      }
      buildSlideshowPlan({ name: product.name, description: product.description,
        hasReference: Boolean(product.image), duration: body.input.duration,
        aspectRatio: "9:16", character: "with", locale: body.input.locale,
        campaignGoal: body.input.campaignGoal }, body.input.musicId);
    } catch (error) {
      return NextResponse.json({
        error: body.input.voiceover === true && !(error instanceof InsufficientProductDetailsError) ? (error instanceof Error ? error.message : "Voix indisponible.") : error instanceof InsufficientProductDetailsError
          ? (body.input.locale === "en" ? "Add product details below, then click Retry." : "Complète la description ci-dessous, puis appuie sur Relancer.")
          : "Storyboard invalide.",
        ...(error instanceof InsufficientProductDetailsError ? { code: error.code } : {}),
        details: error instanceof Error ? error.message : "Storyboard invalide.",
      }, { status: 400 });
    }
  }
  const metadata: TaskMetadata = {
    type: TASK_TYPE,
    taskKind: body.kind,
    input: body.input,
    revision: 0,
    stages: [],
    creditsConsumed: 0,
    creditState: "confirmed",
    phase: "queued",
    progress: 1,
    message: "Génération en arrière-plan…",
    images: [],
    updatedAt: new Date().toISOString(),
  };
  const inserted = await admin
    .from("studio_generations")
    .insert({
      id: body.id,
      user_id: user.id,
      kind: body.kind === "image" ? "image" : "video",
      prompt: "Studio background task",
      options: { type: TASK_TYPE },
      metadata,
      status: "processing",
      credits_cost: 0,
    })
    .select("id,user_id,status,metadata,created_at")
    .single();
  if (inserted.error || !inserted.data)
    return NextResponse.json(
      {
        error:
          "Le lancement n’a pas été confirmé. Consulte le suivi sans relancer la génération.",
      },
      { status: 409 },
    );
  logTaskEvent("task_created", body.id, 0, metadata);
  after(async () => {
    try { await runTaskStep(body.id, 0); }
    catch {
      const failure = new StudioTaskError("STUDIO_WORKER_EXECUTION_FAILED");
      logTaskEvent("worker_execution_failed", body.id, 0, metadata, failure);
      await failTask(body.id, failure, { revision: 0, phase: "queued" }).catch(() => {
        logTaskEvent("failure_persistence_failed", body.id, 0, metadata, failure);
      });
    }
  });
  return NextResponse.json(
    { task: await publicTask(inserted.data) },
    { status: 202, headers: { "Cache-Control": "no-store" } },
  );
}
