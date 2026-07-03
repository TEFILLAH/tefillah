import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

interface Props {
  children: React.ReactNode;
  requirePartner?: boolean;
}

/**
 * Gates main + partner routes. While auth is hydrating, shows a spinner;
 * once hydrated, redirects unauthenticated visitors to the landing page,
 * and partner-only routes redirect logged-in users to the home page.
 */
export default function ProtectedRoute({ children, requirePartner = false }: Props) {
  const { token, userType, isInitialized } = useAuthStore();

  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin" style={{ color: 'var(--color-accent)' }} />
      </div>
    );
  }

  if (!token || !userType) {
    return <Navigate to="/" replace />;
  }

  if (requirePartner && userType !== 'partner') {
    return <Navigate to="/home" replace />;
  }

  if (!requirePartner && userType === 'partner') {
    // Partners belong on the partner dashboard, not the user-only screens.
    return <Navigate to="/partner/dashboard" replace />;
  }

  return <>{children}</>;
}
