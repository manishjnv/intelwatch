/**
 * @module entry-server
 * @description Build-time prerender entry (never shipped to browsers).
 * Built with `vite build --ssr src/entry-server.tsx`, consumed by scripts/prerender.mjs.
 * Renders the same tree as main.tsx (minus BrowserRouter) so hydrateRoot sees matching markup.
 */
import React from 'react';
import { renderToPipeableStream } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Writable } from 'node:stream';
import { App } from './App';

export { PUBLIC_ROUTES, canonicalUrl } from './seo/public-routes';

/** Renders a route to HTML, waiting for lazy chunks and Suspense boundaries to resolve. */
export function render(url: string): Promise<string> {
  const queryClient = new QueryClient();
  return new Promise((resolve, reject) => {
    let html = '';
    const sink = new Writable({
      write(chunk: Buffer, _enc, cb) { html += chunk.toString(); cb(); },
      final(cb) { resolve(html); cb(); },
    });
    const { pipe } = renderToPipeableStream(
      <React.StrictMode>
        <QueryClientProvider client={queryClient}>
          <StaticRouter location={url}>
            <App />
          </StaticRouter>
        </QueryClientProvider>
      </React.StrictMode>,
      {
        onAllReady() { pipe(sink); },
        onShellError: reject,
        onError: reject,
      },
    );
  });
}
