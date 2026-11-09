import { adminClient } from "@/lib/supabase/admin";

// Server-side only. R8: receipts are deleted 90 days after the decision, and uploads that never became a request are
// deleted after 24 hours. Called by the daily job; never throws.

const BUCKET = "payment-receipts";
const DAY = 86_400_000;

export async function cleanUpReceipts(): Promise<{ decided: number; orphans: number; errors: string[] }> {
  const out = { decided: 0, orphans: 0, errors: [] as string[] };
  const store = adminClient.storage.from(BUCKET);

  // 1. Decided 90–97 days ago (a week's window, so a missed day still gets cleaned; older ones were done already).
  try {
    const { data } = await adminClient
      .from("membership_requests")
      .select("receipt_path")
      .neq("status", "pending")
      .lt("reviewed_at", new Date(Date.now() - 90 * DAY).toISOString())
      .gte("reviewed_at", new Date(Date.now() - 97 * DAY).toISOString());
    const paths = (data ?? []).map((r) => r.receipt_path).filter(Boolean);
    if (paths.length) {
      const { data: removed, error } = await store.remove(paths);
      if (error) out.errors.push(`decided: ${error.message}`);
      out.decided = removed?.length ?? 0;
    }
  } catch (e) {
    out.errors.push(`decided: ${(e as Error).message}`);
  }

  // 2. Uploads older than 24 hours that no request points at (each student has a folder named by their id).
  try {
    const { data: folders } = await store.list("", { limit: 1000 });
    const known = new Set(
      ((await adminClient.from("membership_requests").select("receipt_path")).data ?? []).map((r) => r.receipt_path)
    );
    const stale: string[] = [];
    for (const f of (folders ?? []).filter((x) => !x.id)) {           // folders have no id
      const { data: files } = await store.list(f.name, { limit: 1000 });
      for (const file of files ?? []) {
        const path = `${f.name}/${file.name}`;
        const created = Date.parse(file.created_at ?? "");
        if (!known.has(path) && Number.isFinite(created) && Date.now() - created > DAY) stale.push(path);
      }
    }
    if (stale.length) {
      const { data: removed, error } = await store.remove(stale);
      if (error) out.errors.push(`orphans: ${error.message}`);
      out.orphans = removed?.length ?? 0;
    }
  } catch (e) {
    out.errors.push(`orphans: ${(e as Error).message}`);
  }
  return out;
}
