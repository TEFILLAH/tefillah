import { useEffect, useState } from 'react';
import { Bell, BellOff, CheckCheck, Loader2 } from 'lucide-react';
import { notificationsAPI, type AppNotification } from '../api/client';

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = Date.now();
    const diff = now - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}

export default function NotificationsPage() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const d = await notificationsAPI.getAll(1);
      setItems(d.notifications ?? []);
    } catch (err) {
      setError(extractMessage(err, 'Could not load notifications.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const onMarkAll = async () => {
    setMarking(true);
    try {
      await notificationsAPI.markAllRead();
      await refresh();
    } catch {
      /* no-op */
    } finally {
      setMarking(false);
    }
  };

  const onMarkOne = async (id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    try {
      await notificationsAPI.markRead(id);
    } catch {
      /* swallow */
    }
  };

  const unreadCount = items.filter((n) => !n.is_read).length;

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
      <header className="anim-fade-up flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="eyebrow">Stay close</p>
          <h1 className="font-serif text-4xl sm:text-5xl mt-2">Notifications</h1>
          <p className="mt-2 text-base" style={{ color: 'var(--color-text-secondary)' }}>
            Updates from your prayer partners and from Tefillah.
          </p>
        </div>
        {unreadCount > 0 && (
          <button onClick={onMarkAll} disabled={marking} className="btn-ghost text-sm">
            <CheckCheck size={16} /> {marking ? 'Marking…' : 'Mark all read'}
          </button>
        )}
      </header>

      <div className="mt-8 surface-card overflow-hidden anim-fade-up delay-100">
        {loading && (
          <div className="p-8 flex items-center justify-center">
            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
          </div>
        )}
        {!loading && error && (
          <div className="p-6 text-sm" style={{ color: 'var(--color-error)' }}>{error}</div>
        )}
        {!loading && !error && items.length === 0 && (
          <div className="p-10 text-center">
            <BellOff size={20} className="mx-auto" style={{ color: 'var(--color-text-muted)' }} />
            <p className="mt-3 font-serif text-xl">No notifications yet.</p>
            <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              You're all caught up.
            </p>
          </div>
        )}
        {!loading && !error && items.map((n) => (
          <button
            key={n.id}
            onClick={() => !n.is_read && onMarkOne(n.id)}
            className="w-full text-left p-5 flex items-start gap-4 border-b last:border-b-0 transition-colors"
            style={{
              borderColor: 'var(--color-border)',
              background: n.is_read ? 'transparent' : 'var(--color-surface)',
            }}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{
                background: n.is_read ? 'var(--color-bg-elev)' : 'var(--color-accent-glow)',
                color: n.is_read ? 'var(--color-text-muted)' : 'var(--color-accent)',
                border: '1px solid var(--color-border-strong)',
              }}
            >
              <Bell size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{n.title}</p>
                <span className="text-xs shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                  {formatDate(n.created_at)}
                </span>
              </div>
              <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                {n.message}
              </p>
            </div>
            {!n.is_read && (
              <span
                className="w-2 h-2 rounded-full shrink-0 mt-2"
                style={{ background: 'var(--color-accent)' }}
                aria-label="Unread"
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function extractMessage(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const r = (err as { response?: { data?: { detail?: string } } }).response;
    if (r?.data?.detail) return r.data.detail;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
