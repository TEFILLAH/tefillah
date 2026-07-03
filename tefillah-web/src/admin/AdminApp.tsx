import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import './admin.css';
import { useAdminAuth } from './adminAuth';
import AdminProtectedRoute from './AdminProtectedRoute';
import AdminLayout from './AdminLayout';
import AdminLoginPage from './AdminLoginPage';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import PartnersPage from './pages/PartnersPage';
import PrayersPage from './pages/PrayersPage';
import AnalyticsPage from './pages/AnalyticsPage';
import AdminsPage from './pages/AdminsPage';
import AuditLogsPage from './pages/AuditLogsPage';

/**
 * The entire /admin/* surface. Lazy-loaded from App.tsx so none of this code
 * (or its admin.css / recharts-free chart code) ships in the public bundle.
 *
 * Uses RELATIVE paths because it's mounted at `/admin/*` in the parent router.
 * The admin auth store is hydrated here on mount.
 */
export default function AdminApp() {
  const { initialize, isInitialized } = useAdminAuth();

  useEffect(() => {
    if (!isInitialized) initialize();
  }, [isInitialized, initialize]);

  return (
    <Routes>
      <Route path="login" element={<AdminLoginPage />} />
      <Route
        element={
          <AdminProtectedRoute>
            <AdminLayout />
          </AdminProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="partners" element={<PartnersPage />} />
        <Route path="prayers" element={<PrayersPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="admins" element={<AdminsPage />} />
        <Route path="audit-logs" element={<AuditLogsPage />} />
      </Route>
      {/* Anything unknown under /admin → dashboard */}
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
