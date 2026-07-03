import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, ChevronRight, Heart, History, Sparkles } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { prayerAPI, publicAPI } from '../api/client';
import AboutTefillah from '../components/AboutTefillah';

const FALLBACK = [
  { verse: 'The Lord is near to all who call on Him.', reference: 'Psalm 145:18' },
  { verse: 'Cast all your anxiety on Him because He cares for you.', reference: '1 Peter 5:7' },
  { verse: 'Be still, and know that I am God.', reference: 'Psalm 46:10' },
];

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

export default function HomePage() {
  const { user } = useAuthStore();
  const firstName = user?.name?.split(' ')[0] ?? 'friend';

  const [verse, setVerse] = useState({ verse: '', reference: '' });
  const [verseLoading, setVerseLoading] = useState(true);
  const [prayerCount, setPrayerCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    publicAPI
      .generateVerse('en')
      .then((d) => !cancelled && setVerse({ verse: d.verse, reference: d.reference }))
      .catch(() => {
        if (cancelled) return;
        setVerse(FALLBACK[Math.floor(Math.random() * FALLBACK.length)]);
      })
      .finally(() => !cancelled && setVerseLoading(false));

    prayerAPI
      .getHistory()
      .then((items) => !cancelled && setPrayerCount(Array.isArray(items) ? items.length : 0))
      .catch(() => !cancelled && setPrayerCount(0));

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-xl px-4 sm:px-6 py-10 sm:py-12">
      {/* Greeting */}
      <section className="text-center anim-fade-up">
        <p className="eyebrow">{greeting()}</p>
        <h1 className="font-serif text-4xl sm:text-5xl mt-2">
          {firstName}
          <span style={{ color: 'var(--color-accent)' }}>.</span>
        </h1>
        <p className="mt-2 text-base" style={{ color: 'var(--color-text-secondary)' }}>
          This is your sacred space for prayer
        </p>
      </section>

      {/* Prayer orb — the hero action */}
      <section className="mt-10 flex flex-col items-center anim-fade-up delay-100">
        <Link to="/prayer" className="group relative inline-flex" aria-label="Submit a prayer">
          <span
            className="absolute inset-0 rounded-full blur-2xl opacity-40 transition-opacity duration-500 group-hover:opacity-70"
            style={{ background: 'var(--color-accent)' }}
            aria-hidden
          />
          <span
            className="relative w-56 h-56 sm:w-64 sm:h-64 rounded-full flex flex-col items-center justify-center text-center px-8 transition-transform duration-300 group-hover:scale-[1.03] active:scale-100"
            style={{
              background:
                'linear-gradient(155deg, var(--color-accent), color-mix(in srgb, var(--color-accent) 62%, #000))',
              boxShadow: 'var(--shadow-glow)',
              color: '#15130b',
            }}
          >
            <Sparkles size={36} />
            <span className="font-serif text-2xl sm:text-3xl mt-2">Submit Prayer</span>
            <span className="text-xs mt-1.5 leading-snug" style={{ color: 'rgba(21,19,11,0.66)' }}>
              Share your heart with our fellowship
            </span>
          </span>
        </Link>
        <Link
          to="/prayer"
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium"
          style={{ color: 'var(--color-accent)' }}
        >
          Start now <ArrowRight size={16} />
        </Link>
      </section>

      {/* Verse of the Day */}
      <section className="mt-10 anim-fade-up delay-200">
        <article className="surface-card relative overflow-hidden flex">
          <span className="block w-1 shrink-0" style={{ background: 'var(--color-accent)' }} aria-hidden />
          <div className="p-6 sm:p-7 flex-1">
            <div className="flex items-center gap-2 eyebrow">
              <BookOpen size={14} /> Verse of the Day
            </div>
            {verseLoading ? (
              <p className="mt-4 italic" style={{ color: 'var(--color-text-muted)' }}>
                Receiving today's verse…
              </p>
            ) : (
              <>
                <blockquote className="mt-4 font-serif text-xl sm:text-2xl leading-relaxed italic">
                  “{verse.verse}”
                </blockquote>
                <cite
                  className="block mt-4 not-italic text-sm tracking-[0.18em] uppercase"
                  style={{ color: 'var(--color-accent)' }}
                >
                  — {verse.reference}
                </cite>
              </>
            )}
          </div>
        </article>
      </section>

      {/* Prayer history */}
      <section className="mt-4 anim-fade-up delay-300">
        <Link
          to="/history"
          className="surface-card p-5 flex items-center gap-4 hover:translate-y-[-1px] transition-transform"
        >
          <span
            className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
            style={{ background: 'var(--color-accent-glow)', color: 'var(--color-accent)' }}
          >
            <History size={20} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-medium">Prayer History</p>
            <p className="text-sm truncate" style={{ color: 'var(--color-text-secondary)' }}>
              {prayerCount === null
                ? 'Read every petition you have offered'
                : `${prayerCount} ${prayerCount === 1 ? 'prayer' : 'prayers'} offered`}
            </p>
          </div>
          <span className="inline-flex items-center gap-2 shrink-0">
            <Heart size={16} style={{ color: 'var(--color-accent)' }} />
            <span className="font-serif text-2xl">{prayerCount === null ? '—' : prayerCount}</span>
            <ChevronRight size={18} style={{ color: 'var(--color-text-muted)' }} />
          </span>
        </Link>
      </section>

      <AboutTefillah />
    </div>
  );
}
