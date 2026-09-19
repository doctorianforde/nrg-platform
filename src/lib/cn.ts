/** Tiny classnames joiner (clsx-style, dependency-free). */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
