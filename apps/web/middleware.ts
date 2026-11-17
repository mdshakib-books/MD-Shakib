import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getServerSupabaseConfig } from "@/lib/supabase/config";

/**
 * Next.js Edge Middleware for Supabase Session Management & Route Protection.
 * 
 * 1. Validates environment isolation before creating Supabase client.
 * 2. Automatically refreshes expired Auth tokens and updates cookies.
 * 3. Protects customer routes (/profile, /addresses, /orders, /checkout) from unauthenticated access.
 * 4. Redirects authenticated customers away from guest-only auth pages (/login, /register, etc.).
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const requestHeaders = new Headers(request.headers);
  const correlationId =
    requestHeaders.get("x-request-id") || crypto.randomUUID();
  requestHeaders.set("x-request-id", correlationId);

  // Machine endpoints (webhooks/cron) authenticate with HMAC/Bearer secrets, not session cookies
  if (
    pathname.startsWith("/api/webhooks/") ||
    pathname.startsWith("/api/cron/")
  ) {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("x-request-id", correlationId);
    return res;
  }

  // Protected customer & admin routes
  const isProtectedRoute =
    pathname.startsWith("/account") ||
    pathname.startsWith("/profile") ||
    pathname.startsWith("/addresses") ||
    pathname.startsWith("/orders") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/admin");

  // Guest-only auth routes
  const isGuestAuthRoute =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/forgot-password";

  // Skip remote auth verification for anonymous public pages/routes when no Supabase session cookie is present
  const hasSupabaseCookie = request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-"));

  if (!isProtectedRoute && !isGuestAuthRoute && !hasSupabaseCookie) {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("x-request-id", correlationId);
    return res;
  }

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const { supabaseUrl, supabaseAnonKey } = getServerSupabaseConfig();

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request: { headers: requestHeaders },
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Verify user token securely
  const { data: { user } } = await supabase.auth.getUser();

  if (isProtectedRoute && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    const redirectRes = NextResponse.redirect(loginUrl);
    redirectRes.headers.set("x-request-id", correlationId);
    return redirectRes;
  }

  if (isGuestAuthRoute && user) {
    const profileRes = NextResponse.redirect(new URL("/profile", request.url));
    profileRes.headers.set("x-request-id", correlationId);
    return profileRes;
  }

  supabaseResponse.headers.set("x-request-id", correlationId);
  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images/ or public static assets (.wasm, .lottie, image extensions)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|wasm|lottie)$).*)",
  ],
};

