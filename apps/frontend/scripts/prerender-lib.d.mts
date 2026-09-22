// Types for prerender-lib.mjs so TS tests under src/ can import it.
export interface PrerenderRouteMeta {
  path: string;
  title: string;
  description: string;
  socialTitle?: string;
  socialDescription?: string;
}
export function escapeAttr(value: unknown): string;
export function escapeText(value: unknown): string;
export function injectHead(template: string, meta: PrerenderRouteMeta, canonical: string): string;
export function injectRoot(template: string, appHtml: string): string;
export function decodeStyleBlocks(html: string): string;
export function outputPathFor(routePath: string): string;
