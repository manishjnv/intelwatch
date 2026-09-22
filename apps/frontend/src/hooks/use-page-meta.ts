/**
 * @module hooks/use-page-meta
 * @description Keeps <title>, description, canonical and OG/Twitter tags in sync with the
 * current route during client-side navigation. First paint of public pages gets the same
 * tags from scripts/prerender.mjs, so crawlers never depend on this running.
 */
import { useEffect } from 'react';
import { HOME_META, canonicalUrl, findRouteMeta, normalizePath, type PublicRouteMeta } from '@/seo/public-routes';

function setMeta(doc: Document, attr: 'name' | 'property', key: string, content: string): void {
  let el = doc.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = doc.createElement('meta');
    el.setAttribute(attr, key);
    doc.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(doc: Document, href: string): void {
  let el = doc.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = doc.createElement('link');
    el.setAttribute('rel', 'canonical');
    doc.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/** Applies route meta to the document head. Exported for tests. */
export function applyPageMeta(meta: PublicRouteMeta, path: string, doc: Document = document): void {
  const url = canonicalUrl(path);
  const socialTitle = meta.socialTitle ?? meta.title;
  const socialDescription = meta.socialDescription ?? meta.description;
  doc.title = meta.title;
  setMeta(doc, 'name', 'description', meta.description);
  setCanonical(doc, url);
  setMeta(doc, 'property', 'og:title', socialTitle);
  setMeta(doc, 'property', 'og:description', socialDescription);
  setMeta(doc, 'property', 'og:url', url);
  setMeta(doc, 'name', 'twitter:title', socialTitle);
  setMeta(doc, 'name', 'twitter:description', socialDescription);
}

/** Public routes get their own meta; app routes (noindexed) fall back to site defaults. */
export function usePageMeta(pathname: string): void {
  useEffect(() => {
    const path = normalizePath(pathname);
    applyPageMeta(findRouteMeta(path) ?? HOME_META, path);
  }, [pathname]);
}
