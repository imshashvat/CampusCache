export const BRANCHES = [
  "CSE",
  "IT",
  "ECE",
  "ECE VLSI",
  "ME",
  "AI",
  "DS",
  "Biotech",
  "AI/ML",
] as const;

export const YEARS = [1, 2, 3, 4] as const;
export const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export const FILE_TYPES = [
  { value: "notes", label: "Notes", color: "oklch(0.78 0.16 175)" },
  { value: "ppt", label: "PPT", color: "oklch(0.72 0.20 25)" },
  { value: "assignment", label: "Assignment", color: "oklch(0.75 0.16 145)" },
  { value: "lab", label: "Lab File", color: "oklch(0.68 0.18 240)" },
  { value: "pyq", label: "PYQ", color: "oklch(0.68 0.22 295)" },
  { value: "other", label: "Other", color: "oklch(0.72 0.04 200)" },
] as const;

export type FileTypeValue = (typeof FILE_TYPES)[number]["value"];

export const fileTypeLabel = (v: string) =>
  FILE_TYPES.find((t) => t.value === v)?.label ?? v;
export const fileTypeColor = (v: string) =>
  FILE_TYPES.find((t) => t.value === v)?.color ?? "oklch(0.72 0.04 200)";

export const formatBytes = (b?: number | null) => {
  if (!b) return "—";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = b;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
};
