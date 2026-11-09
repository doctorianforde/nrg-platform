import { adminClient } from "@/lib/supabase/admin";
import { sendEmail, type EmailOutcome } from "@/lib/mail/send";

// Server-side only: reads SUPABASE_SERVICE_ROLE_KEY via adminClient. Never import this from a client component.

/**
 * Admin notifications. Sends through the shared mailer (src/lib/mail/send.ts: SMTP, else Resend, else skipped), so the
 * platform works either way; the in-app notice is the reliable channel and email is a convenience on top.
 */
export type { EmailOutcome };

/** admin_contacts holds real people (Ian, Jade). ADMIN_NOTIFY_TO, when set (staging: the nrgplatform.dev inbox),
 *  replaces them, so testing never emails Jade. Comma-separated. */
export async function adminRecipients(): Promise<string[]> {
  const override = (process.env.ADMIN_NOTIFY_TO ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (override.length) return override;
  const { data } = await adminClient.from("admin_contacts").select("email");
  return (data ?? []).map((r) => r.email).filter(Boolean);
}

export async function notifyAdmins({
  subject,
  heading,
  lines,
  actionUrl,
  actionLabel,
}: {
  subject: string;
  heading: string;
  lines: string[];
  actionUrl?: string;
  actionLabel?: string;
}): Promise<EmailOutcome> {
  const to = await adminRecipients();
  if (to.length === 0) return "skipped";
  return sendEmail({ to, subject, heading, lines, actionUrl, actionLabel: actionLabel ?? "Open the admin area" });
}
