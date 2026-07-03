import { Link } from 'react-router-dom';
import { Compass, Home } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md px-4 sm:px-6 py-20 text-center">
      <div
        className="mx-auto w-16 h-16 rounded-full flex items-center justify-center"
        style={{ background: 'var(--color-accent-glow)', color: 'var(--color-accent)' }}
      >
        <Compass size={28} strokeWidth={1.5} />
      </div>
      <p className="eyebrow mt-6">Page not found</p>
      <h1 className="font-serif text-4xl sm:text-5xl mt-2">A wrong turn.</h1>
      <p className="mt-3 text-base" style={{ color: 'var(--color-text-secondary)' }}>
        The page you were looking for has either moved or never existed. Let's
        bring you back to a safer place.
      </p>
      <div className="mt-8">
        <Link to="/" className="btn-primary"><Home size={16} /> Take me home</Link>
      </div>
    </div>
  );
}
