"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { notifyTeacherRequest } from "@/lib/admin/actions";

// Self-service signup always creates a STUDENT (T18 trigger). Choosing "teacher"
// records a request for an admin to approve — this form can never grant a role.
export function SignupForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [wantsTeacher, setWantsTeacher] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          requested_role: wantsTeacher ? "teacher" : "student",
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (signUpError) {
      setBusy(false);
      setError(signUpError.message);
      return;
    }

    // Tells the admins a request is waiting. Never blocks signing up.
    if (wantsTeacher) {
      try {
        await notifyTeacherRequest(email);
      } catch {
        /* the request is recorded in the database either way */
      }
    }
    setBusy(false);
    // With "Confirm email" on, the session is null until the link is clicked.
    if (data.session) {
      window.location.assign("/study");
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-3 text-sm">
        <h1 className="font-heading text-xl font-bold text-card-foreground">Check your inbox</h1>
        <p>
          We sent a confirmation link to <strong>{email}</strong>. Click it to activate
          your NRG account, then sign in.
        </p>
        {wantsTeacher && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
            You asked for a <strong>teacher</strong> account. You&apos;ll start with student
            access while Jade or Ian review the request — we&apos;ve let them know.
          </p>
        )}
        <p className="text-muted-foreground">Didn&apos;t get it? Check your spam folder.</p>
        <Link href="/login" className="inline-block font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h1 className="font-heading text-xl font-bold text-card-foreground">Create your account</h1>

      {error && (
        <p role="alert" className="text-sm rounded-md bg-red-50 text-red-700 border border-red-200 px-3 py-2">
          {error}
        </p>
      )}

      <label className="block text-sm">
        <span className="font-medium text-foreground">Full name</span>
        <input
          id="signup-name"
          type="text"
          autoComplete="name"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-card-foreground shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
        />
      </label>

      <label className="block text-sm">
        <span className="font-medium text-foreground">Email</span>
        <input
          id="signup-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-card-foreground shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
        />
      </label>

      <fieldset className="block text-sm">
        <legend className="font-medium text-foreground">I am signing up as a</legend>
        <div className="mt-1 grid gap-2 sm:grid-cols-2">
          {[
            { teacher: false, label: "Student", hint: "Study, practise and sit mock exams" },
            { teacher: true, label: "Teacher", hint: "Needs approval before it is granted" },
          ].map((opt) => (
            <label
              key={opt.label}
              className={`cursor-pointer rounded-lg border px-3 py-2 transition-colors ${
                wantsTeacher === opt.teacher
                  ? "border-primary bg-brand-50 shadow-sm ring-1 ring-primary/30"
                  : "border-input hover:border-brand-300 hover:bg-muted"
              }`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="signup-role"
                  checked={wantsTeacher === opt.teacher}
                  onChange={() => setWantsTeacher(opt.teacher)}
                />
                <span className="font-medium text-card-foreground">{opt.label}</span>
              </span>
              <span className="mt-0.5 block pl-6 text-xs text-muted-foreground">{opt.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block text-sm">
        <span className="font-medium text-foreground">Password</span>
        <input
          id="signup-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-card-foreground shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
        />
        <span className="text-xs text-muted-foreground">At least 8 characters.</span>
      </label>

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-primary py-2.5 font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary-hover hover:shadow-md disabled:opacity-60"
      >
        {busy ? "Creating…" : "Create account"}
      </button>

      <p className="text-sm text-muted-foreground text-center">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary">
          Sign in
        </Link>
      </p>
    </form>
  );
}
