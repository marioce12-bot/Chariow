import { NextResponse, after } from "next/server";
import { failTask, logTaskEvent, runTaskStep, StudioTaskError, validTaskToken } from "@/lib/studio/background-tasks";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (
    !body ||
    typeof body.id !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(body.id) ||
    !Number.isInteger(body.revision) ||
    body.revision < 0 ||
    !validTaskToken(
      body.id,
      body.revision,
      request.headers.get("x-studio-task-token") || "",
    )
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  logTaskEvent("worker_received", body.id, body.revision);
  after(async () => {
    try { await runTaskStep(body.id, body.revision); }
    catch {
      const failure = new StudioTaskError("STUDIO_WORKER_EXECUTION_FAILED");
      logTaskEvent("worker_execution_failed", body.id, body.revision, undefined, failure);
      await failTask(body.id, failure, { revision: body.revision, phase: "queued" }).catch(() => {
        logTaskEvent("failure_persistence_failed", body.id, body.revision, undefined, failure);
      });
    }
  });
  return NextResponse.json({ accepted: true }, { status: 202 });
}
