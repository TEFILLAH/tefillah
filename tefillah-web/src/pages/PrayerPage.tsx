import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, EyeOff, Loader2, MapPin, Send } from 'lucide-react';
import { prayerAPI } from '../api/client';
import { useAuthStore } from '../store/authStore';

const MAX_CHARS = 1000;

export default function PrayerPage() {
  const navigate = useNavigate();
  const { token, user } = useAuthStore();

  const [content, setContent] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [city, setCity] = useState(user?.location_city ?? '');
  const [country, setCountry] = useState(user?.location_country ?? '');
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const remaining = MAX_CHARS - content.length;

  const requestLocation = () => {
    if (!('geolocation' in navigator)) {
      setError('Location is not available on this browser.');
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setError(err.message || 'Could not read your location.');
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!content.trim()) {
      setError("Please write the prayer that's on your heart before submitting.");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        content: content.trim(),
        is_anonymous: anonymous,
        location_city: city.trim() || undefined,
        location_country: country.trim() || undefined,
        location_lat: coords?.lat,
        location_lon: coords?.lon,
        language: 'en',
      };
      const res = token
        ? await prayerAPI.submit(payload)
        : await prayerAPI.guestSubmit(payload);
      navigate('/prayer/confirmation', { replace: true, state: res });
    } catch (err) {
      setError(extractMessage(err, 'Could not submit your prayer just now.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
      <header className="text-center anim-fade-up">
        <p className="eyebrow">A prayer offered</p>
        <h1 className="font-serif text-4xl sm:text-5xl mt-2">Share Your Prayer</h1>
        <p className="mt-3 text-base sm:text-lg" style={{ color: 'var(--color-text-secondary)' }}>
          Pour out your heart. Your prayer will be held with care and lifted up by our fellowship.
        </p>
      </header>

      <form onSubmit={onSubmit} className="mt-10 surface-card p-6 sm:p-8 space-y-5 anim-fade-up delay-100">
        {error && (
          <div
            className="flex items-start gap-2 rounded-lg p-3 text-sm"
            style={{
              background: 'rgba(185, 28, 28, 0.08)',
              border: '1px solid rgba(185, 28, 28, 0.20)',
              color: 'var(--color-error)',
            }}
          >
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label htmlFor="prayer" className="block text-sm mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
            Your prayer
          </label>
          <textarea
            id="prayer"
            required
            autoFocus
            maxLength={MAX_CHARS}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
            className="input font-serif text-lg leading-relaxed"
            style={{ resize: 'vertical' }}
            placeholder="What's on your heart today? Share your prayer request in any language..."
          />
          <div className="mt-1 flex items-center justify-between text-xs" style={{ color: 'var(--color-text-muted)' }}>
            <span>{anonymous ? 'Submitting anonymously' : 'Visible to your prayer partner'}</span>
            <span aria-live="polite">{remaining} characters left</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>City</label>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="input"
              placeholder="City"
            />
          </div>
          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Country</label>
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="input"
              placeholder="Country"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-center justify-between">
          <button
            type="button"
            onClick={requestLocation}
            disabled={locating}
            className="btn-ghost text-sm"
          >
            <MapPin size={16} />
            {locating ? 'Locating…' : coords ? 'Location attached' : 'Use my location'}
          </button>

          <label
            className="inline-flex items-center gap-2 text-sm cursor-pointer select-none"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
              className="accent-amber-600"
            />
            <EyeOff size={14} /> Submit Anonymously
          </label>
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
          {loading ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <>
              <Send size={16} /> Submit Prayer Request
            </>
          )}
        </button>
      </form>
    </div>
  );
}

function extractMessage(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const r = (err as { response?: { data?: { detail?: string } } }).response;
    if (r?.data?.detail) return r.data.detail;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
