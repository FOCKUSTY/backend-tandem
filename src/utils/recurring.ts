export function parseInterval(
  interval: string,
): { value: number; unit: "h" | "d" | "m" | "y" } | null {
  const match = interval.match(/^(\d+(?:\.\d+)?)([hdmy])$/);
  if (!match) return null;
  const value = parseFloat(match[1]);
  const unit = match[2] as "h" | "d" | "m" | "y";
  if (isNaN(value) || value <= 0) return null;
  return { value, unit };
}

function intervalToMinutes(value: number, unit: "h" | "d" | "m" | "y"): number {
  switch (unit) {
    case "h":
      return value * 60;
    case "d":
      return value * 24 * 60;
    case "m":
      return value * 30 * 24 * 60;
    case "y":
      return value * 365 * 24 * 60;
    default:
      return 0;
  }
}

export function validateInterval(interval: string): boolean {
  const parsed = parseInterval(interval);
  if (!parsed) return false;
  const minutes = intervalToMinutes(parsed.value, parsed.unit);
  if (minutes < 60) return false;
  const maxMinutes = 100 * 365 * 24 * 60;
  if (minutes > maxMinutes) return false;
  return true;
}

export function getNextRecurringDate(dateEvent: Date, interval: string): Date {
  const parsed = parseInterval(interval);
  if (!parsed) return dateEvent;

  const now = new Date();
  let next = new Date(dateEvent);

  if (next >= now) return next;

  const { value, unit } = parsed;
  while (next < now) {
    switch (unit) {
      case "h":
        next.setHours(next.getHours() + value);
        break;
      case "d":
        next.setDate(next.getDate() + value);
        break;
      case "m":
        next.setMonth(next.getMonth() + value);
        break;
      case "y":
        next.setFullYear(next.getFullYear() + value);
        break;
    }
  }
  return next;
}
