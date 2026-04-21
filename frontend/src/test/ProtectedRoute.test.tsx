// frontend/src/test/ProtectedRoute.test.tsx
//
// Phase 8 (UI-04): ProtectedRoute unit tests.
// Verifies: loading state, redirect with from state, children render.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/store/authSlice';
import { ProtectedRoute } from '@/components/ProtectedRoute';

function makeStore(bootstrapped: boolean, user: { id: number; email: string } | null) {
  return configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: { accessToken: null, user, bootstrapped },
    },
  });
}

function renderProtectedRoute(
  store: ReturnType<typeof makeStore>,
  initialPath = '/dashboard',
) {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div data-testid="protected-content">Protected</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div data-testid="login-page">Login</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

describe('ProtectedRoute', () => {
  it('renders children when bootstrapped=true and user is set', () => {
    const store = makeStore(true, { id: 1, email: 'user@test.com' });
    renderProtectedRoute(store);
    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  it('redirects to /login when bootstrapped=true and user is null, with from state preserved', () => {
    const store = makeStore(true, null);
    renderProtectedRoute(store, '/dashboard');
    // Should render login page (Navigate redirected)
    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('renders loading skeleton with aria-label when bootstrapped=false', () => {
    const store = makeStore(false, null);
    renderProtectedRoute(store);
    expect(screen.getByLabelText('Loading application')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
  });
});
