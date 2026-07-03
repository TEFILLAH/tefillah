import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BookOpen, ChevronDown, ChevronUp, Loader2, Sparkles } from 'lucide-react';
import { prayerAPI, type PrayerHistoryItem } from '../api/client';
import AiContentNotice from '../components/AiContentNotice';

const STATUS_COPY: Record<string, { label: string; tone: string }> = {
  pending: { label: 'Awaiting partner', tone: 'var(--color-warning)' },
  assigned: { label: 'With a partner', tone: 'var(--color-accent)' },
  in_progress: { label: 'Being prayed', tone: 'var(--color-accent)' },
  completed: { label: 'Prayed over', tone: 'var(--color-success)' },
  prayed: { label: 'Prayed over', tone: 'var(--color-success)' },
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function HistoryPage() {
  const [items, setItems] = useState<PrayerHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    prayerAPI
      .getHistory()
      .then((res) => {
        if (cancelled) return;
        setItems(Array.isArray(res) ? res : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(extractMessage(err, 'Could not load your prayer history.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
      <Link to="/menu" className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        <ArrowLeft size={14} /> Back to account
      </Link>
      <header className="mt-6 anim-fade-up">
        <p className="eyebrow">Your prayers</p>
        <h1 className="font-serif text-4xl sm:text-5xl mt-2">History</h1>
        <p className="mt-2 text-base" style={{ color: 'var(--color-text-secondary)' }}>
          Every petition you have offered, gathered together.
        </p>
      </header>

      <div className="mt-8 space-y-3 anim-fade-up delay-100">
        {loading && (
          <div className="surface-card p-8 flex items-center justify-center">
            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
          </div>
        )}
        {!loading && error && (
          <div
            className="surface-card p-6 text-sm"
            style={{ color: 'var(--color-error)', borderColor: 'rgba(185, 28, 28, 0.30)' }}
          >
            {error}
          </div>
        )}
        {!loading && !error && items.length === 0 && (
          <div className="surface-card p-10 text-center">
            <Sparkles size={20} className="mx-auto" style={{ color: 'var(--color-accent)' }} />
            <p className="font-serif text-2xl mt-3">No prayers yet.</p>
            <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              When you offer your first prayer, it will appear here for you.
            </p>
            <Link to="/prayer" className="btn-primary mt-6 inline-flex">Begin a prayer</Link>
          </div>
        )}
        {!loading && !error && items.map((item) => {
          const status = STATUS_COPY[item.status] ?? { label: item.status, tone: 'var(--color-text-muted)' };
          const isOpen = !!expanded[item.id];
          return (
            <article key={item.id} className="surface-card overflow-hidden">
              <button
                type="button"
                onClick={() => setExpanded((p) => ({ ...p, [item.id]: !p[item.id] }))}
                className="w-full text-left p-5 flex items-start gap-4 hover:bg-[color:var(--color-surface)] transition-colors"
                aria-expanded={isOpen}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: 'var(--color-accent-glow)', color: 'var(--color-accent)' }}
                >
                  <BookOpen size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    <span>{formatDate(item.submitted_at)}</span>
                    <span aria-hidden>·</span>
                    <span style={{ color: status.tone }}>{status.label}</span>
                    {item.category && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="capitalize">{item.category}</span>
                      </>
                    )}
                  </div>
                  <p
                    className={`mt-2 font-serif text-lg leading-relaxed ${isOpen ? '' : 'line-clamp-3'}`}
                    style={{ color: 'var(--color-text)' }}
                  >
                    {item.content}
                  </p>
                </div>
                <span style={{ color: 'var(--color-text-muted)' }}>
                  {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </span>
              </button>
              {isOpen && (item.bible_verse || item.comfort_message) && (
                <div className="border-t px-5 py-5 sm:px-8" style={{ borderColor: 'var(--color-border)' }}>
                  {item.bible_verse && (
                    <div>
                      <div className="eyebrow flex items-center gap-2"><BookOpen size={14} /> Scripture given</div>
                      <blockquote className="mt-2 font-serif italic text-lg">
                        “{item.bible_verse}”
                      </blockquote>
                      {item.bible_reference && (
                        <cite className="block mt-2 not-italic text-xs tracking-[0.18em] uppercase" style={{ color: 'var(--color-accent)' }}>
                          — {item.bible_reference}
                        </cite>
                      )}
                    </div>
                  )}
                  {item.comfort_message && (
                    <p className="mt-4 italic text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                      “{item.comfort_message}”
                    </p>
                  )}
                  <AiContentNotice prayerId={item.id} />
                </div>
              )}
            </article>
          );
        })}
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
