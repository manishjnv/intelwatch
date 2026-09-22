// Run: node --test apps/frontend/scripts/   (outside vitest — vitest.config.ts only includes src/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeStyleBlocks, escapeAttr, injectHead, injectRoot, outputPathFor } from './prerender-lib.mjs';

const TEMPLATE = `<!doctype html><html><head>
<title>Old</title>
<meta name="description" content="old desc" />
<link rel="canonical" href="https://intelwatch.in/" />
<meta property="og:title" content="old og" />
<meta property="og:description" content="old og desc" />
<meta property="og:url" content="https://intelwatch.in/" />
<meta name="twitter:title" content="old tw" />
<meta name="twitter:description" content="old tw desc" />
</head><body><div id="root"></div></body></html>`;

test('injectHead rewrites title, description, canonical, OG and twitter tags', () => {
  const html = injectHead(TEMPLATE, { path: '/pricing', title: 'Pricing', description: 'Plans & prices' }, 'https://intelwatch.in/pricing');
  assert.match(html, /<title>Pricing<\/title>/);
  assert.match(html, /name="description" content="Plans &amp; prices"/);
  assert.match(html, /rel="canonical" href="https:\/\/intelwatch.in\/pricing"/);
  assert.match(html, /property="og:title" content="Pricing"/);
  assert.match(html, /property="og:url" content="https:\/\/intelwatch.in\/pricing"/);
  assert.match(html, /name="twitter:description" content="Plans &amp; prices"/);
  assert.doesNotMatch(html, /old/);
});

test('injectHead prefers social title/description for OG and twitter', () => {
  const html = injectHead(TEMPLATE, { path: '/', title: 'T', description: 'D', socialTitle: 'ST', socialDescription: 'SD' }, 'https://intelwatch.in/');
  assert.match(html, /<title>T<\/title>/);
  assert.match(html, /property="og:title" content="ST"/);
  assert.match(html, /name="twitter:description" content="SD"/);
});

test('injectHead escapes attribute and title values', () => {
  const html = injectHead(TEMPLATE, { path: '/', title: 'A <b> & "c"', description: '"q"' }, 'https://intelwatch.in/');
  assert.match(html, /<title>A &lt;b&gt; &amp; "c"<\/title>/);
  assert.match(html, /name="description" content="&quot;q&quot;"/);
});

test('injectHead throws when a tag is missing from the template', () => {
  assert.throws(() => injectHead(TEMPLATE.replace(/<meta property="og:url"[^>]*>/, ''), { path: '/', title: 't', description: 'd' }, 'u'), /og:url/);
});

test('injectRoot fills #root and rejects empty markup', () => {
  assert.match(injectRoot(TEMPLATE, '<h1>x</h1>'), /<div id="root"><h1>x<\/h1><\/div>/);
  assert.throws(() => injectRoot(TEMPLATE, '  '), /empty markup/);
  assert.throws(() => injectRoot('<div id="root"><p></p></div>', '<h1>x</h1>'), /exactly one/);
});

test('decodeStyleBlocks decodes entities inside <style> only', () => {
  const input = `<style>a{font-family:&#x27;SF Pro&#x27;} b&gt;c{content:&quot;x&quot;} d&amp;e{}</style><p>&lt;keep&gt; &#x27;</p>`;
  assert.equal(
    decodeStyleBlocks(input),
    `<style>a{font-family:'SF Pro'} b>c{content:"x"} d&e{}</style><p>&lt;keep&gt; &#x27;</p>`,
  );
});

test('decodeStyleBlocks refuses content that would close the style element', () => {
  assert.throws(() => decodeStyleBlocks('<style>&lt;/style&gt;</style>'), /<\/style/);
});

test('outputPathFor maps routes to dist files', () => {
  assert.equal(outputPathFor('/'), 'home.html');
  assert.equal(outputPathFor('/pricing'), 'pricing/index.html');
  assert.equal(outputPathFor('/features/threat-graph'), 'features/threat-graph/index.html');
  for (const bad of ['/../etc', '/Pricing', '/a/', 'pricing', '/a b']) assert.throws(() => outputPathFor(bad));
});

test('escapeAttr escapes quotes, angle brackets and ampersands', () => {
  assert.equal(escapeAttr(`<"&">`), '&lt;&quot;&amp;&quot;&gt;');
});
