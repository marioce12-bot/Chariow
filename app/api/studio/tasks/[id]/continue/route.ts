import { start } from "workflow/api";
import { studioTaskWorkflow } from "@/lib/studio/task-workflow";
import { NextResponse, after } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveSubscription } from "@/lib/subscription/access";
import { TASK_TYPE, continuationQuote, failTask, logTaskEvent, publicTask, StudioTaskError, legacyQueuedDispatchCheckpoint, stageGenerationId, type StageRecord, type TaskMetadata } from "@/lib/studio/background-tasks";

export const runtime = "nodejs";
export const maxDuration = 300;
type Context = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function ownedTask(id: string, userId: string) {
  if (!UUID.test(id)) return null;
  const { data, error } = await createAdminClient().from("studio_generations")
    .select("id,user_id,status,metadata,created_at").eq("id", id).eq("user_id", userId).maybeSingle();
  return error ? null : data;
}
export async function GET(_request: Request, context: Context) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { id } = await context.params;
  const row = await ownedTask(id, user.id);
  if (!row || row.metadata?.type !== TASK_TYPE) return NextResponse.json({ error: "Demande indisponible." }, { status: 404 });
  const task = await publicTask(row);
  return NextResponse.json({ task: { ...task, resume: continuationQuote(row, task) } }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request, context: Context) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (!UUID.test(id) || !body || !Number.isInteger(body.expectedRevision) || body.expectedRevision < 0 || !Number.isInteger(body.confirmCost) || body.confirmCost < 0)
    return NextResponse.json({ error: "Demande invalide." }, { status: 400 });
  const row = await ownedTask(id, user.id);
  if (!row || row.metadata?.type !== TASK_TYPE) return NextResponse.json({ error: "Demande indisponible." }, { status: 404 });
  if (row.metadata.revision !== body.expectedRevision) return NextResponse.json({ error: "La tâche a changé. Actualise le suivi." }, { status: 409 });
  const task = await publicTask(row);
  const quote = continuationQuote(row, task);
  if (!quote.allowed) return NextResponse.json({ error: "Cette tâche ne peut pas être reprise en toute sécurité.", reason: quote.reason }, { status: 409 });
  if (body.confirmCost !== quote.cost) return NextResponse.json({ error: "Confirmation du coût requise.", cost: quote.cost }, { status: 409 });
  const blocked = await requireActiveSubscription(user.id);
  if (blocked) return blocked;

  const meta = row.metadata as TaskMetadata;
  const admin = createAdminClient();
  // Re-read deterministic children before claiming. Only completed children prove the stage is safe;
  // any absent/non-completed child remains uncertain and is never retried.
  const stages: StageRecord[] = (meta.stages ?? (legacyQueuedDispatchCheckpoint(row, task)
    ? task.images.map((image: { id: string }, index: number) => ({ step: index + 1, kind: "image" as const, state: "completed" as const, generationId: image.id, cost: 20, creditState: "confirmed" as const, startedAt: meta.updatedAt, completedAt: meta.updatedAt })) : [])).map(stage => ({ ...stage }));
  const imageStages = stages.filter((stage) => stage.kind === "image");
  const ids = imageStages.map((stage) => stage.generationId).filter(Boolean) as string[];
  if (!meta.stages && meta.revision === 0) {
    const legacyId = stageGenerationId(id, 0);
    ids.push(legacyId);
  }
  let children: any[] = [];
  if (ids.length) {
    const { data, error } = await admin.from("studio_generations").select("id,storage_path,status,credits_cost").in("id", [...new Set(ids)]).eq("user_id", user.id).limit(5);
    if (error) return NextResponse.json({ error: "Suivi indisponible." }, { status: 503 });
    children = data ?? [];
  }
  const recoveredImages = [...(meta.images ?? [])];
  let recoveredCurrentStep = false;
  for (const stage of imageStages) {
    const child = children.find((candidate) => candidate.id === stage.generationId);
    if (!child || child.status !== "completed" || !child.storage_path) {
      if (stage.state !== "completed" || !recoveredImages.some((image) => image.id === stage.generationId))
        return NextResponse.json({ error: "Une étape est incertaine et ne sera pas relancée.", reason: "STAGE_UNCERTAIN" }, { status: 409 });
      continue;
    }
    if (stage.step === meta.revision && stage.state !== "completed") recoveredCurrentStep = true;
    stage.state = "completed";
    stage.creditState = "confirmed";
    if (!stage.completedAt) stage.completedAt = new Date().toISOString();
    if (!recoveredImages.some((image) => image.id === child.id)) recoveredImages.push({ id: child.id, url: "" });
  }
  if (recoveredImages.length > 5) return NextResponse.json({ error: "État de tâche invalide." }, { status: 409 });
  const nextMeta: TaskMetadata = {
    ...meta, images: recoveredImages, stages, continueQueued: true,
    creditsConsumed: Math.max(meta.creditsConsumed ?? 0, task.creditsConsumed ?? 0), creditState: "confirmed",
    revision: meta.revision + (recoveredCurrentStep ? 1 : 0),
    phase: "queued", error: undefined, errorCode: undefined,
    message: "Reprise en cours…", updatedAt: new Date().toISOString(),
  };
  // Claim atomically by status + phase + revision: simultaneous requests yield one winner.
  const claim = await admin.from("studio_generations").update({ status: "processing", error: null, metadata: nextMeta })
    .eq("id", id).eq("user_id", user.id).eq("status", row.status)
    .eq("metadata->>phase", meta.phase).eq("metadata->>revision", String(meta.revision))
    .eq("metadata->>updatedAt", meta.updatedAt).select("id");
  if (claim.error) return NextResponse.json({ error: "Reprise indisponible." }, { status: 503 });
  if (!claim.data?.length) return NextResponse.json({ error: "La tâche a déjà été reprise ou modifiée." }, { status: 409 });
  after(async () => {
    try { await start(studioTaskWorkflow, [id, nextMeta.revision]); }
    catch {
      const failure = new StudioTaskError("STUDIO_WORKER_EXECUTION_FAILED");
      logTaskEvent("worker_execution_failed", id, meta.revision, nextMeta, failure);
      await failTask(id, failure, { revision: nextMeta.revision, phase: "queued" }).catch(() => undefined);
    }
  });
  const updated = { ...row, status: "processing", metadata: nextMeta };
  const responseTask = await publicTask(updated);
  return NextResponse.json({ task: { ...responseTask, resume: continuationQuote(updated, responseTask) } }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
