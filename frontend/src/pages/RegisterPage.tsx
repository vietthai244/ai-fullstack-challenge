// frontend/src/pages/RegisterPage.tsx
//
// Phase 10.1 (UI-02/UI-04): Registration page.
// Mirrors LoginPage structure — same container, shadcn components, mutation pattern.
// Auto-login on success: dispatch setAuth → navigate('/campaigns') (D-11).
// Access token dispatched to Redux memory only — never localStorage (T-10.1-06).
import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useDispatch } from 'react-redux';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '@/lib/apiClient';
import { setAuth } from '@/store/authSlice';
import type { AppDispatch } from '@/store/index';
import { RegisterSchema, type RegisterInput } from '@campaign/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export function RegisterPage(): React.ReactElement {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(RegisterSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  const registerMutation = useMutation({
    mutationFn: (data: RegisterInput) =>
      api.post<{ data: { accessToken: string; user: { id: number; email: string; name: string } } }>(
        '/auth/register',
        data,
      ),
    onSuccess: (res) => {
      dispatch(setAuth({ accessToken: res.data.data.accessToken, user: res.data.data.user }));
      navigate('/campaigns');
    },
  });

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-4 px-4">
        <h1 className="text-center text-2xl font-semibold">Campaign Manager</h1>
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Create your account</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleSubmit((data) => registerMutation.mutate(data))}
              className="space-y-4"
            >
              <div className="space-y-1">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  type="text"
                  autoComplete="name"
                  {...register('name')}
                />
                {errors.name && (
                  <p className="text-destructive text-sm">{errors.name.message}</p>
                )}
              </div>
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
                  autoComplete="new-password"
                  {...register('password')}
                />
                {errors.password && (
                  <p className="text-destructive text-sm">{errors.password.message}</p>
                )}
              </div>
              {registerMutation.isError && (
                <p className="text-destructive text-sm">
                  {registerMutation.error instanceof Error
                    ? registerMutation.error.message
                    : 'Registration failed'}
                </p>
              )}
              <Button
                type="submit"
                variant="default"
                className="w-full"
                disabled={registerMutation.isPending}
              >
                {registerMutation.isPending ? 'Creating account...' : 'Create account'}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="underline hover:text-foreground">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
