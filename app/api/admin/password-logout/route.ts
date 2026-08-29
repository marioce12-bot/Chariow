import { NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/lib/admin-password";

export async function POST() {
  const response = NextResponse.json({ loggedOut: true });
  response.cookies.set(ADMIN_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
