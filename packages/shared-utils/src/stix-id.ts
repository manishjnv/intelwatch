import { randomUUID } from 'node:crypto';
export function generateStixId(stixType: string): string { return `${stixType}--${randomUUID()}`; }
export function isValidStixId(id: string): boolean {
  return /^[a-z][a-z0-9-]+--[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
}
export function extractStixType(id: string): string | null { const m = id.match(/^([a-z][a-z0-9-]+)--/); return m ? m[1] ?? null : null; }
