import { Link } from 'react-router-dom';
import { ArrowLeft, BellRing, Palette } from 'lucide-react';
import { useThemeStore } from '../store/themeStore';
import ThemeToggle from '../components/ThemeToggle';
import NotificationsToggle from '../components/NotificationsToggle';

export default function AppSettingsPage() {
  const { theme } = useThemeStore();

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
      <Link to="/menu" className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        <ArrowLeft size={14} /> Back to account
      </Link>

      <header className="mt-6 anim-fade-up">
        <p className="eyebrow">Preferences</p>
        <h1 className="font-serif text-4xl sm:text-5xl mt-2">App Settings</h1>
        <p className="mt-2 text-base" style={{ color: 'var(--color-text-secondary)' }}>
          How Tefillah looks and behaves on this device.
        </p>
      </header>

      <section className="mt-8 surface-card p-6 sm:p-8 anim-fade-up delay-100">
        <div className="flex items-center gap-2 eyebrow mb-4">
          <Palette size={14} /> Appearance
        </div>
        <div className="flex items-center justify-between py-2">
          <div>
            <p className="font-medium">Theme</p>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {theme === 'dark' ? 'Dark mode' : 'Light mode'}
            </p>
          </div>
          <ThemeToggle />
        </div>
      </section>

      <section className="mt-6 surface-card p-6 sm:p-8 anim-fade-up delay-200">
        <div className="flex items-center gap-2 eyebrow mb-4">
          <BellRing size={14} /> Notifications
        </div>
        <NotificationsToggle />
      </section>
    </div>
  );
}
