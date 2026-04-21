// frontend/src/App.tsx
//
// Phase 9 (UI-01/UI-03): App shell — route tree + bootstrap.
// Phase 8 placeholder functions (LoginPage, AppShell) replaced with real page imports.
// useBootstrap() is called unconditionally at top level — runs on ALL routes, not just /login.
// Toaster is mounted at root so Phase 9 toast calls work from any component.
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useBootstrap } from '@/hooks/useBootstrap';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { NavBar } from '@/components/NavBar';
import { Toaster } from '@/components/ui/sonner';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { CampaignListPage } from '@/pages/CampaignListPage';
import { NewCampaignPage } from '@/pages/NewCampaignPage';
import { CampaignDetailPage } from '@/pages/CampaignDetailPage';

function ProtectedLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <>
      <NavBar />
      <main className="mx-auto max-w-screen-xl px-4 py-6">{children}</main>
    </>
  );
}

export default function App(): React.ReactElement {
  // Bootstrap fires /auth/refresh → /auth/me on mount.
  // Must be here (not in individual pages) to run on every route.
  useBootstrap();

  return (
    <>
      <Routes>
        {/* Public routes — accessible without auth */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Protected routes — ProtectedRoute redirects to /login if not authed */}
        <Route
          path="/campaigns"
          element={
            <ProtectedRoute>
              <ProtectedLayout>
                <CampaignListPage />
              </ProtectedLayout>
            </ProtectedRoute>
          }
        />
        {/* /campaigns/new must appear before /campaigns/:id — avoid "new" matching as id */}
        <Route
          path="/campaigns/new"
          element={
            <ProtectedRoute>
              <ProtectedLayout>
                <NewCampaignPage />
              </ProtectedLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/campaigns/:id"
          element={
            <ProtectedRoute>
              <ProtectedLayout>
                <CampaignDetailPage />
              </ProtectedLayout>
            </ProtectedRoute>
          }
        />

        {/* Default redirect — unauthenticated hits /login via ProtectedRoute on /campaigns */}
        <Route path="/" element={<Navigate to="/campaigns" replace />} />
        <Route path="*" element={<Navigate to="/campaigns" replace />} />
      </Routes>
      <Toaster />
    </>
  );
}
