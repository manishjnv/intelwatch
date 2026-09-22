/**
 * @module seo/public-routes
 * @description Single source of truth for indexable public pages.
 * Read by usePageMeta (client navigation), scripts/prerender.mjs (static HTML per route)
 * and, later, sitemap generation. Private/app routes must never be listed here —
 * they are noindexed by apps/frontend/nginx.conf.
 */

import { PLANS, annualSavingsPercent, formatInr } from '@/data/plans';

export const SITE_URL = 'https://intelwatch.in';

export interface PublicRouteMeta {
  /** Pathname without trailing slash ('/' for home). */
  path: string;
  /** <title> and search-result title. */
  title: string;
  /** meta description, 120–160 chars. */
  description: string;
  /** og:/twitter: title — defaults to title. */
  socialTitle?: string;
  /** og:/twitter: description — defaults to description. */
  socialDescription?: string;
  /** Route-specific JSON-LD (the site-wide @graph stays in index.html). */
  jsonLd?: Record<string, unknown>;
}

const paid = PLANS.filter((p) => p.price > 0);
const maxSavings = Math.max(...paid.map(annualSavingsPercent));

/** SoftwareApplication with one Offer per plan; monthly list price, excl. GST (DECISION-030). */
function pricingJsonLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'IntelWatch ETIP',
    applicationCategory: 'SecurityApplication',
    operatingSystem: 'Web',
    url: `${SITE_URL}/pricing`,
    offers: PLANS.map((p) => ({
      '@type': 'Offer',
      name: p.name,
      price: String(p.price),
      priceCurrency: 'INR',
      url: `${SITE_URL}/pricing`,
      ...(p.price > 0 && {
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: String(p.price),
          priceCurrency: 'INR',
          unitCode: 'MON',
          valueAddedTaxIncluded: false,
        },
      }),
    })),
  };
}

export const PUBLIC_ROUTES: readonly PublicRouteMeta[] = [
  {
    path: '/',
    title: 'IntelWatch ETIP — Threat Intelligence Platform',
    description: 'Enterprise Threat Intelligence Platform — Monitor, analyze, and respond to cyber threats with AI-powered intelligence.',
    socialTitle: 'IntelWatch — Threat Intelligence Platform',
    socialDescription: 'Monitor, analyze, and respond to cyber threats: IOC search, CVE intelligence with EPSS and KEV, threat actors, threat graph and digital risk protection.',
  },
  {
    path: '/pricing',
    title: 'Pricing — IntelWatch Threat Intelligence Platform',
    description: `INR pricing: Free plan, ${paid.map((p) => `${p.name} ${formatInr(p.price)}/mo`).join(', ')}. Annual billing saves up to ${maxSavings}%. Excl. GST.`,
    jsonLd: pricingJsonLd(),
  },
];

export const HOME_META: PublicRouteMeta = PUBLIC_ROUTES[0]!;

export function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.replace(/\/+$/, '');
  return pathname || '/';
}

export function findRouteMeta(pathname: string): PublicRouteMeta | undefined {
  const path = normalizePath(pathname);
  return PUBLIC_ROUTES.find((r) => r.path === path);
}

export function canonicalUrl(path: string): string {
  return path === '/' ? `${SITE_URL}/` : `${SITE_URL}${path}`;
}
