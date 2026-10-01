import { RRule, rrulestr } from "rrule";

export function isRRule(interval: string): boolean {
  return interval.trim().toUpperCase().startsWith("RRULE:");
}

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
  }
}

export function validateRecurrence(interval: string): boolean {
  if (!interval || interval.trim().length === 0) return false;
  if (isRRule(interval)) return validateRRule(interval);
  return validateSimpleInterval(interval);
}

function validateSimpleInterval(interval: string): boolean {
  const parsed = parseInterval(interval);
  if (!parsed) return false;
  const minutes = intervalToMinutes(parsed.value, parsed.unit);
  if (minutes < 60) return false;
  const maxMinutes = 100 * 365 * 24 * 60;
  if (minutes > maxMinutes) return false;
  return true;
}

function validateRRule(rule: string): boolean {
  try {
    const parsed = rrulestr(rule, { forceset: false });
    const opts = parsed.options;

    if (opts.freq === undefined || opts.freq === null) return false;
    if (opts.freq > RRule.HOURLY) return false;

    return true;
  } catch {
    return false;
  }
}

const MAX_ITERATIONS = 5000;

export function getNextRecurringDate(dateEvent: Date, interval: string): Date {
  const now = new Date();

  if (isRRule(interval)) {
    return getNextByRRule(dateEvent, interval, now);
  }

  return getNextBySimpleInterval(dateEvent, interval, now);
}

function getNextByRRule(dateEvent: Date, ruleStr: string, now: Date): Date {
  try {
    const rule = rrulestr(ruleStr, { dtstart: dateEvent });

    if (dateEvent >= now) return dateEvent;

    const next = rule.after(now, false);
    return next ?? dateEvent;
  } catch {
    return dateEvent;
  }
}

function getNextBySimpleInterval(
  dateEvent: Date,
  interval: string,
  now: Date,
): Date {
  const parsed = parseInterval(interval);
  if (!parsed) return dateEvent;

  let next = new Date(dateEvent);
  if (next >= now) return next;

  const { value, unit } = parsed;
  let iterations = 0;

  while (next < now && iterations < MAX_ITERATIONS) {
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
    iterations++;
  }
  return next;
}
