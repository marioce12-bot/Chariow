import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { requireUser } from "@/lib/auth";

const FOLDER = "vendeo/campaign-creatives";

// Signe une demande d'envoi Cloudinary. Le navigateur envoie ensuite le fichier
// directement à Cloudinary : il ne passe plus par une fonction Vercel (limite de 4,5 Mo).
export async function POST() {
  const { user, response } = await requireUser();
  if (!user) return response;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return NextResponse.json({ error: "Cloudinary n’est pas configuré sur le serveur" }, { status: 500 });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHash("sha1").update(`folder=${FOLDER}&timestamp=${timestamp}${apiSecret}`).digest("hex");
  return NextResponse.json({ cloudName, apiKey, timestamp, folder: FOLDER, signature });
}
