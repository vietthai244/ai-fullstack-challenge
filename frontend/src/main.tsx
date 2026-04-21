// frontend/src/main.tsx
//
// Phase 8 (UI-01): React 18 app entry point.
// Provider nesting order is CRITICAL:
//   Redux (Provider) outermost — apiClient reads store at module scope before React mounts.
//   React Query (QueryClientProvider) inside Redux — RQ queries use the api instance.
//   BrowserRouter inside both — routes render within provider tree.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { store } from '@/store/index';
import App from '@/App';
import '@/index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </Provider>
  </React.StrictMode>,
);
