import type { ReactNode } from 'react';
import Logo from './Logo';

/**
 * Shared shell for the auth pages (login, signup, verify, forgot-password,
 * partner login/signup, complete-profile).
 *
 * WHY THIS EXISTS: every auth page was its own `mx-auto max-w-md` column with
 * no breakpoint above `sm`. That is correct on a phone and correct-ish on a
 * tablet, but on a 1600px laptop it rendered a 448px column with ~625px of dead
 * space on either side — the whole site read as a phone app parked in the
 * middle of a desktop screen.
 *
 * Below `lg` this keeps exactly the old stacked layout, so nothing about the
 * mobile experience changes. From `lg` up it becomes a two-column split: the
 * brand/heading block sits beside the form instead of on top of it. The form
 * itself stays ~448px, because a full-width login form is worse design, not
 * better — the fix for wasted width is to *use* it, not to stretch the inputs.
 */
export default function AuthLayout({
  title,
  subtitle,
  children,
  /** Optional line under the subtitle on wide screens only (e.g. "Signed in with Apple"). */
  aside,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-md lg:max-w-5xl px-4 sm:px-6 py-12 sm:py-16 lg:py-24">
      {/* items-start, NOT items-center: the form is ~600px tall and the brand
          block ~260px, so centring left the logo floating alone in the middle
          of the left half with the form starting 160px higher. Top-aligning
          makes the two read as one two-column page. */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-16 lg:items-start">
        {/* Brand column — centred on mobile (stacked above the form), left-aligned
            once it sits beside the form. Stays `md`: at `lg` the 144px logo
            dominated the column and read as a stray graphic rather than a mark. */}
        <div className="text-center lg:text-left anim-fade-up lg:pt-2">
          <Logo size="md" />
          <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl mt-6">{title}</h1>
          {subtitle && (
            <p
              className="mt-2 lg:mt-3 text-sm lg:text-base"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {subtitle}
            </p>
          )}
          {aside && <div className="mt-1 lg:mt-3">{aside}</div>}
        </div>

        {/* Form column. max-w-md keeps the card the same width it has always
            been; it is the PAGE that got wider, not the inputs. */}
        <div className="mt-8 lg:mt-0 w-full lg:max-w-md lg:justify-self-end anim-fade-up delay-100">
          {children}
        </div>
      </div>
    </div>
  );
}
