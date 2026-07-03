interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  /** Show the "Tefillah" wordmark below the badge. */
  showWordmark?: boolean;
  /** Show the tagline rule under the wordmark. */
  showTagline?: boolean;
}

/**
 * Tefillah logo — pixel-faithful to the mobile BreathingLogo reference image.
 *
 * Composition (back → front):
 *   1. Outer dim-olive disc — large background; visibly luminates.
 *   2. Inner medium-olive disc — the brighter halo around the flame.
 *   3. Flame body — Ionicons "flame" (md, solid) outer subpath, in sacred gold.
 *      That path has the distinctive left-side curl/wave (the "leaping flame"
 *      silhouette) that the reference image shows.
 *   4. Inner droplet — Ionicons inner subpath, drawn as a SEPARATE path with
 *      an explicit dark-olive fill (NOT a transparent evenodd hole). That way
 *      the droplet's colour is identical no matter what's behind it.
 *
 * The two flame subpaths are taken from Ionicons v7 `flame.svg` (MIT licensed,
 * Ionic Team) so the shape is exactly the icon the mobile app renders.
 */

interface SizeSpec {
  /** outer disc diameter in pixels */
  outer: number;
  /** inner disc diameter in pixels */
  inner: number;
  /** flame icon size in pixels (square) */
  flame: number;
  wordmark: string;
  tagline: string;
}

const SIZES: Record<NonNullable<LogoProps['size']>, SizeSpec> = {
  sm: { outer: 60,  inner: 44,  flame: 28, wordmark: 'text-base sm:text-lg', tagline: 'text-[10px]' },
  md: { outer: 96,  inner: 70,  flame: 48, wordmark: 'text-2xl sm:text-3xl', tagline: 'text-xs' },
  lg: { outer: 144, inner: 104, flame: 72, wordmark: 'text-4xl sm:text-5xl', tagline: 'text-xs sm:text-sm' },
};

/**
 * Ionicons "flame" — verbatim from the official GitHub source
 * (ionic-team/ionicons, src/svg/flame.svg, MIT licensed).
 *
 * The original ships as a SINGLE path with two subpaths and `nonzero` fill,
 * which renders the inner subpath as a transparent hole. We split it into two
 * <path> elements so each can be filled explicitly — the body in gold, the
 * inner droplet in dark olive — so the droplet colour is identical no matter
 * what's behind the SVG.
 *
 * Both subpaths are taken character-for-character from the official source:
 *   outer body: covers the leaping-flame silhouette (left-side curl included).
 *   inner drop: is a true teardrop — pointed top, bulbous bottom — exactly
 *               like the user's reference.
 */
function IonFlame({
  size,
  bodyColor,
  dropletColor,
}: {
  size: number;
  bodyColor: string;
  dropletColor: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      aria-hidden
    >
      {/* Outer flame body — official Ionicons flame outer subpath */}
      <path
        fill={bodyColor}
        d="M394.23,197.56a300.43,300.43,0,0,0-53.37-90C301.2,61.65,249.05,32,208,32a16,16,0,0,0-15.48,20c13.87,53-14.88,97.07-45.31,143.72C122,234.36,96,274.27,96,320c0,88.22,71.78,160,160,160s160-71.78,160-160C416,276.7,408.68,235.51,394.23,197.56Z"
      />
      {/* Inner droplet — official Ionicons flame inner subpath (true teardrop) */}
      <path
        fill={dropletColor}
        d="M288.33,418.69C278,429.69,265.05,432,256,432s-22-2.31-32.33-13.31S208,390.24,208,368c0-25.14,8.82-44.28,17.34-62.78,4.95-10.74,10-21.67,13-33.37a8,8,0,0,1,12.49-4.51A126.48,126.48,0,0,1,275,292c18.17,24,29,52.42,29,76C304,390.24,298.58,407.77,288.33,418.69Z"
      />
    </svg>
  );
}

export default function Logo({ size = 'md', showWordmark = false, showTagline = false }: LogoProps) {
  const s = SIZES[size];

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative flex items-center justify-center"
        style={{ width: s.outer, height: s.outer }}
      >
        {/* Layer 1 — outer dim-olive disc (luminates) */}
        <span
          aria-hidden
          className="absolute rounded-full anim-ring-breathe"
          style={{
            width: s.outer,
            height: s.outer,
            background: 'var(--logo-disc-outer)',
          }}
        />

        {/* Layer 2 — inner brighter olive disc */}
        <span
          aria-hidden
          className="absolute rounded-full anim-glow-breathe"
          style={{
            width: s.inner,
            height: s.inner,
            background: 'var(--logo-disc-inner)',
          }}
        />

        {/* Layer 3 — Ionicons flame, body + droplet drawn as separate paths */}
        <span className="relative z-10 anim-icon-breathe inline-flex">
          <IonFlame
            size={s.flame}
            bodyColor="var(--logo-flame)"
            dropletColor="var(--logo-flame-droplet)"
          />
        </span>
      </div>

      {showWordmark && (
        <h1
          className={`font-serif ${s.wordmark} mt-3 sm:mt-4 font-light tracking-[0.18em]`}
          style={{ color: 'var(--color-text)' }}
        >
          Tefillah
        </h1>
      )}

      {showTagline && (
        <div className="flex items-center gap-3 mt-2">
          <span className="block w-8 h-px" style={{ background: 'var(--color-accent)' }} />
          <span
            className={`uppercase ${s.tagline} tracking-[0.25em]`}
            style={{ color: 'var(--color-text-muted)' }}
          >
            A Sacred Space for Prayer
          </span>
          <span className="block w-8 h-px" style={{ background: 'var(--color-accent)' }} />
        </div>
      )}
    </div>
  );
}
