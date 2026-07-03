import { Navigate } from 'react-router-dom';
import { useAdminAuth } from './adminAuth';

/**
 * Gate for /admin/* routes. While the admin auth store hydrates, render
 * nothing (it's synchronous, so this is a single tick). Once hydrated, send
 * unauthenticated visitors to /admin/login.
 */
export default function AdminProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, isInitialized } = useAdminAuth();

  if (!isInitialized) return null;
  if (!token) return <Navigate to="/admin/login" replace />;

  return <>{children}</>;
}
