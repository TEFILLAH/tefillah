import type { ReactNode } from 'react';
import Logo from './Logo';

/**
 * Shared shell for the auth pages (login, signup, verify, forgot-password,
 * partner login/signup, complete-profile).
 *
 * WHY IT LOOKS LIKE THIS
 * ----------------------
 * The original problem: every auth page was its own `mx-auto max-w-md` column
 * with no breakpoint above `sm` and only top padding, so on a laptop the whole
 * page sat as a narrow strip pinned to the TOP of the screen with a large empty
 * area beneath it. That is what read as "a phone screen on a desktop".
 *
 * A two-column split (brand beside the form) was tried first and rejected: the
 * brand side holds only a mark, a heading and one line of text, so against a
 * ~600px form it left an obvious dead quadrant no matter how it was aligned.
 *
 * What is here instead is the conventional desktop auth screen: one centred
 * column, centred BOTH ways. Vertical centring is the actual fix — the column
 * width was never really the problem, the unbalanced whitespace was. A wider
 * form would be worse, not better; login inputs should not span a monitor.
 *
 * Mobile is untouched: below `md` this is the original stacked, top-aligned
 * layout, so nothing about the phone experience changes.
 */
export default function AuthLayout({
  title,
  subtitle,
  children,
  /** Small label ABOVE the title, e.g. the "Prayer Partner" eyebrow. */
  eyebrow,
  /** Line UNDER the subtitle, e.g. "Signed in with Apple". */
  aside,
  /**
   * Column width. 'md' (448px) suits a single-column form such as login.
   * 'xl' (576px) is for the pages whose forms use `sm:grid-cols-2` — signup,
   * partner signup, complete-profile. Those were `max-w-xl` before this
   * component existed, and forcing them to 'md' visibly cramped their paired
   * inputs (Full Name | Email, Country | City).
   */
  width = 'md',
}: {
  // ReactNode, not string: VerifyPage interpolates the address into its
  // subtitle and ForgotPasswordPage switches both on stage.
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  eyebrow?: ReactNode;
  aside?: ReactNode;
  width?: 'md' | 'xl';
}) {
  return (
    // `md` (768px), NOT `lg`: at lg the fix only reached maximised windows, so a
    // browser at 960px — half of a 1920 monitor, the commonest non-maximised
    // width — still rendered the original 448px strip pinned to the top with
    // 256px dead either side. Measured, not assumed.
    //
    // 4rem = the sticky header height (h-16 in Header.tsx). Subtracting it keeps
    // the optical centre of the card in the centre of the space BELOW the header
    // rather than of the whole viewport, which would sit visibly low.
    <div className="md:min-h-[calc(100vh-4rem)] md:flex md:items-center md:justify-center">
      <div
        className={`mx-auto w-full ${width === 'xl' ? 'max-w-xl' : 'max-w-md'} px-4 sm:px-6 py-12 sm:py-16 md:py-10`}
      >
        <div className="text-center anim-fade-up">
          <Logo size="md" />
          {eyebrow && <div className="mt-6">{eyebrow}</div>}
          <h1 className={`font-serif text-3xl sm:text-4xl ${eyebrow ? 'mt-3' : 'mt-6'}`}>
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {subtitle}
            </p>
          )}
          {aside && <div className="mt-1">{aside}</div>}
        </div>

        <div className="mt-8 anim-fade-up delay-100">{children}</div>
      </div>
    </div>
  );
}
