import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

/** Preparation is available separately; there is intentionally no provider/credit path here.
 * A reviewed activation must provision a durable worker, assembly binaries and credit lifecycle first.
 */
export async function POST(_request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  return NextResponse.json({
    error: "La génération vidéo est en préparation et reste indisponible.",
    code: "STUDIO_VIDEO_LOCKED",
    locked: true,
  }, { status: 423 });
}
