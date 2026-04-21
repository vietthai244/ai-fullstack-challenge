// frontend/src/components/ProtectedRoute.tsx
//
// Phase 8 (UI-04): Route guard component.
// Three states:
//   bootstrapped=false → render loading skeleton (do NOT redirect yet)
//   bootstrapped=true, user=null → redirect to /login with return-to state
//   bootstrapped=true, user set → render children
// The from state encodes the React Router Location object — relative URL only,
// not a raw query param string (open redirect defense).
import { Navigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '@/store/index';
import { Skeleton } from '@/components/ui/skeleton';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps): React.ReactElement {
  const { bootstrapped, user } = useSelector((s: RootState) => s.auth);
  const location = useLocation();

  // Wait for bootstrap before making redirect decision — prevents flash redirect
  if (!bootstrapped) {
    return (
      <div
        className="flex h-dvh items-center justify-center"
        aria-label="Loading application"
      >
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
    );
  }

  // Bootstrap complete, no authenticated user — redirect to /login
  // Preserve current location in state.from so login page can redirect back
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Authenticated — render the protected content
  return <>{children}</>;
}
