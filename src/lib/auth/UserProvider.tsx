"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { isRole, type Role, type Tier } from "./roles";

export type ClientProfile = {
  role: Role;
  subscription_tier: Tier;
  full_name: string | null;
};

type UserContextValue = {
  user: User | null;
  profile: ClientProfile | null;
  loading: boolean;
  /** Re-fetch the profile row (e.g. after an admin changes a role). */
  refresh: () => Promise<void>;
};

const UserContext = createContext<UserContextValue>({
  user: null,
  profile: null,
  loading: true,
  refresh: async () => {},
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(u: User | null) {
    if (!u) {
      setProfile(null);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("role, subscription_tier, full_name")
      .eq("id", u.id)
      .single();
    setProfile(data && isRole(data.role) ? (data as ClientProfile) : null);
  }

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getUser().then(async ({ data: { user: u } }) => {
      if (cancelled) return;
      setUser(u);
      await loadProfile(u);
      if (!cancelled) setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      await loadProfile(u);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const value = useMemo<UserContextValue>(
    () => ({ user, profile, loading, refresh: () => loadProfile(user) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, profile, loading]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export const useUser = () => useContext(UserContext);
