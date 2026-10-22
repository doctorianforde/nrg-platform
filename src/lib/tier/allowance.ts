import { createClient } from "@/lib/supabase/server";

/**
 * Free-tier limits (migration 20261022120000). `limited` is false for staff, standard/premium students, and everyone
 * while tier_config.limits_live = 0. The database enforces the limits; this is only for showing them.
 */
export type Allowance = {
  limited: boolean;
  limit: number | null;
  used: number | null;
  remaining: number | null;
  mockExams: boolean;
};

const UNLIMITED: Allowance = { limited: false, limit: null, used: null, remaining: null, mockExams: true };

/** Server-side: the signed-in user's practice allowance for today. Falls back to unlimited on a database without the
 *  migration (the database would not enforce anything there either). */
export async function getAllowance(): Promise<Allowance> {
  const { data, error } = await createClient().rpc("practice_allowance");
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return UNLIMITED;
  const d = data as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  return {
    limited: d.limited === true,
    limit: num(d.limit),
    used: num(d.used),
    remaining: num(d.remaining),
    mockExams: d.mock_exams !== false,
  };
}
