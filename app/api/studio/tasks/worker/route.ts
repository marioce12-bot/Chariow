import { NextResponse, after } from "next/server";
import { runTaskStep, validTaskToken } from "@/lib/studio/background-tasks";
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
  after(() => runTaskStep(body.id, body.revision));
  return NextResponse.json({ accepted: true }, { status: 202 });
}
