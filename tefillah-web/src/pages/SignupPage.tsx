import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, Loader2, Lock, Mail, MapPin, User } from 'lucide-react';
import Logo from '../components/Logo';
import GoogleSignInButton from '../components/GoogleSignInButton';
import PasswordInput from '../components/PasswordInput';
import CountrySelect from '../components/CountrySelect';
import PhoneCodeInput from '../components/PhoneCodeInput';
import { countryByIso, DEFAULT_COUNTRY_ISO } from '../data/countries';
import { GOOGLE_SIGNIN_ENABLED } from '../config';
import { useAuthStore } from '../store/authStore';

export default function SignupPage() {
  const navigate = useNavigate();
  const { registerAsUser, isLoading, error, clearError } = useAuthStore();
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '', // local number only — the dial code comes from the selected country
    location_city: '',
    countryIso: DEFAULT_COUNTRY_ISO, // India by default
    password: '',
    confirm: '',
  });
  const [validation, setValidation] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);

  const update = <K extends keyof typeof form>(k: K, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    setValidation(null);
    if (form.password.length < 8) {
      setValidation('Password must be at least 8 characters.');
      return;
    }
    if (form.password !== form.confirm) {
      setValidation('Passwords do not match.');
      return;
    }
    if (form.phone.replace(/\D/g, '').length < 6) {
      setValidation('Please enter a valid phone number.');
      return;
    }
    if (!agreed) {
      setValidation('Please agree to the Terms and Conditions and Privacy Policy.');
      return;
    }
    const country = countryByIso(form.countryIso);
    try {
      await registerAsUser({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: `+${country?.dial ?? ''} ${form.phone.trim()}`.trim(),
        location_city: form.location_city.trim(),
        location_country: country?.name ?? '',
        password: form.password,
      });
      navigate('/verify', { replace: true });
    } catch {
      // error in store
    }
  };

  const errorBlock = error || validation;

  return (
    <div className="mx-auto max-w-xl px-4 sm:px-6 py-12 sm:py-16">
      <div className="text-center anim-fade-up">
        <Logo size="md" />
        <h1 className="font-serif text-3xl sm:text-4xl mt-6">Create Account</h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Tell us about yourself
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
          <Field label="Full Name *" icon={<User size={16} />}>
            <input
              required
              autoFocus
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              className="input pl-10"
              placeholder="Enter your name"
            />
          </Field>
          <Field label="Email Address *" icon={<Mail size={16} />}>
            <input
              required
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              className="input pl-10"
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
            dial={countryByIso(form.countryIso)?.dial ?? ''}
            required
            autoComplete="tel"
            value={form.phone}
            onChange={(e) => update('phone', e.target.value)}
            placeholder="98765 43210"
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Password *" icon={<Lock size={16} />}>
            <PasswordInput
              required
              autoComplete="new-password"
              minLength={8}
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
              className="input pl-10"
              placeholder="Create a password"
            />
          </Field>
          <Field label="Confirm Password *" icon={<Lock size={16} />}>
            <PasswordInput
              required
              autoComplete="new-password"
              value={form.confirm}
              onChange={(e) => update('confirm', e.target.value)}
              className="input pl-10"
              placeholder="Confirm your password"
            />
          </Field>
        </div>

        {/* Terms agreement */}
        <label className="flex items-start gap-3 cursor-pointer select-none mt-1">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0"
            style={{ accentColor: 'var(--color-accent)' }}
          />
          <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            I agree to the{' '}
            <Link to="/terms" target="_blank" className="underline" style={{ color: 'var(--color-accent)' }}>Terms and Conditions</Link>
            {' '}and{' '}
            <Link to="/privacy" target="_blank" className="underline" style={{ color: 'var(--color-accent)' }}>Privacy Policy</Link>.
          </span>
        </label>

        <button type="submit" disabled={isLoading || !agreed} className="btn-primary w-full" style={{ opacity: agreed ? 1 : 0.5 }}>
          {isLoading ? <Loader2 size={18} className="animate-spin" /> : 'Create Account'}
        </button>

        {GOOGLE_SIGNIN_ENABLED && (
          <>
            <div className="text-center">
              <span className="divider-rule text-xs" style={{ color: 'var(--color-text-muted)' }}>or</span>
            </div>
            <GoogleSignInButton text="signup_with" />
          </>
        )}

        <p className="text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Already have an account?{' '}
          <Link to="/login" className="font-medium" style={{ color: 'var(--color-accent)' }}>
            Sign In
          </Link>
        </p>
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
