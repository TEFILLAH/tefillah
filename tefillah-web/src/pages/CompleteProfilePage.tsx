import { useMemo, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Loader2, Mail, MapPin, User } from 'lucide-react';
import Logo from '../components/Logo';
import CountrySelect from '../components/CountrySelect';
import PhoneCodeInput from '../components/PhoneCodeInput';
import { countryByIso, DEFAULT_COUNTRY_ISO } from '../data/countries';
import { completeSocialProfile } from '../lib/socialAuth';
import { useAuthStore } from '../store/authStore';

/**
 * Step after Google social sign-in when the account is missing phone/location.
 *
 * `socialSignIn` (lib/socialAuth) has already persisted the session + populated
 * the auth store user; GoogleSignInButton then routes here with the account's
 * email/name/agent flag in the query string. We collect the mandatory
 * phone + city + country, call authAPI.completeSocialAuth via completeSocialProfile
 * (which re-applies the fresh session), refresh the store, and route on.
 *
 * Mirrors the mobile flow in frontend/app/(auth)/complete-profile.tsx.
 */
export default function CompleteProfilePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, refreshUser } = useAuthStore();

  // Email + name come from the query string (set by GoogleSignInButton) with the
  // signed-in store user as a fallback. Either identifies the pending account.
  const email = (params.get('email') ?? user?.email ?? '').trim();
  const name = (params.get('name') ?? user?.name ?? '').trim();
  const isAgent = params.get('agent') === '1';

  const [form, setForm] = useState({
    phone: '', // local number only — the dial code comes from the selected country
    location_city: '',
    countryIso: DEFAULT_COUNTRY_ISO, // India by default
  });
  const [validation, setValidation] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const country = useMemo(() => countryByIso(form.countryIso), [form.countryIso]);

  // Guard: no pending social user (no email) → nothing to complete, go to login.
  if (!email) {
    return <Navigate to="/login" replace />;
  }

  const update = <K extends keyof typeof form>(k: K, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setValidation(null);
    setSubmitError(null);

    if (form.phone.replace(/\D/g, '').length < 6) {
      setValidation('Please enter a valid phone number.');
      return;
    }
    if (!form.location_city.trim()) {
      setValidation('Please enter your city.');
      return;
    }
    if (!country) {
      setValidation('Please select your country.');
      return;
    }

    setIsLoading(true);
    try {
      const { next } = await completeSocialProfile({
        email: email.toLowerCase(),
        name,
        phone: `+${country.dial} ${form.phone.trim()}`.trim(),
        location_city: form.location_city.trim(),
        location_country: country.name,
        is_agent: isAgent,
      });
      // completeSocialProfile already re-applied the fresh session to the store;
      // refreshUser keeps us honest against the server (verification, etc.).
      await refreshUser();
      if (next === 'verify') {
        navigate('/verify', { replace: true });
      } else if (next === 'partner') {
        navigate('/partner/dashboard', { replace: true });
      } else {
        navigate('/home', { replace: true });
      }
    } catch (err) {
      const e = err as { response?: { data?: { detail?: unknown } }; message?: string };
      const detail = e?.response?.data?.detail;
      const message = Array.isArray(detail)
        ? detail.map((d) => (typeof d === 'object' && d && 'msg' in d ? String((d as { msg: unknown }).msg) : String(d))).join(', ')
        : typeof detail === 'string'
          ? detail
          : e?.message ?? 'Could not complete your profile. Please try again.';
      setSubmitError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const errorBlock = submitError || validation;

  return (
    <div className="mx-auto max-w-xl px-4 sm:px-6 py-12 sm:py-16">
      <div className="text-center anim-fade-up">
        <Logo size="md" />
        <h1 className="font-serif text-3xl sm:text-4xl mt-6">Complete Your Profile</h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Your phone number and location connect you with prayer partners nearby.
        </p>
      </div>

      <form onSubmit={onSubmit} className="mt-8 surface-card p-6 sm:p-8 space-y-4 anim-fade-up delay-100">
        {errorBlock && (
          <div
            className="flex items-start gap-2 rounded-lg p-3 text-sm"
            style={{
              background: 'rgba(185, 28, 28, 0.08)',
              border: '1px solid rgba(185, 28, 28, 0.20)',
              color: 'var(--color-error)',
            }}
          >
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{errorBlock}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Full Name" icon={<User size={16} />}>
            <input
              value={name}
              readOnly
              disabled
              className="input pl-10"
              style={{ opacity: 0.7, cursor: 'not-allowed' }}
              placeholder="Your name"
            />
          </Field>
          <Field label="Email Address" icon={<Mail size={16} />}>
            <input
              type="email"
              value={email}
              readOnly
              disabled
              className="input pl-10"
              style={{ opacity: 0.7, cursor: 'not-allowed' }}
              placeholder="your@email.com"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Country *">
            <CountrySelect
              value={form.countryIso}
              onChange={(iso) => update('countryIso', iso)}
            />
          </Field>
          <Field label="City *" icon={<MapPin size={16} />}>
            <input
              required
              value={form.location_city}
              onChange={(e) => update('location_city', e.target.value)}
              className="input pl-10"
              placeholder="City"
            />
          </Field>
        </div>

        <Field label="Phone Number *">
          <PhoneCodeInput
            dial={country?.dial ?? ''}
            required
            autoFocus
            autoComplete="tel"
            value={form.phone}
            onChange={(e) => update('phone', e.target.value)}
            placeholder="98765 43210"
          />
        </Field>

        <button type="submit" disabled={isLoading} className="btn-primary w-full">
          {isLoading ? <Loader2 size={18} className="animate-spin" /> : 'Complete Profile'}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
        {label}
      </label>
      <div className="relative">
        {icon && (
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {icon}
          </span>
        )}
        {children}
      </div>
    </div>
  );
}
