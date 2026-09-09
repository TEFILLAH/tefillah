import { useMemo, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Loader2, Mail, MapPin, User } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import CountrySelect from '../components/CountrySelect';
import PhoneCodeInput from '../components/PhoneCodeInput';
import { countryByIso, DEFAULT_COUNTRY_ISO } from '../data/countries';
import { completeSocialProfile } from '../lib/socialAuth';
import { useAuthStore } from '../store/authStore';

/**
 * Step after social sign-in (Google or Apple) when the account is missing
 * phone/location.
 *
 * `socialSignIn` (lib/socialAuth) has already persisted the session + populated
 * the auth store user; the social button then routes here via socialRedirectPath
 * with the account's email/name/agent flag + provider in the query string. We collect the mandatory
 * name + phone + city + country, call authAPI.completeSocialAuth via completeSocialProfile
 * (which re-applies the fresh session), refresh the store, and route on.
 *
 * Mirrors the mobile flow in frontend/app/(auth)/complete-profile.tsx.
 */
export default function CompleteProfilePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, refreshUser } = useAuthStore();

  // Email + name come from the query string (set by socialRedirectPath) with the
  // signed-in store user as a fallback. Either identifies the pending account.
  // `||` not `??`: socialRedirectPath always SETS both params, so an unknown name
  // arrives as '' rather than null and `??` would never reach the store fallback.
  const email = (params.get('email') || user?.email || '').trim();
  const name = (params.get('name') || user?.name || '').trim();
  const isAgent = params.get('agent') === '1';
  // Absent when the page is reached directly rather than from a social button.
  const provider = params.get('provider');

  const [form, setForm] = useState({
    // Editable, unlike the email: Apple hands the name over on the first
    // authorization only (and never when the user hides it), so the backend may
    // have fallen back to the email prefix — an opaque private-relay alias.
    name,
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

    // Mirrors SocialAuthCompleteRequest.name (min_length=2) so a short name is a
    // friendly message here instead of a raw 422.
    if (form.name.trim().length < 2) {
      setValidation('Please enter your full name.');
      return;
    }
    if (form.phone.replace(/\D/g, '').length < 6) {
      setValidation('Please enter a valid phone number.');
      return;
    }
    // < 2, not just empty: the backend requires min_length=2 here as well, so a
    // 1-character city would otherwise come back as a raw 422.
    if (form.location_city.trim().length < 2) {
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
        name: form.name.trim(),
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
    <AuthLayout
      title="Complete Your Profile"
      subtitle="Your phone number and location connect you with prayer partners nearby."
      aside={
        provider ? (
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Signed in with {provider === 'apple' ? 'Apple' : 'Google'}
          </p>
        ) : null
      }
      width="xl"
    >

      <form onSubmit={onSubmit} className="surface-card p-6 sm:p-8 space-y-4">
        {errorBlock && (
          <div
            role="alert"
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
          <Field label="Full Name *" icon={<User size={16} />}>
            <input
              required
              autoFocus
              maxLength={100}
              autoComplete="name"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              className="input pl-10"
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
    </AuthLayout>
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
  // The <label> WRAPS the control rather than sitting beside it: that associates
  // the two implicitly, with no id to generate and thread through children like
  // CountrySelect and PhoneCodeInput. Previously the label was a sibling with no
  // htmlFor, so nothing was associated at all — screen readers announced a bare
  // textbox, and the browser's `required` bubble couldn't name the field.
  return (
    <label className="block">
      <span className="block text-sm mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
        {label}
      </span>
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
    </label>
  );
}
