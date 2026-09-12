/** Simulator clock helpers. All engine time flows through here so that
 *  "advance one day" is a single mutation and everything recomputes. */

export const MS_H = 3600_000;

export function addHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * MS_H).toISOString();
}

export function hoursBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / MS_H;
}

export function isBefore(a: string, b: string): boolean {
  return new Date(a).getTime() < new Date(b).getTime();
}

export function fmtDuration(hours: number): string {
  if (!isFinite(hours)) return "-";
  const h = Math.abs(hours);
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${h % 1 === 0 ? h : h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

export function fmtClock(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export function fmtDateOnly(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
