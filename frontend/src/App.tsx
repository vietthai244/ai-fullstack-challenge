// frontend/src/App.tsx
//
// Phase 8 (UI-01/UI-03): App shell — route tree + bootstrap.
// useBootstrap() is called unconditionally at top level — runs on ALL routes, not just /login.
// Toaster is mounted at root so Phase 9 toast calls work from any component.
// Phase 8 renders no pages — LoginPage and CampaignsLayout are Phase 9 placeholders.
import { Routes, Route, Navigate } from 'react-router-dom';
import { useBootstrap } from '@/hooks/useBootstrap';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Toaster } from '@/components/ui/sonner';

// Phase 9 placeholders — prevent import errors; replaced in Phase 9
function LoginPage(): React.ReactElement {
  return <div data-testid="login-page">Login (Phase 9)</div>;
}

function AppShell(): React.ReactElement {
  return <div data-testid="app-shell">App (Phase 9)</div>;
}

export default function App(): React.ReactElement {
  // Bootstrap fires /auth/refresh → /auth/me on mount.
  // Must be here (not in LoginPage) to run on every route.
  useBootstrap();

  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </>
  );
}
