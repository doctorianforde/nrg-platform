export const AUDIENCES = ["self", "everyone", "students", "teachers", "selected"] as const;
export type Audience = (typeof AUDIENCES)[number];

/** What a staff member may publish to. 'self' is the private personal entry. */
export const STAFF_AUDIENCES = ["everyone", "students", "teachers", "selected", "self"] as const;

export const AUDIENCE_LABEL: Record<Audience, string> = {
  self: "Just me",
  everyone: "Everyone",
  students: "All students",
  teachers: "Teaching staff",
  selected: "Chosen students",
};

export const AUDIENCE_TONE: Record<Audience, "gray" | "purple" | "blue" | "amber" | "green"> = {
  self: "gray",
  everyone: "purple",
  students: "blue",
  teachers: "amber",
  selected: "green",
};

export type CalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
  audience: Audience;
  createdBy: string;
  authorName: string | null;
  /** Names of the chosen students, when the viewer is allowed to see them. */
  recipients: string[];
  /** Whether the current viewer may edit or remove this entry. */
  canEdit: boolean;
};

/** `YYYY-MM-DD` for a Date, in local terms — never via toISOString, which shifts. */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseMonth(value: string | undefined): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  const now = new Date();
  if (!m) return { year: now.getFullYear(), month: now.getMonth() };
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  if (year < 2000 || year > 2100 || month < 0 || month > 11) {
    return { year: now.getFullYear(), month: now.getMonth() };
  }
  return { year, month };
}

export const monthKey = (year: number, month: number) =>
  `${year}-${String(month + 1).padStart(2, "0")}`;

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "14:30:00" → "2:30 pm"; null stays null. */
export function fmtTime(value: string | null): string | null {
  if (!value) return null;
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h)) return null;
  const suffix = h < 12 ? "am" : "pm";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour}:${String(m).padStart(2, "0")} ${suffix}` : `${hour} ${suffix}`;
}

export function fmtEventWhen(e: Pick<CalendarEvent, "startTime" | "endTime">): string {
  const start = fmtTime(e.startTime);
  if (!start) return "All day";
  const end = fmtTime(e.endTime);
  return end ? `${start} – ${end}` : start;
}
