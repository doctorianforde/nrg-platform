import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sanitizeNext, ROLE_HOME, isRole } from "@/lib/auth/roles";

// T17: exchanges the ?code= from a confirmation / magic-link / reset email for
// a session cookie, then sends the user to ?next= (sanitised) or their dashboard.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = sanitizeNext(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  }

  if (next) return NextResponse.redirect(`${origin}${next}`);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile && isRole(profile.role)) {
      return NextResponse.redirect(`${origin}${ROLE_HOME[profile.role]}`);
    }
  }
  return NextResponse.redirect(`${origin}/study`);
}
