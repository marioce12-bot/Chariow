import { FatalError } from "workflow";
import { failTask, runTaskStep, StudioTaskError } from "@/lib/studio/background-tasks";

/** Durable orchestration: preflight, five images, render. The queue resumes
 * orchestration, never a claimed/uncertain paid stage. No recursive HTTP chain. */
export async function studioTaskWorkflow(id: string, initialRevision: number) {
  "use workflow";
  let revision = initialRevision;
  for (let count = 0; count < 7; count++) {
    const next = await executeStudioTaskStep(id, revision);
    if (next == null) return;
    revision = next;
  }
}

export async function executeStudioTaskStep(id: string, revision: number): Promise<number | null> {
  "use step";
  try {
    // runTaskStep owns the per-revision CAS, stable child id and failure ledger.
    // A duplicate, failed or running task returns no next revision and stops.
    return (await runTaskStep(id, revision)) ?? null;
  } catch {
    const error = new StudioTaskError("STUDIO_WORKER_EXECUTION_FAILED");
    await failTask(id, error, { revision, phase: "queued" }).catch(() => undefined);
    throw new FatalError(error.code);
  }
}
// Never automatically retry provider work after an interruption or lost response.
executeStudioTaskStep.maxRetries = 0;
