// frontend/src/components/NavBar.tsx
//
// Phase 10.1 (UI-03): Top navigation bar rendered inside all protected routes.
// Appears on /campaigns, /campaigns/new, /campaigns/:id — NOT on /login or /register.
// Logout: POST /api/auth/logout → dispatch clearAuth() → toast → navigate('/login').
// D-04 through D-08 implementation.
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { toast } from 'sonner';
import { api } from '@/lib/apiClient';
import { clearAuth } from '@/store/authSlice';
import type { AppDispatch } from '@/store/index';
import { Button } from '@/components/ui/button';

export function NavBar(): React.ReactElement {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();

  async function handleLogout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } catch {
      // Logout endpoint failure is non-fatal — clear local state regardless
    }
    dispatch(clearAuth());
    toast('You\'ve been logged out');
    navigate('/login');
  }

  return (
    <nav className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-screen-xl items-center justify-between px-4">
        {/* Left: app title — links to campaign list (D-05) */}
        <Link
          to="/campaigns"
          className="text-lg font-semibold tracking-tight hover:opacity-80"
        >
          Campaign Manager
        </Link>

        {/* Right: nav links + logout (D-05) */}
        <div className="flex items-center gap-4">
          <Link
            to="/campaigns"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Campaigns
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleLogout()}
          >
            Logout
          </Button>
        </div>
      </div>
    </nav>
  );
}
