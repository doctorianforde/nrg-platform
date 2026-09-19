/** Display-only: "knowledge" -> "Knowledge". Stored/filter values stay lowercase. */
export const capitalize = (s: string | null | undefined): string =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
