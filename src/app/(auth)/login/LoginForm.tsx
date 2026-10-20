"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isRole, ROLE_HOME, sanitizeNext } from "@/lib/auth/roles";

const ERROR_COPY: Record<string, string> = {
  missing_code: "That sign-in link is incomplete. Request a new one.",
  profile_missing: "Your account has no profile yet. Contact support.",
  suspended: "This account has been suspended. Contact your administrator.",
};

// T22: email + password sign-in, then route by profiles.role (or ?next=).
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = sanitizeNext(params.get("next"));
  const urlError = params.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    urlError ? ERROR_COPY[urlError] ?? urlError : null
  );
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !data.user) {
      setBusy(false);
      setError(
        signInError?.message === "Invalid login credentials"
          ? "Email or password is incorrect."
          : signInError?.message === "Email not confirmed"
          ? "Confirm your email first — check your inbox for the NRG link."
          : signInError?.message ?? "Sign-in failed. Try again."
      );
      return;
    }

    if (next) {
      router.replace(next);
      router.refresh();
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();

    const role = profile && isRole(profile.role) ? profile.role : "student";
    router.replace(ROLE_HOME[role]);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h1 className="font-heading text-xl font-bold text-card-foreground">Sign in</h1>

      {error && (
        <p role="alert" className="text-sm rounded-md bg-red-50 text-red-700 border border-red-200 px-3 py-2">
          {error}
        </p>
      )}

      <label className="block text-sm">
        <span className="font-medium text-foreground">Email</span>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-card-foreground shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
        />
      </label>

      <label className="block text-sm">
        <span className="font-medium text-foreground">Password</span>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-card-foreground shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
        />
      </label>

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-primary py-2.5 font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary-hover hover:shadow-md disabled:opacity-60"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>

      <p className="text-sm text-muted-foreground text-center">
        New here?{" "}
        <Link href="/signup" className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary">
          Create an account
        </Link>
      </p>
    </form>
  );
}
