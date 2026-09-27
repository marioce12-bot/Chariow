import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_BYTES = 15 * 1024 * 1024; // 15 Mo
// Les documents restent plus légers : on limite plus bas pour ne pas lancer
// une extraction de texte trop coûteuse sur un très gros fichier.
const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024; // 8 Mo
// Texte conservé par document : le contexte envoyé à l'IA a de toute façon sa
// propre limite globale (voir app/api/chat/route.ts), mais on tronque déjà ici
// pour ne jamais stocker/transporter un texte démesuré.
const MAX_EXTRACTED_TEXT_CHARS = 6_000;

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};
const DOCUMENT_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

// Extrait le texte brut d'un PDF ou d'un .docx. Le .doc (ancien format binaire
// Word) n'est volontairement pas supporté : ni pdf-parse ni mammoth ne le lisent
// correctement, mieux vaut refuser proprement que renvoyer du texte corrompu.
async function extractDocumentText(file: File, body: Buffer): Promise<string> {
  try {
    if (file.type === "application/pdf") {
      const { default: pdfParse } = await import("pdf-parse");
      const data = await pdfParse(body);
      return data.text || "";
    }
    if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: body });
      return result.value || "";
    }
  } catch (error) {
    console.error("Document text extraction error", error instanceof Error ? error.message : error);
  }
  return "";
}

// Upload d'un fichier joint à une conversation de l'assistant : image ou vidéo
// (créative pour les pubs), ou document PDF/Word (pour que l'IA lise son contenu
// et réponde à partir de ce texte).
export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });

  const isDocument = Boolean(DOCUMENT_TYPES[file.type]);
  const ext = IMAGE_TYPES[file.type] ?? VIDEO_TYPES[file.type] ?? DOCUMENT_TYPES[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: "Seuls les images (jpg, png, webp, gif), vidéos (mp4, webm, mov) et documents (pdf, docx) sont acceptés." },
      { status: 400 }
    );
  }
  const maxBytes = isDocument ? MAX_DOCUMENT_BYTES : MAX_BYTES;
  if (file.size > maxBytes) return NextResponse.json({ error: `Le fichier dépasse ${Math.round(maxBytes / (1024 * 1024))} Mo.` }, { status: 400 });

  const id = crypto.randomUUID();
  const path = `${user.id}/chat/${id}.${ext}`;
  const body = Buffer.from(await file.arrayBuffer());

  const admin = createAdminClient();
  const { error } = await admin.storage.from("studio-media").upload(path, body, { contentType: file.type, upsert: true });
  if (error) return NextResponse.json({ error: "Impossible de stocker le fichier." }, { status: 500 });

  const { data } = await admin.storage.from("studio-media").createSignedUrl(path, 24 * 3600);
  if (!data?.signedUrl) return NextResponse.json({ error: "Impossible de générer l'URL du fichier." }, { status: 500 });

  if (isDocument) {
    const rawText = await extractDocumentText(file, body);
    const text = rawText.trim().slice(0, MAX_EXTRACTED_TEXT_CHARS);
    if (!text) return NextResponse.json({ error: "Impossible de lire le contenu de ce document." }, { status: 422 });
    return NextResponse.json({ url: data.signedUrl, type: "document", name: file.name, text });
  }

  return NextResponse.json({ url: data.signedUrl, type: file.type.startsWith("video") ? "video" : "image" });
}
