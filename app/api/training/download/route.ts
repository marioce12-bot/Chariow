import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { requireUser } from "@/lib/auth";
import { requireActiveSubscription } from "@/lib/subscription/access";

export const runtime = "nodejs";

export async function GET() {
  const { user, response } = await requireUser({ allowUnsubscribed: true });
  if (!user) return response;
  const blocked = await requireActiveSubscription(user.id);
  if (blocked) return blocked;
  try {
    const file = await readFile(join(process.cwd(), "training-assets", "formation-vendeo-guides.zip"));
    return new NextResponse(file, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="formation-vendeo-guides.zip"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Training archive is unavailable", error);
    return NextResponse.json({ error: "Le pack de formation est temporairement indisponible." }, { status: 503 });
  }
}
