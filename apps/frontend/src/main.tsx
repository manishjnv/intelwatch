import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { notifyApiError } from './hooks/useApiError';
import './globals.css';

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (err, query) => {
      notifyApiError(err, String(query.meta?.resource ?? query.queryKey[0]), undefined);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const tree = (
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);

// Public pages ship prerendered markup (scripts/prerender.mjs) — hydrate it instead of
// replacing it. The SPA shell (index.html) has an empty #root and takes the createRoot path.
const rootEl = document.getElementById('root')!;
if (rootEl.hasChildNodes()) {
  ReactDOM.hydrateRoot(rootEl, tree);
} else {
  ReactDOM.createRoot(rootEl).render(tree);
}
