import { NextResponse, after } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveSubscription } from "@/lib/subscription/access";
import { rateLimit } from "@/lib/shop/rate-limit";
import { SLIDESHOW_DURATIONS } from "@/lib/studio/slideshow-plan";
import { isPreviewEnabled } from "@/lib/studio/slideshow-server";
import {
  TASK_TYPE,
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
  const metadata: TaskMetadata = {
    type: TASK_TYPE,
    taskKind: body.kind,
    input: body.input,
    revision: 0,
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
  after(() => runTaskStep(body.id, 0));
  return NextResponse.json(
    { task: await publicTask(inserted.data) },
    { status: 202, headers: { "Cache-Control": "no-store" } },
  );
}
