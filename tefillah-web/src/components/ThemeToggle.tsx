import { Moon, Sun } from 'lucide-react';
import { useThemeStore } from '../store/themeStore';

export default function ThemeToggle({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const { theme, toggle } = useThemeStore();
  const isDark = theme === 'dark';

  const dim = size === 'sm' ? 18 : 20;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="inline-flex items-center justify-center rounded-full transition-colors"
      style={{
        width: size === 'sm' ? '2rem' : '2.5rem',
        height: size === 'sm' ? '2rem' : '2.5rem',
        background: 'var(--color-bg-elev)',
        border: '1px solid var(--color-border-strong)',
        color: 'var(--color-text)',
      }}
    >
      {isDark ? <Sun size={dim} strokeWidth={1.6} /> : <Moon size={dim} strokeWidth={1.6} />}
    </button>
  );
}
