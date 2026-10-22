import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { studioTaskFixtureWorkflow } from "@/lib/studio/task-workflow-fixture";
export const runtime = "nodejs";
export const maxDuration = 90;
/** This route accepts no task id, user id, product input or provider options.
 * Production always returns 404. Preview is protected by Vercel authentication. */
export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const run = await start(studioTaskFixtureWorkflow, []);
  const result = await run.returnValue;
  return NextResponse.json({ fixtureOnly: true, ...result }, { headers: { "Cache-Control": "no-store" } });
}
