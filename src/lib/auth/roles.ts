export const ROLES = ["student", "teacher", "admin", "super_admin"] as const;
export type Role = (typeof ROLES)[number];

export const TIERS = ["free", "standard", "premium"] as const;
export type Tier = (typeof TIERS)[number];

// Ordered for privilege comparisons: student < teacher < admin < super_admin
const RANK: Record<Role, number> = {
  student: 0,
  teacher: 1,
  admin: 2,
  super_admin: 3,
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** True when `role` is at least as privileged as `required`. */
export function hasAtLeast(role: Role, required: Role): boolean {
  return RANK[role] >= RANK[required];
}

/** Where each role lands after login. */
export const ROLE_HOME: Record<Role, string> = {
  student: "/study",
  teacher: "/teacher",
  admin: "/admin",
  super_admin: "/super-admin",
};

/** Minimum role required for each protected route prefix. */
export const ROUTE_MIN_ROLE: Array<[prefix: string, role: Role]> = [
  ["/super-admin", "super_admin"],
  ["/admin", "admin"],
  ["/teacher", "teacher"],
  ["/study", "student"],
];

export const PROTECTED_PREFIXES = ROUTE_MIN_ROLE.map(([p]) => p);

/**
 * Only allow same-origin relative paths for post-login redirects.
 * Rejects "//evil.com", "http://…", and anything not starting with a single "/".
 */
export function sanitizeNext(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  if (/^\/[a-z]+:/i.test(next)) return null;
  return next;
}
