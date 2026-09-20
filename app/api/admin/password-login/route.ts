import { NextResponse } from "next/server";
import { ADMIN_COOKIE, createAdminSession } from "@/lib/admin-password";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";
  const session = createAdminSession(password);
  if (!session) {
    const configured = Boolean(process.env.ADMIN_PASSWORD);
    const secretConfigured = Boolean(process.env.ADMIN_PASSWORD_SECRET || process.env.TOKEN_ENCRYPTION_KEY);
    console.error("Admin password login rejected", { configured, secretConfigured });
    return NextResponse.json({ error: configured && secretConfigured ? "Mot de passe administrateur invalide." : "La configuration administrateur est incomplète." }, { status: 401 });
  }
  const response = NextResponse.json({ authenticated: true });
  response.cookies.set(ADMIN_COOKIE, session, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 8 * 60 * 60 });
  return response;
}
