import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { prayerAPI } from '../api/client';

/**
 * Discloses that the comfort message + scripture are AI-generated (required by
 * Apple / Google for AI content), and lets the user flag the response as wrong
 * or inappropriate. Pass the prayer's id so the flag can be recorded server-side.
 */
export default function AiContentNotice({ prayerId }: { prayerId?: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const flag = async () => {
    if (!prayerId) return;
    setBusy(true);
    setError(null);
    try {
      await prayerAPI.flagAiContent(prayerId, reason.trim() || undefined);
      setDone(true);
    } catch {
      setError('Could not submit. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 flex flex-col items-center text-center">
      <p
        className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide"
        style={{ color: 'var(--color-text-muted)' }}
      >
        <Sparkles size={12} /> AI-generated · always weigh against Scripture
      </p>

      {done ? (
        <p className="mt-2 text-xs" style={{ color: 'var(--color-success)' }}>
          Thank you — this response has been flagged for review.
        </p>
      ) : prayerId ? (
        !open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-1 text-xs underline"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Report this response
          </button>
        ) : (
          <div className="mt-3 w-full max-w-sm">
            <textarea
              className="input w-full text-sm"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="What's wrong with this response? (optional)"
            />
            {error && <p className="mt-1 text-xs" style={{ color: 'var(--color-error)' }}>{error}</p>}
            <div className="mt-2 flex justify-center gap-2">
              <button
                type="button"
                onClick={flag}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
                style={{ background: 'var(--color-error)', color: '#fff', opacity: busy ? 0.5 : 1 }}
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : 'Submit report'}
              </button>
              <button
                type="button"
                onClick={() => { setOpen(false); setReason(''); }}
                disabled={busy}
                className="px-3 py-2 rounded-lg text-xs font-medium"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )
      ) : null}
    </div>
  );
}
