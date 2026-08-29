import { NextResponse } from "next/server";
import { ADMIN_COOKIE, createAdminSession } from "@/lib/admin-password";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";
  const session = createAdminSession(password);
  if (!session) return NextResponse.json({ error: "Mot de passe administrateur invalide." }, { status: 401 });
  const response = NextResponse.json({ authenticated: true });
  response.cookies.set(ADMIN_COOKIE, session, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 8 * 60 * 60 });
  return response;
}
