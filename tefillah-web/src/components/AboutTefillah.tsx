import { BookOpen, HeartHandshake, Sparkles } from 'lucide-react';

const ABOUT_PILLARS = [
  { icon: <Sparkles size={20} />, title: 'Speak your prayer', copy: 'Pour out your heart.' },
  { icon: <BookOpen size={20} />, title: 'Receive a verse', copy: 'Scripture in return.' },
  { icon: <HeartHandshake size={20} />, title: 'Be carried', copy: 'You’re never alone.' },
];

/**
 * "About Tefillah" closing section — shown at the bottom of the signed-in home
 * and partner dashboard (which both drop the marketing footer). Self-constrained
 * to max-w-xl so it reads the same regardless of the page's container width.
 * Pillars are 3-up at ≥500px and stack below that; the captions are equal length
 * so they wrap identically and stay aligned.
 */
export default function AboutTefillah() {
  return (
    <section className="mt-14 pt-12 border-t anim-fade-up" style={{ borderColor: 'var(--color-border)' }}>
      <div className="max-w-xl mx-auto">
        <p className="eyebrow text-center">About Tefillah</p>
        <div className="mt-4 flex justify-center">
          <p
            className="max-w-md text-center font-serif italic text-lg sm:text-xl leading-relaxed"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            A sacred space for prayer — speak the petitions of your heart, receive
            Scripture in return, and be carried by intercessors around the world.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 min-[500px]:grid-cols-3 gap-7 min-[500px]:gap-5">
          {ABOUT_PILLARS.map((p) => (
            <div key={p.title} className="flex flex-col items-center text-center">
              <span
                className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
                style={{ background: 'var(--color-accent-glow)', color: 'var(--color-accent)' }}
              >
                {p.icon}
              </span>
              <p className="font-semibold text-sm sm:text-base leading-tight">{p.title}</p>
              <p className="mt-1.5 text-sm leading-snug" style={{ color: 'var(--color-text-muted)' }}>
                {p.copy}
              </p>
            </div>
          ))}
        </div>

        <p
          className="text-center text-[11px] tracking-[0.28em] uppercase"
          style={{ color: 'var(--color-text-muted)', marginTop: '2.75rem' }}
        >
          Soli Deo gloria
        </p>
      </div>
    </section>
  );
}
