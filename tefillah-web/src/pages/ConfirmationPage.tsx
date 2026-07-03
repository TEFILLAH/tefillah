import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, History, Home, Sparkles } from 'lucide-react';
import { useEffect } from 'react';
import type { PrayerSubmitResponse } from '../api/client';
import AiContentNotice from '../components/AiContentNotice';

export default function ConfirmationPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const data = location.state as PrayerSubmitResponse | undefined;

  // If somebody lands here without state (e.g. refresh), send them home.
  useEffect(() => {
    if (!data) {
      navigate('/home', { replace: true });
    }
  }, [data, navigate]);

  if (!data) return null;

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
      <div className="text-center anim-fade-up">
        <div
          className="mx-auto w-16 h-16 rounded-full flex items-center justify-center"
          style={{
            background: 'var(--color-accent-glow)',
            color: 'var(--color-accent)',
          }}
        >
          <Sparkles size={28} strokeWidth={1.5} />
        </div>
        <p className="eyebrow mt-6">Your prayer is received</p>
        <h1 className="font-serif text-4xl sm:text-5xl mt-2">Thank you.</h1>
        <p className="mt-3 text-base sm:text-lg" style={{ color: 'var(--color-text-secondary)' }}>
          A partner has been notified and will be praying for you.
        </p>
      </div>

      {data.bible_verse && (
        <article className="mt-10 surface-card relative overflow-hidden flex anim-fade-up delay-100">
          <span className="block w-1 shrink-0" style={{ background: 'var(--color-accent)' }} aria-hidden />
          <div className="p-6 sm:p-8 flex-1">
            <div className="flex items-center gap-2 eyebrow">
              <BookOpen size={14} /> A scripture for you
            </div>
            <blockquote className="mt-4 font-serif text-xl sm:text-2xl leading-relaxed italic">
              “{data.bible_verse}”
            </blockquote>
            {data.bible_reference && (
              <cite
                className="block mt-4 not-italic text-sm tracking-[0.18em] uppercase"
                style={{ color: 'var(--color-accent)' }}
              >
                — {data.bible_reference}
              </cite>
            )}
          </div>
        </article>
      )}

      {data.comfort_message && (
        <p
          className="mt-8 font-serif italic text-lg sm:text-xl text-center max-w-xl mx-auto anim-fade-up delay-200"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          “{data.comfort_message}”
        </p>
      )}

      {(data.bible_verse || data.comfort_message) && (
        <div className="anim-fade-up delay-200">
          <AiContentNotice prayerId={data.prayer_id} />
        </div>
      )}

      <div className="mt-12 flex flex-wrap items-center justify-center gap-3 anim-fade-up delay-300">
        <Link to="/home" className="btn-ghost"><Home size={16} /> Back home</Link>
        <Link to="/history" className="btn-primary"><History size={16} /> View prayer history</Link>
      </div>
    </div>
  );
}
