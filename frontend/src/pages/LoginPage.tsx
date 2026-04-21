// frontend/src/pages/LoginPage.tsx
//
// Phase 9 (UI-02): Login page.
// Access token dispatched to Redux memory (never localStorage — T-09-02-02 defense).
// Return-to URL read from React Router location.state.from — relative path only (open redirect defense).
// Error displayed inline below form (not toast) — login errors are user-facing credential feedback.
import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useDispatch } from 'react-redux';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { api } from '@/lib/apiClient';
import { setAuth } from '@/store/authSlice';
import type { AppDispatch } from '@/store/index';
import { LoginSchema, type LoginInput } from '@campaign/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export function LoginPage(): React.ReactElement {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const location = useLocation();
  // Read return-to path from ProtectedRoute state.from — only use pathname (relative path).
  // Fall back to /campaigns. Never redirect to an absolute URL (open redirect defense).
  const from =
    (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/campaigns';

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: '', password: '' },
  });

  const loginMutation = useMutation({
    mutationFn: (data: LoginInput) =>
      api.post<{ data: { accessToken: string; user: { id: number; email: string; name: string } } }>(
        '/auth/login',
        data,
      ),
    onSuccess: (res) => {
      // Store token in Redux memory only — NEVER localStorage or sessionStorage (T-09-02-02).
      dispatch(setAuth({ accessToken: res.data.data.accessToken, user: res.data.data.user }));
      navigate(from, { replace: true });
    },
  });

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-4 px-4">
        <h1 className="text-center text-2xl font-semibold">Campaign Manager</h1>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Log in to your account</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleSubmit((data) => loginMutation.mutate(data))}
              className="space-y-4"
            >
              <div className="space-y-1">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  {...register('email')}
                />
                {errors.email && (
                  <p className="text-destructive text-sm">{errors.email.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  {...register('password')}
                />
                {errors.password && (
                  <p className="text-destructive text-sm">{errors.password.message}</p>
                )}
              </div>
              {loginMutation.isError && (
                <p className="text-destructive text-sm">
                  {(() => {
                    const err = loginMutation.error as import('axios').AxiosError<{
                      error?: { message?: string };
                    }>;
                    return err?.response?.data?.error?.message === 'INVALID_CREDENTIALS'
                      ? 'Invalid email or password.'
                      : 'Something went wrong. Please try again.';
                  })()}
                </p>
              )}
              <Button
                type="submit"
                variant="default"
                className="w-full"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? 'Logging in...' : 'Log in'}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="text-center text-sm text-muted-foreground">
          Don't have an account?{' '}
          <Link to="/register" className="underline hover:text-foreground">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
