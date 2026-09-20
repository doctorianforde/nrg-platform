import { adminClient } from "@/lib/supabase/admin";

// Server-side only: reads SUPABASE_SERVICE_ROLE_KEY via adminClient. Never import
// this from a client component.

/**
 * Outbound email for admin notifications.
 *
 * Sends through Resend when RESEND_API_KEY is set and does nothing otherwise, so
 * the platform works either way — the in-app notification is the reliable channel
 * and email is a convenience on top. Deliberately no SDK: one fetch, no dependency.
 *
 * Set in Vercel:
 *   RESEND_API_KEY  — from resend.com
 *   RESEND_FROM     — optional, e.g. "NRG Platform <noreply@yourdomain>".
 *                     Defaults to Resend's shared onboarding sender, which only
 *                     delivers to the address that owns the Resend account until
 *                     you verify a domain.
 */
export type EmailOutcome = "sent" | "skipped" | "failed";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

async function adminRecipients(): Promise<string[]> {
  const { data } = await adminClient.from("admin_contacts").select("email");
  return (data ?? []).map((r) => r.email);
}

export async function notifyAdmins({
  subject,
  heading,
  lines,
  actionUrl,
}: {
  subject: string;
  heading: string;
  lines: string[];
  actionUrl?: string;
}): Promise<EmailOutcome> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return "skipped";

  const to = await adminRecipients();
  if (to.length === 0) return "skipped";

  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = [
    `<h2 style="font-family:system-ui,sans-serif;color:#4a1d6a;margin:0 0 12px">${esc(heading)}</h2>`,
    ...lines.map((l) => `<p style="font-family:system-ui,sans-serif;margin:0 0 8px">${esc(l)}</p>`),
    actionUrl
      ? `<p style="margin:20px 0"><a href="${esc(actionUrl)}" style="font-family:system-ui,sans-serif;background:#6b2d8b;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Open the admin area</a></p>`
      : "",
  ].join("");

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.RESEND_FROM ?? "NRG Platform <onboarding@resend.dev>",
        to,
        subject,
        html,
        text: [heading, ...lines, actionUrl ?? ""].filter(Boolean).join("\n\n"),
      }),
    });
    if (!res.ok) {
      console.error("notifyAdmins: Resend rejected the message", res.status, await res.text());
      return "failed";
    }
    return "sent";
  } catch (e) {
    // Never let a mail failure break the request that triggered it.
    console.error("notifyAdmins: could not reach Resend", e);
    return "failed";
  }
}
