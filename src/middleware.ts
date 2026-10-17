import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { PROTECTED_PREFIXES } from "@/lib/auth/roles";
import {
  DEFAULT_THEME,
  THEME_COOKIE,
  THEME_HEADER,
  isThemeId,
  isThemedPath,
  parseThemeCookie,
  type ThemeId,
} from "@/lib/theme/themes";

// T21: refresh the Supabase session cookie on every request and gate protected
// routes behind authentication. Role checks happen in each route's server
// component via requireRole() — the middleware only knows "signed in or not".
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() validates the JWT with Supabase; never trust getSession() here.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Signed-in users don't need the auth pages.
  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/study";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return withTheme(request, response, supabase, user?.id ?? null, pathname);
}

/**
 * Student themes: tell the root layout which theme to server-render on <html> (no flash), via a request header.
 * The resolved theme is cached in a cookie `<user id>.<theme>`, so the profile is read once per browser and user, not
 * per request; the id prefix means a different account on the same browser never inherits the cached value. Staff
 * always resolve to the default, and only the study area is themed (isThemedPath).
 */
async function withTheme(
  request: NextRequest,
  response: NextResponse,
  supabase: ReturnType<typeof createServerClient>,
  uid: string | null,
  pathname: string
) {
  let theme: ThemeId = DEFAULT_THEME;
  let setCookie: string | null = null;
  if (uid) {
    const cached = parseThemeCookie(request.cookies.get(THEME_COOKIE)?.value);
    if (cached && cached.uid === uid) {
      theme = cached.theme;
    } else {
      const { data } = await supabase.from("profiles").select("role, theme").eq("id", uid).maybeSingle();
      theme = data?.role === "student" && isThemeId(data.theme) ? data.theme : DEFAULT_THEME;
      setCookie = `${uid}.${theme}`;
    }
  }

  const headers = new Headers(request.headers);
  headers.set(THEME_HEADER, isThemedPath(pathname) ? theme : DEFAULT_THEME);
  const out = NextResponse.next({ request: { headers } });
  response.cookies.getAll().forEach((c) => out.cookies.set(c));
  if (setCookie) {
    // Not httpOnly: ThemeSync reads it on client-side navigations. It holds nothing secret.
    out.cookies.set(THEME_COOKIE, setCookie, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  }
  return out;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)"],
};
