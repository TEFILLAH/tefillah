import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { storage } from '../lib/storage';

interface Props {
  title: string;
  intro?: string;
  children: ReactNode;
}

/**
 * Shared wrapper for legal pages (Privacy Policy, Terms and Conditions).
 * Tuned for readability of dense legal text: a comfortable measure, generous
 * vertical rhythm, clearly-weighted section headings, and a serif display
 * title over a clean sans body.
 */
export default function LegalLayout({ title, intro, children }: Props) {
  // "Back to account" — same as the Prayer History page. Partners go to their
  // dashboard so the link never lands on a user-only menu; everyone else → menu.
  const backTo = storage.getUserType() === 'partner' ? '/partner/dashboard' : '/menu';

  return (
    <div className="mx-auto max-w-3xl px-5 sm:px-6 lg:px-8 py-10 sm:py-16">
      <Link
        to={backTo}
        className="inline-flex items-center gap-2 text-sm anim-fade-up"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        <ArrowLeft size={14} /> Back to account
      </Link>
      <header className="anim-fade-up text-center mb-12 sm:mb-16 mt-8 sm:mt-10">
        <h1 className="font-serif text-5xl sm:text-6xl leading-[1.05]">{title}</h1>
        {intro && (
          <p
            className="mt-6 max-w-2xl mx-auto text-base sm:text-lg leading-relaxed"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {intro}
          </p>
        )}
        <div
          className="mx-auto mt-8 h-px w-24"
          style={{ background: 'var(--color-accent)' }}
        />
      </header>

      <article className="legal-prose anim-fade-up delay-100" style={{ color: 'var(--color-text)' }}>
        {children}
      </article>

      <style>{`
        .legal-prose {
          font-family: var(--font-sans);
          font-size: 1.0625rem;
          line-height: 1.85;
          color: var(--color-text);
        }
        .legal-prose > p { margin: 0 0 1.4rem; color: var(--color-text-secondary); }
        .legal-prose p { letter-spacing: -0.003em; line-height: 1.85; }

        /* Section headings — large, well-separated, with a gold rule above */
        .legal-prose h2 {
          font-family: var(--font-serif);
          font-size: 1.9rem;
          font-weight: 600;
          line-height: 1.2;
          color: var(--color-text);
          margin: 3.5rem 0 1.25rem;
          padding-top: 2rem;
          border-top: 1px solid var(--color-border);
          letter-spacing: -0.01em;
        }
        .legal-prose h2:first-of-type { margin-top: 1rem; padding-top: 0; border-top: none; }

        /* Sub-clause headings */
        .legal-prose h3 {
          font-family: var(--font-sans);
          font-size: 1.05rem;
          font-weight: 600;
          color: var(--color-text);
          margin: 2rem 0 0.6rem;
        }

        .legal-prose ul {
          padding-left: 1.4rem;
          margin: 0 0 1.6rem;
          list-style: disc;
        }
        .legal-prose ul li {
          margin: 0.55rem 0;
          color: var(--color-text-secondary);
          padding-left: 0.25rem;
          line-height: 1.8;
        }
        .legal-prose ul li::marker { color: var(--color-accent); }

        .legal-prose a {
          color: var(--color-accent);
          text-decoration: underline;
          text-underline-offset: 3px;
          font-weight: 500;
        }
        .legal-prose strong { color: var(--color-text); font-weight: 600; }
        .legal-prose hr { border: none; border-top: 1px solid var(--color-border); margin: 3rem 0; }

        @media (min-width: 640px) {
          .legal-prose { font-size: 1.125rem; }
          .legal-prose h2 { font-size: 2.1rem; }
        }
      `}</style>
    </div>
  );
}
