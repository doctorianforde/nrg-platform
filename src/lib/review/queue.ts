import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { applyFilters, type Filters } from "./filters";

type Db = SupabaseClient<Database>;

// !inner is only needed so the cluster filter can constrain the topics embed; callers only read `id`,
// and the typed select parser rejects a union of select strings, hence the narrowing cast.
const idSelect = (f: Filters) => (f.cluster ? "id, topics!inner(cluster_id)" : "id") as "id";

/** Next question (by id) inside the current filter set, wrapping around; null when the set is empty. */
export async function findNextId(supabase: Db, f: Filters, currentId: string): Promise<string | null> {
  const after = await applyFilters(supabase.from("questions").select(idSelect(f)), f)
    .gt("id", currentId)
    .order("id")
    .limit(1);
  if (after.data?.length) return after.data[0].id;
  const wrapped = await applyFilters(supabase.from("questions").select(idSelect(f)), f)
    .neq("id", currentId)
    .order("id")
    .limit(1);
  return wrapped.data?.[0]?.id ?? null;
}

/** 1-based position of `currentId` within the filtered set (by id order) and the set size. */
export async function findPosition(supabase: Db, f: Filters, currentId: string) {
  const [upTo, all] = await Promise.all([
    applyFilters(supabase.from("questions").select(idSelect(f), { count: "exact", head: true }), f).lte("id", currentId),
    applyFilters(supabase.from("questions").select(idSelect(f), { count: "exact", head: true }), f),
  ]);
  return { position: upTo.count ?? 0, total: all.count ?? 0 };
}
