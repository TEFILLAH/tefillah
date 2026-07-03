import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from './auth/ProtectedRoute';
import { useAuthStore } from './store/authStore';
import { useThemeStore } from './store/themeStore';

// Admin panel is a heavy, self-contained, dark-themed surface used only by
// operators. Lazy-load it so none of its code ships in the public bundle.
const AdminApp = lazy(() => import('./admin/AdminApp'));

import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import VerifyPage from './pages/VerifyPage';
import CompleteProfilePage from './pages/CompleteProfilePage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import HomePage from './pages/HomePage';
import PrayerPage from './pages/PrayerPage';
import ConfirmationPage from './pages/ConfirmationPage';
import HistoryPage from './pages/HistoryPage';
import MenuPage from './pages/MenuPage';
import ProfileSettingsPage from './pages/ProfileSettingsPage';
import AppSettingsPage from './pages/AppSettingsPage';
import PartnerLoginPage from './pages/PartnerLoginPage';
import PartnerSignupPage from './pages/PartnerSignupPage';
import PartnerDashboardPage from './pages/PartnerDashboardPage';
import AboutPage from './pages/AboutPage';
import PrivacyPage from './pages/PrivacyPage';
import TermsPage from './pages/TermsPage';
import DeleteAccountPage from './pages/DeleteAccountPage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  const { initialize } = useAuthStore();
  const { initialize: initTheme } = useThemeStore();

  useEffect(() => {
    initTheme();
    initialize();
  }, [initialize, initTheme]);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          {/* Public surface (landing, auth, legal) */}
          <Route element={<Layout variant="public" />}>
            <Route index element={<ErrorBoundary><LandingPage /></ErrorBoundary>} />
            <Route path="login" element={<ErrorBoundary><LoginPage /></ErrorBoundary>} />
            <Route path="signup" element={<ErrorBoundary><SignupPage /></ErrorBoundary>} />
            <Route path="verify" element={<ErrorBoundary><VerifyPage /></ErrorBoundary>} />
            <Route path="complete-profile" element={<ErrorBoundary><CompleteProfilePage /></ErrorBoundary>} />
            <Route path="forgot-password" element={<ErrorBoundary><ForgotPasswordPage /></ErrorBoundary>} />
            <Route path="about" element={<ErrorBoundary><AboutPage /></ErrorBoundary>} />
            <Route path="partner/login" element={<ErrorBoundary><PartnerLoginPage /></ErrorBoundary>} />
            <Route path="partner/signup" element={<ErrorBoundary><PartnerSignupPage /></ErrorBoundary>} />
          </Route>

          {/* Legal pages — clean header (no marketing nav) + no footer */}
          <Route element={<Layout variant="public" hideNav />}>
            <Route path="privacy" element={<ErrorBoundary><PrivacyPage /></ErrorBoundary>} />
            <Route path="terms" element={<ErrorBoundary><TermsPage /></ErrorBoundary>} />
            <Route path="delete-account" element={<ErrorBoundary><DeleteAccountPage /></ErrorBoundary>} />
          </Route>

          {/* User-only (logged in, user type) */}
          <Route element={<ProtectedRoute><Layout variant="app" /></ProtectedRoute>}>
            <Route path="home" element={<ErrorBoundary><HomePage /></ErrorBoundary>} />
            <Route path="prayer" element={<ErrorBoundary><PrayerPage /></ErrorBoundary>} />
            <Route path="prayer/confirmation" element={<ErrorBoundary><ConfirmationPage /></ErrorBoundary>} />
            <Route path="history" element={<ErrorBoundary><HistoryPage /></ErrorBoundary>} />
            <Route path="menu" element={<ErrorBoundary><MenuPage /></ErrorBoundary>} />
            <Route path="profile-settings" element={<ErrorBoundary><ProfileSettingsPage /></ErrorBoundary>} />
            <Route path="app-settings" element={<ErrorBoundary><AppSettingsPage /></ErrorBoundary>} />
          </Route>

          {/* Partner-only */}
          <Route element={<ProtectedRoute requirePartner><Layout variant="app" /></ProtectedRoute>}>
            <Route path="partner/dashboard" element={<ErrorBoundary><PartnerDashboardPage /></ErrorBoundary>} />
          </Route>

          {/* Admin panel — fully self-contained at /admin/*, no public chrome */}
          <Route
            path="admin/*"
            element={
              <ErrorBoundary>
                <Suspense
                  fallback={
                    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0a0c' }}>
                      <Loader2 className="w-7 h-7 animate-spin" style={{ color: '#d4af37' }} />
                    </div>
                  }
                >
                  <AdminApp />
                </Suspense>
              </ErrorBoundary>
            }
          />

          {/* Catch-all */}
          <Route element={<Layout variant="public" />}>
            <Route path="*" element={<NotFoundPage />} />
          </Route>

          {/* /index without trailing slash */}
          <Route path="/index" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
