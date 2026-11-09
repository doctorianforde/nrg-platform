import { createHash } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";

/**
 * Receipt check (R11), run on the server right after a request is created. Free and local: nothing leaves Supabase.
 * It never blocks a submission and never reports "clear" when it could not run ("error" instead).
 *
 *  1. The file's real type from its first bytes (JPEG, PNG, PDF).
 *  2. AI-generation markers, searched only inside metadata (XMP packets, PDF Producer/Creator, C2PA claims), so a
 *     receipt whose text happens to say "Gemini" is not flagged.
 *  3. The same file (SHA-256) on another student's request, or on an approved one.
 *  4. The same payment reference (normalised) on another student's request, or on an approved one.
 * A student resubmitting their own receipt after a rejection is the normal flow and is not flagged.
 *
 * "Nothing found" is not proof: a screenshot or a hand-edited receipt carries no markers. The real check is finding
 * the payment on the bank statement (R5).
 */

export type ReceiptCheck = { result: "clear" | "flagged" | "error"; warnings: string[]; checkedAt: string };

const SOURCE_TYPES = ["trainedAlgorithmicMedia", "compositeWithTrainedAlgorithmicMedia", "compositeSynthetic", "algorithmicMedia"];
const GENERATORS = ["ChatGPT", "OpenAI", "DALL-E", "DALL·E", "gpt-image", "Gemini", "Imagen", "Midjourney", "Firefly", "Stable Diffusion", "Ideogram", "FLUX", "Grok", "Copilot", "Nano Banana"];

function realType(buf: Buffer): "jpeg" | "png" | "pdf" | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  return null;
}

/** The metadata parts of a file, as text: XMP packets, PDF info entries, and the area around any C2PA manifest. */
function metadataText(buf: Buffer): string {
  const raw = buf.toString("latin1");
  const parts: string[] = [];
  Array.from(raw.matchAll(/<x:xmpmeta[\s\S]*?<\/x:xmpmeta>/g)).forEach((m) => parts.push(m[0]));
  Array.from(raw.matchAll(/\/(?:Producer|Creator)\s*\(([^)]{0,300})\)/g)).forEach((m) => parts.push(m[1]));
  let i = raw.indexOf("c2pa");
  let n = 0;
  while (i !== -1 && n < 20) {
    parts.push(raw.slice(Math.max(0, i - 200), i + 4000));
    i = raw.indexOf("c2pa", i + 4000);
    n++;
  }
  return parts.join("\n");
}

export function inspectReceiptBytes(buf: Buffer): string[] {
  const warnings: string[] = [];
  if (!realType(buf)) warnings.push("The file is not a real JPEG, PNG or PDF, whatever its name says.");
  const meta = metadataText(buf);
  const source = SOURCE_TYPES.find((t) => meta.includes(t));
  if (source) warnings.push(`The file's metadata says it was made by AI ("${source}").`);
  const gen = GENERATORS.find((g) => new RegExp(`(?<![A-Za-z])${g.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z])`, "i").test(meta));
  if (gen) warnings.push(`The file's metadata names an AI image tool (${gen}).`);
  if (/c2pa/i.test(meta) && !source && !gen) warnings.push("The file carries content credentials (C2PA); open the receipt and check how it was made.");
  return warnings;
}

/** Run the check for one request and save the result on it. Never throws. */
export async function checkReceipt(requestId: string): Promise<ReceiptCheck> {
  const save = async (check: ReceiptCheck, sha?: string) => {
    await adminClient.from("membership_requests").update({ receipt_check: check, ...(sha ? { receipt_sha256: sha } : {}) } as never).eq("id", requestId);
    return check;
  };
  try {
    const { data: req, error } = await adminClient
      .from("membership_requests")
      .select("id, user_id, receipt_path, reference_norm")
      .eq("id", requestId)
      .single();
    if (error || !req) throw new Error("request not found");
    const r = req as unknown as { id: string; user_id: string; receipt_path: string; reference_norm: string };
    const file = await adminClient.storage.from("payment-receipts").download(r.receipt_path);
    if (file.error || !file.data) throw new Error("receipt could not be read");
    const buf = Buffer.from(await file.data.arrayBuffer());
    const warnings = inspectReceiptBytes(buf);
    const sha = createHash("sha256").update(buf).digest("hex");

    // Reuse: only another student's request, or one already approved, counts (R11).
    const others = async (column: "receipt_sha256" | "reference_norm", value: string) => {
      const { data } = await adminClient
        .from("membership_requests")
        .select("id, user_id, status")
        .eq(column as never, value)
        .neq("id", r.id);
      return ((data ?? []) as unknown as { user_id: string; status: string }[]).filter((x) => x.user_id !== r.user_id || x.status === "approved");
    };
    if ((await others("receipt_sha256", sha)).length) warnings.push("The same receipt file was used on another request.");
    if (r.reference_norm.length >= 4 && (await others("reference_norm", r.reference_norm)).length) {
      warnings.push("The same payment reference was used on another request.");
    }
    return await save({ result: warnings.length ? "flagged" : "clear", warnings, checkedAt: new Date().toISOString() }, sha);
  } catch (e) {
    return save({ result: "error", warnings: [`The check could not run: ${(e as Error).message}.`], checkedAt: new Date().toISOString() });
  }
}
