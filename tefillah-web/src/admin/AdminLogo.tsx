/**
 * AdminLogo — the breathing Tefillah flame, tuned for the dark admin control room.
 *
 * Reuses the exact brand flame (Ionicons v7 `flame`, MIT — the same two subpaths
 * the public <Logo> and the mobile app render) so the admin badge is pixel-faithful
 * to the brand, then wraps it in a neon glow disc that gently "breathes".
 *
 * All animation is transform/opacity only and honours prefers-reduced-motion
 * (handled by the .admin-breathe-* classes in admin.css).
 */

function IonFlame({ size, body, droplet }: { size: number; body: string; droplet: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width={size} height={size} aria-hidden>
      <path
        fill={body}
        d="M394.23,197.56a300.43,300.43,0,0,0-53.37-90C301.2,61.65,249.05,32,208,32a16,16,0,0,0-15.48,20c13.87,53-14.88,97.07-45.31,143.72C122,234.36,96,274.27,96,320c0,88.22,71.78,160,160,160s160-71.78,160-160C416,276.7,408.68,235.51,394.23,197.56Z"
      />
      <path
        fill={droplet}
        d="M288.33,418.69C278,429.69,265.05,432,256,432s-22-2.31-32.33-13.31S208,390.24,208,368c0-25.14,8.82-44.28,17.34-62.78,4.95-10.74,10-21.67,13-33.37a8,8,0,0,1,12.49-4.51A126.48,126.48,0,0,1,275,292c18.17,24,29,52.42,29,76C304,390.24,298.58,407.77,288.33,418.69Z"
      />
    </svg>
  );
}

export default function AdminLogo({ size = 40 }: { size?: number }) {
  const inner = Math.round(size * 0.72);
  const flame = Math.round(size * 0.52);
  return (
    <span
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
      aria-label="Tefillah"
    >
      {/* Layer 0 — soft outer aura */}
      <span
        aria-hidden
        className="absolute rounded-full admin-breathe-glow"
        style={{
          width: size * 1.35,
          height: size * 1.35,
          background: 'radial-gradient(circle, rgba(229,185,61,0.55) 0%, rgba(229,185,61,0.10) 45%, transparent 70%)',
          filter: 'blur(2px)',
        }}
      />
      {/* Layer 1 — gold ring that breathes */}
      <span
        aria-hidden
        className="absolute rounded-full admin-breathe-ring"
        style={{
          width: size,
          height: size,
          background: 'conic-gradient(from 210deg, #f0d178, #e5b93d 40%, #b9862a 60%, #f0d178)',
          boxShadow: '0 0 22px rgba(229,185,61,0.45)',
        }}
      />
      {/* Layer 2 — dark disc the flame sits on */}
      <span
        aria-hidden
        className="absolute rounded-full"
        style={{
          width: inner,
          height: inner,
          background: 'radial-gradient(circle at 50% 35%, #1b1a24, #0b0b12)',
          border: '1px solid rgba(229,185,61,0.25)',
        }}
      />
      {/* Layer 3 — the flame */}
      <span className="relative z-10 inline-flex admin-breathe-icon">
        <IonFlame size={flame} body="#f0d178" droplet="#0b0b12" />
      </span>
    </span>
  );
}
