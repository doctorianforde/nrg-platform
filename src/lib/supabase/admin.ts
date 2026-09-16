import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Server-only. Uses the service_role key — bypasses Row Level Security.
// Never import from client components or expose the result to the browser.
export const adminClient = createSupabaseClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
