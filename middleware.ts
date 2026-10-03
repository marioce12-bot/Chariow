import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { CookieOptions } from "@supabase/ssr";
import { ADMIN_COOKIE, isAdminSessionValidEdge } from "@/lib/admin-password-edge";

export async function middleware(request: NextRequest) {
  // Si Supabase renvoie le lien e-mail sur la landing (redirectTo non autorisé dans
  // Supabase → il retombe sur le Site URL), on route vers /auth/confirm pour échanger le code.
  if (request.nextUrl.pathname === "/") {
    const code = request.nextUrl.searchParams.get("code");
    const tokenHash = request.nextUrl.searchParams.get("token_hash");
    if (code || tokenHash) {
      const confirmUrl = new URL("/auth/confirm", request.url);
      if (code) confirmUrl.searchParams.set("code", code);
      if (tokenHash) confirmUrl.searchParams.set("token_hash", tokenHash);
      const type = request.nextUrl.searchParams.get("type");
      if (type) confirmUrl.searchParams.set("type", type);
      if (type === "recovery" || request.cookies.get("vendeo_pw_reset")?.value === "1") confirmUrl.searchParams.set("next", "/reset-password");
      return NextResponse.redirect(confirmUrl);
    }
    return NextResponse.next();
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase environment variables in middleware");
    if (request.nextUrl.pathname.startsWith("/dashboard")) return NextResponse.redirect(new URL("/login?error=configuration", request.url));
    return NextResponse.next();
  }
  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet: { name: string; value: string; options: CookieOptions }[]) => cookiesToSet.forEach(({ name, value, options }) => { request.cookies.set(name, value); response = NextResponse.next({ request }); response.cookies.set(name, value, options); }),
    },
  });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) console.error("Supabase middleware auth error", error.message);
  const isAdminPath = request.nextUrl.pathname.startsWith("/admin");
  const isAdminLogin = request.nextUrl.pathname === "/admin/login";
  if (!user && request.nextUrl.pathname.startsWith("/dashboard")) return NextResponse.redirect(new URL("/login", request.url));
  // The admin page performs the final server-side check. Do not let a stale or
  // edge-incompatible cookie fall through to the Supabase admin error screen.
  if (isAdminPath && !isAdminLogin && !(await isAdminSessionValidEdge(request.cookies.get(ADMIN_COOKIE)?.value))) return NextResponse.redirect(new URL("/admin/login", request.url));
  if (user && ["/login", "/register"].includes(request.nextUrl.pathname)) return NextResponse.redirect(new URL("/dashboard", request.url));
  return response;
}

export const config = { matcher: ["/", "/dashboard/:path*", "/admin/:path*", "/login", "/register"] };
