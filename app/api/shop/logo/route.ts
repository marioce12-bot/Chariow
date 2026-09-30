import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/shop/rate-limit";
import { MAX_LOGO_BYTES, uploadLogo } from "@/lib/shop/logo";

// Envoi du logo d'une vitrine (protégé par requireUser, donc par le paywall).
// Images JPEG/PNG/WebP uniquement (vérifiées sur les octets du fichier), 5 Mo maximum.
export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  if (rateLimit(`shop-logo:${user.id}`, 10)) return NextResponse.json({ error: "Trop d'envois, réessaie dans une minute" }, { status: 429 });

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_LOGO_BYTES + 512 * 1024) return NextResponse.json({ error: "Logo trop volumineux" }, { status: 413 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
  if (file.size > MAX_LOGO_BYTES) return NextResponse.json({ error: `Logo trop volumineux (maximum ${MAX_LOGO_BYTES / (1024 * 1024)} Mo)` }, { status: 413 });

  const result = await uploadLogo(new Uint8Array(await file.arrayBuffer()));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ url: result.url }, { status: 201 });
}
