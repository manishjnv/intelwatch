/**
 * Pure string helpers for scripts/prerender.mjs (tested by prerender-lib.test.mjs via `node --test`).
 * Every replacement must match exactly once — a template drift fails the build loudly
 * instead of shipping a page with the wrong <head>.
 */

const ATTR_ESCAPES = { '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' };

export function escapeAttr(value) {
  return String(value).replace(/[&"<>]/g, (c) => ATTR_ESCAPES[c]);
}

export function escapeText(value) {
  return String(value).replace(/[&<>]/g, (c) => ATTR_ESCAPES[c]);
}

function replaceOnce(html, pattern, replacer, label) {
  const matches = html.match(new RegExp(pattern.source, 'g'));
  if (!matches || matches.length !== 1) {
    throw new Error(`prerender: expected exactly one ${label} in template, found ${matches ? matches.length : 0}`);
  }
  return html.replace(pattern, replacer);
}

function replaceMetaContent(html, attr, key, value) {
  const pattern = new RegExp(`(<meta\\s+${attr}="${key.replace(/[.:]/g, '\\$&')}"\\s+content=")[^"]*(")`);
  return replaceOnce(html, pattern, (_m, pre, post) => `${pre}${escapeAttr(value)}${post}`, `meta[${attr}="${key}"]`);
}

/** Rewrites the template <head> for one route. `meta` follows src/seo/public-routes.ts. */
export function injectHead(template, meta, canonical) {
  const socialTitle = meta.socialTitle ?? meta.title;
  const socialDescription = meta.socialDescription ?? meta.description;
  let html = replaceOnce(template, /<title>[^<]*<\/title>/, () => `<title>${escapeText(meta.title)}</title>`, '<title>');
  html = replaceMetaContent(html, 'name', 'description', meta.description);
  html = replaceOnce(
    html,
    /(<link\s+rel="canonical"\s+href=")[^"]*(")/,
    (_m, pre, post) => `${pre}${escapeAttr(canonical)}${post}`,
    'link[rel="canonical"]',
  );
  html = replaceMetaContent(html, 'property', 'og:title', socialTitle);
  html = replaceMetaContent(html, 'property', 'og:description', socialDescription);
  html = replaceMetaContent(html, 'property', 'og:url', canonical);
  html = replaceMetaContent(html, 'name', 'twitter:title', socialTitle);
  html = replaceMetaContent(html, 'name', 'twitter:description', socialDescription);
  return html;
}

/** Places rendered app markup inside the empty #root. */
export function injectRoot(template, appHtml) {
  if (!appHtml || !appHtml.trim()) throw new Error('prerender: render() returned empty markup');
  return replaceOnce(template, /<div id="root"><\/div>/, () => `<div id="root">${appHtml}</div>`, '<div id="root"></div>');
}

const STYLE_ENTITIES = { '&#x27;': "'", '&#39;': "'", '&quot;': '"', '&lt;': '<', '&gt;': '>', '&amp;': '&' };

/**
 * React 18 server rendering HTML-escapes <style> text ('SF Pro' → &#x27;SF Pro&#x27;).
 * <style> is a raw-text element, so browsers do NOT decode entities there: the CSS breaks
 * and hydration reports a text mismatch. Decode entities inside <style> blocks only.
 */
export function decodeStyleBlocks(html) {
  return html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/g, (_m, open, css, close) => {
    const decoded = css.replace(/&#x27;|&#39;|&quot;|&lt;|&gt;|&amp;/g, (e) => STYLE_ENTITIES[e]);
    if (/<\/style/i.test(decoded)) throw new Error('prerender: decoded <style> content contains </style');
    return `${open}${decoded}${close}`;
  });
}

/**
 * dist-relative output file for a route. '/' is written to home.html (served for exactly "/"
 * by nginx.conf) so index.html stays the empty SPA shell used by private routes and 404s.
 */
export function outputPathFor(routePath) {
  if (routePath === '/') return 'home.html';
  if (!/^(\/[a-z0-9]+(?:-[a-z0-9]+)*)+$/.test(routePath)) {
    throw new Error(`prerender: unsupported route path "${routePath}"`);
  }
  return `${routePath.slice(1)}/index.html`;
}
