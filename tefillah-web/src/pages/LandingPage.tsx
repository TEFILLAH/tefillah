import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, HeartHandshake, Sparkles, Users } from 'lucide-react';
import Logo from '../components/Logo';
import { publicAPI } from '../api/client';

const FALLBACK_VERSES = [
  { verse: 'The Lord is near to all who call on Him, to all who call on Him in truth.', reference: 'Psalm 145:18' },
  { verse: 'Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God.', reference: 'Philippians 4:6' },
  { verse: 'Call to me and I will answer you and tell you great and unsearchable things you do not know.', reference: 'Jeremiah 33:3' },
  { verse: 'Come to me, all you who are weary and burdened, and I will give you rest.', reference: 'Matthew 11:28' },
  { verse: 'Trust in the Lord with all your heart, and do not lean on your own understanding.', reference: 'Proverbs 3:5' },
];

interface Verse {
  verse: string;
  reference: string;
}

export default function LandingPage() {
  const [verse, setVerse] = useState<Verse>({ verse: '', reference: '' });
  const [loadingVerse, setLoadingVerse] = useState(true);

  useEffect(() => {
    let cancelled = false;
    publicAPI
      .generateVerse('en')
      .then((d) => {
        if (cancelled) return;
        setVerse({ verse: d.verse, reference: d.reference });
      })
      .catch(() => {
        if (cancelled) return;
        const fb = FALLBACK_VERSES[Math.floor(Math.random() * FALLBACK_VERSES.length)];
        setVerse(fb);
      })
      .finally(() => {
        if (!cancelled) setLoadingVerse(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      {/* HERO ------------------------------------------------------------- */}
      <section className="relative">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-12 sm:pt-20 pb-20">
          <div className="flex flex-col items-center text-center anim-fade-up">
            <Logo size="lg" showWordmark showTagline />

            <p
              className="mt-8 max-w-2xl text-lg sm:text-xl leading-relaxed font-serif italic"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Submit the petitions of your heart. Receive scripture in return.
              Stand together with intercessors around the world.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row items-center gap-3">
              <Link to="/signup" className="btn-primary text-base">
                Begin Your Prayer Journey
                <ArrowRight size={18} />
              </Link>
              <Link to="/login" className="btn-ghost text-base">
                I already have an account
              </Link>
            </div>
          </div>

          {/* Verse card */}
          <div className="mt-16 mx-auto max-w-3xl anim-fade-up delay-200">
            <article
              className="surface-card relative overflow-hidden flex"
              style={{ boxShadow: 'var(--shadow-md)' }}
            >
              <span
                className="block w-1 shrink-0"
                style={{ background: 'var(--color-accent)' }}
                aria-hidden
              />
              <div className="p-6 sm:p-8 flex-1">
                <div className="flex items-center gap-2 eyebrow">
                  <BookOpen size={14} /> Daily Scripture
                </div>
                {loadingVerse ? (
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
          </div>
        </div>
      </section>

      {/* HOW IT WORKS ----------------------------------------------------- */}
      <section id="about" className="border-t" style={{ borderColor: 'var(--color-border)' }}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center max-w-2xl mx-auto">
            <p className="eyebrow">How it works</p>
            <h2 className="font-serif text-3xl sm:text-4xl mt-5">
              Three quiet steps. One sacred space.
            </h2>
          </div>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: <Sparkles size={22} />,
                title: 'Speak your prayer',
                copy: 'Write what is on your heart. Be plain or be poetic — both are received.',
              },
              {
                icon: <BookOpen size={22} />,
                title: 'Receive a verse',
                copy: 'A scripture is offered in return, gently tuned to the shape of your prayer.',
              },
              {
                icon: <HeartHandshake size={22} />,
                title: 'Be carried in prayer',
                copy: 'Vetted partners around the world stand watch and intercede for you.',
              },
            ].map((step, i) => (
              <div
                key={step.title}
                className="surface-card p-6 anim-fade-up"
                style={{ animationDelay: `${i * 120}ms` }}
              >
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center"
                  style={{
                    background: 'var(--color-accent-glow)',
                    color: 'var(--color-accent)',
                  }}
                >
                  {step.icon}
                </div>
                <h3 className="font-serif text-xl mt-4">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                  {step.copy}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PARTNER CTA ------------------------------------------------------ */}
      <section className="border-t" style={{ borderColor: 'var(--color-border)' }}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-20">
          <div
            className="surface-card p-8 sm:p-12 grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-8 items-center"
            style={{ background: 'var(--color-surface)' }}
          >
            <div>
              <p className="eyebrow inline-flex items-center gap-2">
                <Users size={14} /> For prayer partners
              </p>
              <h2 className="font-serif text-3xl sm:text-4xl mt-5">
                Become a Prayer Partner.
              </h2>
              <p className="mt-3 text-base sm:text-lg" style={{ color: 'var(--color-text-secondary)' }}>
                Join a global network of vetted prayer warriors. Receive
                requests routed to your region, mark them as prayed over, and
                walk with people through the moments that matter most.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link to="/partner/signup" className="btn-primary">Join as Partner</Link>
                <Link to="/partner/login" className="btn-ghost">Partner Login <ArrowRight size={16} /></Link>
              </div>
            </div>
            <div className="hidden lg:flex items-center justify-center">
              <Logo size="lg" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
