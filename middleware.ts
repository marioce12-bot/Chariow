import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { CookieOptions } from "@supabase/ssr";
import { ADMIN_COOKIE, isAdminSessionValidEdge } from "@/lib/admin-password-edge";

export async function middleware(request: NextRequest) {
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
  if (isAdminPath && !isAdminLogin && !(await isAdminSessionValidEdge(request.cookies.get(ADMIN_COOKIE)?.value))) return NextResponse.redirect(new URL("/admin/login", request.url));
  if (user && ["/login", "/register"].includes(request.nextUrl.pathname)) return NextResponse.redirect(new URL("/dashboard", request.url));
  return response;
}

export const config = { matcher: ["/dashboard/:path*", "/admin/:path*", "/login", "/register"] };
