import { useEffect, useRef, useState } from 'react';
import { Loader2, Mail, Phone } from 'lucide-react';

/**
 * Animated count-up. Eases 0 → value on mount / value change (easeOutCubic).
 * Falls back to the final value instantly under prefers-reduced-motion.
 */
export function CountUp({
  value,
  duration = 950,
  format,
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
}) {
  const [display, setDisplay] = useState(0);
  const raf = useRef<number | undefined>(undefined);

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || value === 0) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(value * eased));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, duration]);

  return <>{format ? format(display) : display.toLocaleString()}</>;
}

/** A phone number rendered as a tap-to-call link, or "—" if absent. */
export function PhoneLink({ phone, compact = false }: { phone?: string | null; compact?: boolean }) {
  if (!phone) return <span className="text-gray-600">—</span>;
  const tel = phone.replace(/[^\d+]/g, '');
  return (
    <a
      href={`tel:${tel}`}
      className="inline-flex items-center gap-1.5 text-amber-400 hover:text-amber-300 hover:underline"
      title={`Call ${phone}`}
      onClick={(e) => e.stopPropagation()}
    >
      <Phone size={compact ? 12 : 14} className="shrink-0" />
      {phone}
    </a>
  );
}

/** An email rendered as a mailto: link, or "—" if absent. */
export function EmailLink({ email }: { email?: string | null }) {
  if (!email) return <span className="text-gray-600">—</span>;
  return (
    <a
      href={`mailto:${email}`}
      className="inline-flex items-center gap-1.5 text-gray-300 hover:text-white hover:underline break-all"
      title={`Email ${email}`}
      onClick={(e) => e.stopPropagation()}
    >
      <Mail size={14} className="shrink-0" />
      {email}
    </a>
  );
}

/** Page wrapper with a consistent max width + padding. */
export function AdminPage({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">{children}</div>;
}

export function AdminPageHeader({
  eyebrow,
  title,
  right,
}: {
  eyebrow?: string;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        {eyebrow && <p className="text-[11px] uppercase tracking-[0.2em] text-amber-500 font-semibold">{eyebrow}</p>}
        <h1 className="font-serif text-3xl sm:text-4xl text-white mt-1">{title}</h1>
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="admin-card p-10 flex flex-col items-center justify-center gap-3">
      <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div
      className="rounded-xl p-5 text-sm"
      style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.25)', color: '#f87171' }}
    >
      {message}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="admin-card p-12 text-center">
      <p className="font-serif text-2xl text-white">{title}</p>
      {hint && <p className="mt-2 text-sm text-gray-500">{hint}</p>}
    </div>
  );
}

const STATUS_TONES: Record<string, { bg: string; fg: string; label?: string }> = {
  active: { bg: 'rgba(74,222,128,0.12)', fg: '#4ade80' },
  pending: { bg: 'rgba(251,191,36,0.12)', fg: '#fbbf24' },
  pending_approval: { bg: 'rgba(251,191,36,0.12)', fg: '#fbbf24', label: 'Pending' },
  assigned: { bg: 'rgba(212,175,55,0.14)', fg: '#e4c55d' },
  prayed: { bg: 'rgba(74,222,128,0.12)', fg: '#4ade80', label: 'Prayed' },
  completed: { bg: 'rgba(74,222,128,0.12)', fg: '#4ade80' },
  suspended: { bg: 'rgba(248,113,113,0.12)', fg: '#f87171' },
  disabled: { bg: 'rgba(248,113,113,0.12)', fg: '#f87171' },
  inactive: { bg: 'rgba(138,138,147,0.14)', fg: '#a1a1aa' },
};

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONES[status] ?? { bg: 'rgba(138,138,147,0.14)', fg: '#a1a1aa' };
  const label = tone.label ?? status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span className="admin-chip" style={{ background: tone.bg, color: tone.fg }}>
      {label}
    </span>
  );
}

export function Pagination({
  page,
  total,
  limit,
  onPage,
}: {
  page: number;
  total: number;
  limit: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between mt-4 text-sm">
      <p className="text-gray-500">
        Page {page} of {pages} · {total.toLocaleString()} total
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="px-3 py-1.5 rounded-lg text-gray-300 disabled:opacity-40 hover:bg-white/5"
          style={{ border: '1px solid #2c2c33' }}
        >
          Previous
        </button>
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
          className="px-3 py-1.5 rounded-lg text-gray-300 disabled:opacity-40 hover:bg-white/5"
          style={{ border: '1px solid #2c2c33' }}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

export function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function relTime(iso?: string | null): string {
  if (!iso) return 'never';
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d ago`;
    return fmtDate(iso);
  } catch {
    return iso;
  }
}
