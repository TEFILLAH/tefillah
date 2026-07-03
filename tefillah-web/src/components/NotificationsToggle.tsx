import { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { enablePush, pushStatus, pushSupported, refreshPushIfEnabled, type PushStatus } from '../lib/webPush';

/**
 * Web-push opt-in toggle shared by the user App Settings page and the partner
 * Settings drawer. Flipping it on asks the browser for permission and registers
 * this browser's FCM token with the backend (see lib/webPush.ts).
 */
export default function NotificationsToggle() {
  const [status, setStatus] = useState<PushStatus>(() => pushStatus());
  const [enabled, setEnabled] = useState(false);
  const [working, setWorking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const supported = pushSupported();
  const on = enabled;

  // On load, if permission is already granted, silently re-register this browser's
  // push token (self-heals a granted-but-unregistered state and keeps it fresh).
  useEffect(() => {
    let alive = true;
    if (pushStatus() === 'granted') {
      refreshPushIfEnabled().then((ok) => alive && setEnabled(ok));
    }
    return () => {
      alive = false;
    };
  }, []);

  const toggle = async () => {
    if (on) {
      // Browsers don't allow programmatic revoke — guide the user.
      setNote('To turn notifications off, block them for this site in your browser settings.');
      return;
    }
    setWorking(true);
    setNote(null);
    const res = await enablePush();
    setStatus(pushStatus());
    setEnabled(res.ok);
    setNote(res.ok ? 'Notifications are on for this browser.' : res.reason ?? 'Could not enable notifications.');
    setWorking(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {on ? (
            <Bell size={18} style={{ color: 'var(--color-accent)' }} />
          ) : (
            <BellOff size={18} style={{ color: 'var(--color-text-muted)' }} />
          )}
          <div className="min-w-0">
            <p className="font-medium">Notifications</p>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {!supported
                ? 'Not supported in this browser'
                : status === 'denied'
                  ? 'Blocked in your browser settings'
                  : on
                    ? 'On for this browser'
                    : 'Get notified about prayer activity'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={toggle}
          disabled={!supported || status === 'denied' || working}
          role="switch"
          aria-checked={on}
          className="relative w-12 h-7 rounded-full shrink-0 transition-colors"
          style={{
            background: on ? 'var(--color-accent)' : 'var(--color-border-strong)',
            opacity: !supported || status === 'denied' ? 0.5 : 1,
            cursor: !supported || status === 'denied' ? 'not-allowed' : 'pointer',
          }}
          aria-label="Toggle notifications"
        >
          <span
            className="absolute top-1 w-5 h-5 rounded-full bg-white transition-all"
            style={{ left: on ? '1.5rem' : '0.25rem' }}
          />
          {working && (
            <Loader2 size={12} className="animate-spin absolute inset-0 m-auto" style={{ color: '#0f0f1a' }} />
          )}
        </button>
      </div>
      {note && <p className="mt-3 text-xs" style={{ color: 'var(--color-text-secondary)' }}>{note}</p>}
    </div>
  );
}
