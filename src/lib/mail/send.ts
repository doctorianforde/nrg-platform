import nodemailer from "nodemailer";

// Server-side only. Never import from a client component.

/**
 * Outbound email for the whole app (admin notices, payment decisions, plan reminders).
 *
 * Sends through SMTP when SMTP_HOST/SMTP_USER/SMTP_PASS are set (for now Gmail: nrgplatform.dev@gmail.com with an app
 * password, Ian 2026-11-09), else through Resend when RESEND_API_KEY is set, else does nothing. It never throws: a
 * mail failure must not break the request that triggered it, and every screen also shows the same information.
 *
 * Vercel env (per project): SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, SMTP_USER=<address>, SMTP_PASS=<app password,
 * set by Ian>, MAIL_FROM="NRG Platform <address>" (optional; defaults to SMTP_USER). NEXT_PUBLIC_SITE_URL for links.
 */
export type EmailOutcome = "sent" | "skipped" | "failed";

export type Email = {
  to: string | string[];
  subject: string;
  heading: string;
  lines: string[];
  actionUrl?: string;
  actionLabel?: string;
};

export const siteUrl = () =>
  (process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://nrg-platform.vercel.app")).replace(/\/$/, "");

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function render({ heading, lines, actionUrl, actionLabel }: Email) {
  const html = [
    `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;color:#1f1a29">`,
    `<p style="margin:0 0 16px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6b2d8b">NRG Platform</p>`,
    `<h2 style="color:#4a1d6a;margin:0 0 12px;font-size:20px">${esc(heading)}</h2>`,
    ...lines.map((l) => `<p style="margin:0 0 10px;font-size:15px;line-height:1.5">${esc(l)}</p>`),
    actionUrl
      ? `<p style="margin:22px 0"><a href="${esc(actionUrl)}" style="background:#6b2d8b;color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:600">${esc(actionLabel ?? "Open NRG")}</a></p>`
      : "",
    `<p style="margin:24px 0 0;font-size:12px;color:#5d536b">RENR exam preparation. You are receiving this because of your NRG account.</p>`,
    `</div>`,
  ].join("");
  const text = [heading, ...lines, actionUrl ? `${actionLabel ?? "Open NRG"}: ${actionUrl}` : ""].filter(Boolean).join("\n\n");
  return { html, text };
}

let transport: nodemailer.Transporter | null = null;
function smtp() {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  if (!transport) {
    const port = Number(process.env.SMTP_PORT ?? 587);
    transport = nodemailer.createTransport({ host: SMTP_HOST, port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
  }
  return transport;
}

export async function sendEmail(email: Email): Promise<EmailOutcome> {
  const to = (Array.isArray(email.to) ? email.to : [email.to]).filter(Boolean);
  if (to.length === 0) return "skipped";
  const { html, text } = render(email);

  const mailer = smtp();
  if (mailer) {
    try {
      await mailer.sendMail({
        from: process.env.MAIL_FROM ?? `NRG Platform <${process.env.SMTP_USER}>`,
        // One message per recipient, so students never see each other's addresses.
        to: to.length === 1 ? to[0] : undefined,
        bcc: to.length > 1 ? to : undefined,
        subject: email.subject,
        html,
        text,
      });
      return "sent";
    } catch (e) {
      console.error("sendEmail: SMTP send failed", (e as Error).message);
      return "failed";
    }
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) return "skipped";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.RESEND_FROM ?? "NRG Platform <onboarding@resend.dev>", to, subject: email.subject, html, text }),
    });
    if (!res.ok) {
      console.error("sendEmail: Resend rejected the message", res.status, await res.text());
      return "failed";
    }
    return "sent";
  } catch (e) {
    console.error("sendEmail: could not reach Resend", e);
    return "failed";
  }
}
