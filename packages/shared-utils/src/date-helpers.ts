export function formatDate(input: Date | string | number): string {
  if (typeof input === 'string') { const p = new Date(input); if (isNaN(p.getTime())) throw new Error(`Invalid date string: ${input}`); return p.toISOString(); }
  if (typeof input === 'number') { const ms = input < 1e12 ? input * 1000 : input; return new Date(ms).toISOString(); }
  return input.toISOString();
}
export function parseDate(input: string | number): Date {
  if (typeof input === 'number') { const ms = input < 1e12 ? input * 1000 : input; return new Date(ms); }
  const d = new Date(input); if (isNaN(d.getTime())) throw new Error(`Cannot parse date: ${input}`); return d;
}
export function getDateKey(date: Date = new Date()): string { return date.toISOString().slice(0, 10); }
export function subDays(days: number, from: Date = new Date()): Date { const r = new Date(from); r.setDate(r.getDate() - days); return r; }
export function addDays(days: number, from: Date = new Date()): Date { const r = new Date(from); r.setDate(r.getDate() + days); return r; }
export function daysBetween(start: Date | string, end: Date | string = new Date()): number {
  const s = typeof start === 'string' ? new Date(start) : start;
  const e = typeof end === 'string' ? new Date(end) : end;
  return Math.floor((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
}
export function isOlderThan(date: Date | string, days: number): boolean { return daysBetween(date) >= days; }
export function nowISO(): string { return new Date().toISOString(); }
