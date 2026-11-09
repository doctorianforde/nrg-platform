import { NextResponse } from "next/server";
import { sendExpiryReminders } from "@/lib/membership/emails";
import { cleanUpReceipts } from "@/lib/membership/cleanup";

export const dynamic = "force-dynamic";

/**
 * Daily job (vercel.json crons, 07:00 Trinidad): plan reminders 7 days and 1 day before expiry (R7) and receipt
 * cleanup (R8). Vercel sends `Authorization: Bearer $CRON_SECRET`; without CRON_SECRET set on a project the job
 * refuses to run, so a project that is not ready (e.g. prod before its migrations) does nothing.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const [reminders, receipts] = await Promise.all([
    sendExpiryReminders().catch((e) => ({ error: String(e) })),
    cleanUpReceipts().catch((e) => ({ error: String(e) })),
  ]);
  return NextResponse.json({ ok: true, at: new Date().toISOString(), reminders, receipts });
}
