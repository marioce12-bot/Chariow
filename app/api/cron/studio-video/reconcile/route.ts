import { timingSafeEqual } from "node:crypto";
import { start } from "workflow/api";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { studioVideoWorkflow } from "@/lib/studio/video-workflow";

export const runtime = "nodejs";
export const maxDuration = 60;

function hasValidSecret(request: Request) {
  const expected = process.env.STUDIO_VIDEO_RECONCILE_SECRET ?? "";
  const supplied = request.headers.get("x-studio-video-reconcile-secret") ?? "";
  if (expected.length < 32 || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

function isOldEnough(metadata: Record<string, unknown>, createdAt: string) {
  const value = typeof metadata.updatedAt === "string" ? metadata.updatedAt : createdAt;
  const updatedAt = Date.parse(value);
  return Number.isFinite(updatedAt) && Date.now() - updatedAt >= 20 * 60_000;
}

function hasAmbiguousSubmissionWithoutJobId(metadata: Record<string, unknown>) {
  return ["segment0", "segment1", "continuityFrame", "merge"].some((prefix) => {
    const state = metadata[`${prefix}State`];
    if (state !== "submitting" && state !== "uncertain") return false;
    const jobId = metadata[`${prefix}JobId`];
    const endpoint = metadata[`${prefix}FalEndpoint`];
    const requestId = metadata[`${prefix}FalRequestId`];
    return typeof jobId !== "string" && !(typeof endpoint === "string" && typeof requestId === "string");
  });
}

export async function POST(request: Request) {
  if (!hasValidSecret(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const body = await request.json().catch(() => ({})) as { limit?: unknown };
  const limit = typeof body.limit === "number" && Number.isInteger(body.limit) ? Math.max(1, Math.min(50, body.limit)) : 25;
  const admin = createAdminClient();
  const claimed = await admin.rpc("claim_studio_video_reconcile_batch", { p_limit: limit });
  if (claimed.error || !Array.isArray(claimed.data)) {
    console.error("Studio video reconciliation summary", { claimed: 0, dispatched: 0, active: 0, terminal: 0, retry: 1, error: "outbox_claim_failed" });
    return NextResponse.json({ error: "Reconciliation temporarily unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  let dispatched = 0;
  let active = 0;
  let terminal = 0;
  let retry = 0;
  for (const item of claimed.data as Array<{ generation_id?: string; attempts?: number }>) {
    const generationId = item.generation_id;
    if (!generationId) { retry += 1; continue; }
    let outcome: "dispatched" | "still_active" | "manual_review" | "terminal" = "still_active";
    try {
      const result = await admin.from("studio_generations")
        .select("id,status,metadata,created_at")
        .eq("id", generationId)
        .maybeSingle();
      if (result.error) throw new Error("generation_read_failed");
      const generation = result.data as { id: string; status: string; metadata: Record<string, unknown> | null; created_at: string } | null;
      if (!generation || generation.status !== "processing") {
        outcome = generation?.metadata?.creditState === "uncertain" ? "manual_review" : "terminal";
      } else {
        const metadata = generation.metadata ?? {};
        const phase = typeof metadata.phase === "string" ? metadata.phase : "unknown";
        if (phase === "queued") {
          await start(studioVideoWorkflow, [generationId]);
          outcome = "dispatched";
        } else if (isOldEnough(metadata, generation.created_at)) {
          if (hasAmbiguousSubmissionWithoutJobId(metadata)) {
            outcome = "manual_review";
          } else {
          // Only the saved Fal request IDs are ever reused by the workflow. States
          // still marked `submitting` without an ID remain fail-closed; no new paid
          // request is created by this route.
            const reset = await admin.rpc("requeue_stale_studio_video_generation", {
              p_generation_id: generationId,
              p_stale_before: new Date(Date.now() - 20 * 60_000).toISOString(),
            });
            if (reset.error) throw new Error("stale_requeue_failed");
            if (reset.data === true) {
              await start(studioVideoWorkflow, [generationId]);
              outcome = "dispatched";
            } else {
              outcome = "still_active";
            }
          }
        } else {
          outcome = "still_active";
        }
      }
    } catch {
      outcome = "still_active";
      retry += 1;
    }

    const finished = await admin.rpc("finish_studio_video_reconcile", {
      p_generation_id: generationId,
      p_outcome: outcome,
      p_retry_seconds: outcome === "dispatched" ? 1200 : 1800,
    });
    if (finished.error || finished.data !== true) retry += 1;
    else if (outcome === "dispatched") dispatched += 1;
    else if (outcome === "terminal") terminal += 1;
    else if (outcome === "manual_review") retry += 1;
    else active += 1;
  }

  console.info("Studio video reconciliation summary", {
    claimed: claimed.data.length,
    dispatched,
    active,
    terminal,
    retry,
  });
  return NextResponse.json({ ok: true, claimed: claimed.data.length, dispatched, active, terminal, retry }, { headers: { "Cache-Control": "no-store" } });
}
