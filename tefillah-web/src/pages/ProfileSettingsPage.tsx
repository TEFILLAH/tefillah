import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera, KeyRound, Loader2, Mail, Trash2, User as UserIcon } from 'lucide-react';
import { authAPI } from '../api/client';
import { useAuthStore } from '../store/authStore';

/**
 * Account → Profile Settings (tefillah.in/profile-settings).
 *
 * NOTE: This file was reconstructed after its source was corrupted by a crash.
 * It restores the known feature set — profile edit, photo upload, staged email
 * change (verify/cancel), change password, and in-app account deletion — using
 * the same authAPI contract the rest of the app uses. Please diff it against a
 * backup if you have one to recover any bespoke styling/behaviour.
 */
export default function ProfileSettingsPage() {
  const user = useAuthStore((s) => s.user) as Record<string, any> | null;
  const refreshUser = useAuthStore((s) => s.refreshUser);

  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [city, setCity] = useState(user?.location_city ?? '');
  const [country, setCountry] = useState(user?.location_country ?? '');
  const [photoUrl, setPhotoUrl] = useState<string>(user?.profile_photo_url ?? '');

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [pendingEmail, setPendingEmail] = useState<string | null>(user?.pending_email ?? null);
  const [emailCode, setEmailCode] = useState('');
  const [confirmingEmail, setConfirmingEmail] = useState(false);

  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const initial = (user?.name?.charAt(0) || 'U').toUpperCase();

  const onPickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoBusy(true);
    setErr(null);
    try {
      const res = await authAPI.uploadPhoto(file, file.name);
      setPhotoUrl(res.profile_photo_url);
      await refreshUser();
    } catch (e2: any) {
      setErr(e2?.message || 'Could not upload the photo.');
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const save = async () => {
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const payload: Record<string, string> = {};
      if (name.trim() !== (user?.name ?? '')) payload.name = name.trim();
      if (email.trim().toLowerCase() !== (user?.email ?? '').toLowerCase()) payload.email = email.trim();
      if (phone.trim() !== (user?.phone ?? '')) payload.phone = phone.trim();
      if (city.trim() !== (user?.location_city ?? '')) payload.location_city = city.trim();
      if (country.trim() !== (user?.location_country ?? '')) payload.location_country = country.trim();
      if (Object.keys(payload).length === 0) {
        setMsg('There is nothing to save.');
        setSaving(false);
        return;
      }
      const res = await authAPI.updateProfile(payload);
      await refreshUser();
      if (res.email_change_pending && res.pending_email) {
        setPendingEmail(res.pending_email);
        setMsg(`We emailed a code to ${res.pending_email}. Enter it below to switch — your current email stays until you do.`);
      } else {
        setMsg('Your changes have been saved.');
      }
    } catch (e2: any) {
      setErr(e2?.response?.data?.detail || 'Could not save your changes.');
    } finally {
      setSaving(false);
    }
  };

  const confirmEmail = async () => {
    if (emailCode.trim().length < 4) {
      setErr('Enter the code we emailed to your new address.');
      return;
    }
    setConfirmingEmail(true);
    setErr(null);
    try {
      const res = await authAPI.verifyEmailChange(emailCode.trim());
      await refreshUser();
      setPendingEmail(null);
      setEmailCode('');
      setEmail(res.email);
      setMsg('Your email has been changed.');
    } catch (e2: any) {
      setErr(e2?.response?.data?.detail || 'Invalid or expired code.');
    } finally {
      setConfirmingEmail(false);
    }
  };

  const cancelEmail = async () => {
    try {
      await authAPI.cancelEmailChange();
      await refreshUser();
      setPendingEmail(null);
      setEmailCode('');
      setMsg('The pending email change was cancelled.');
    } catch (e2: any) {
      setErr(e2?.response?.data?.detail || 'Could not cancel the email change.');
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
      <Link to="/menu" className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        <ArrowLeft size={14} /> Back to account
      </Link>

      <header className="mt-6 anim-fade-up">
        <p className="eyebrow">Your account</p>
        <h1 className="font-serif text-4xl sm:text-5xl mt-2">Profile Settings</h1>
      </header>

      {/* Avatar + photo */}
      <section className="mt-8 surface-card p-6 flex items-center gap-5 anim-fade-up delay-100">
        <div className="relative">
          <div className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center font-serif text-3xl"
               style={{ background: 'var(--color-accent)', color: '#0f0f1a' }}>
            {photoUrl ? <img src={photoUrl} alt="" className="w-full h-full object-cover" /> : initial}
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={photoBusy}
            className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-accent)' }}
            aria-label="Change photo"
          >
            {photoBusy ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickPhoto} />
        </div>
        <div>
          <p className="font-serif text-xl">{user?.name ?? 'You'}</p>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={photoBusy} className="text-sm" style={{ color: 'var(--color-accent)' }}>
            {photoBusy ? 'Uploading…' : 'Change photo'}
          </button>
        </div>
      </section>

      {/* Profile details */}
      <section className="mt-6 surface-card p-6 sm:p-8 anim-fade-up delay-200">
        <h2 className="font-serif text-xl flex items-center gap-2"><UserIcon size={18} style={{ color: 'var(--color-accent)' }} /> Your details</h2>

        <div className="mt-5 space-y-4">
          <Field label="Full name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></Field>
          <Field label="Email"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></Field>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Changing your email requires verifying the new address; your current email stays until you confirm.
          </p>
          <Field label="Phone"><input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Your phone" /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="City"><input className="input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" /></Field>
            <Field label="Country"><input className="input" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country" /></Field>
          </div>
        </div>

        {msg && <p className="mt-4 text-sm" style={{ color: 'var(--color-success)' }}>{msg}</p>}
        {err && <p className="mt-4 text-sm" style={{ color: 'var(--color-error)' }}>{err}</p>}

        <button type="button" onClick={save} disabled={saving} className="btn-primary w-full mt-5">
          {saving ? <Loader2 size={18} className="animate-spin" /> : 'Save changes'}
        </button>

        {/* Staged email change — only shown while a change is pending */}
        {pendingEmail && (
          <div className="mt-6 pt-6 border-t" style={{ borderColor: 'var(--color-border)' }}>
            <p className="text-sm flex items-center gap-2 mb-3">
              <Mail size={16} style={{ color: 'var(--color-accent)' }} />
              Confirm your new email ({pendingEmail})
            </p>
            <input className="input" value={emailCode} onChange={(e) => setEmailCode(e.target.value)} placeholder="123456" inputMode="numeric" />
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={confirmEmail} disabled={confirmingEmail} className="btn-primary flex-1">
                {confirmingEmail ? <Loader2 size={16} className="animate-spin" /> : 'Confirm new email'}
              </button>
              <button type="button" onClick={cancelEmail} className="px-4 py-2 rounded-lg text-sm font-medium"
                      style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      <ChangePassword />
      <DeleteAccount />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
      {children}
    </div>
  );
}

function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    setMsg(null);
    if (next.length < 6) { setErr('New password must be at least 6 characters.'); return; }
    if (next !== confirm) { setErr('New passwords do not match.'); return; }
    setBusy(true);
    try {
      await authAPI.changePassword(current, next);
      setMsg('Password changed.');
      setCurrent(''); setNext(''); setConfirm('');
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Could not change your password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-6 surface-card p-6 sm:p-8 anim-fade-up delay-300">
      <h2 className="font-serif text-xl flex items-center gap-2"><KeyRound size={18} style={{ color: 'var(--color-accent)' }} /> Change password</h2>
      <div className="mt-5 space-y-4">
        <Field label="Current password"><input className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
        <Field label="New password"><input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
        <Field label="Confirm new password"><input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
      </div>
      {msg && <p className="mt-4 text-sm" style={{ color: 'var(--color-success)' }}>{msg}</p>}
      {err && <p className="mt-4 text-sm" style={{ color: 'var(--color-error)' }}>{err}</p>}
      <button type="button" onClick={submit} disabled={busy} className="btn-primary w-full mt-5">
        {busy ? <Loader2 size={18} className="animate-spin" /> : 'Update password'}
      </button>
    </section>
  );
}

function DeleteAccount() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await authAPI.deleteAccount();
      logout();
      navigate('/', { replace: true });
    } catch {
      setError('Could not delete your account. Please try again, or email admin@tefillah.in.');
      setDeleting(false);
    }
  };

  return (
    <section className="mt-6 surface-card p-6 sm:p-8 anim-fade-up delay-300" style={{ borderColor: 'var(--color-error)' }}>
      <h2 className="font-serif text-xl flex items-center gap-2" style={{ color: 'var(--color-error)' }}>
        <Trash2 size={18} /> Delete account
      </h2>
      <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
        Permanently deletes your profile, photo, and notifications, and strips your identity from past prayer requests.
        This cannot be undone.
      </p>
      <p className="mt-4 text-sm mb-2">Type <strong>DELETE</strong> to confirm:</p>
      <input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" />
      {error && <p className="mt-3 text-sm" style={{ color: 'var(--color-error)' }}>{error}</p>}
      <button
        type="button"
        onClick={onDelete}
        disabled={confirmText.trim().toUpperCase() !== 'DELETE' || deleting}
        className="mt-4 w-full inline-flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold"
        style={{ background: 'var(--color-error)', color: '#fff', opacity: confirmText.trim().toUpperCase() !== 'DELETE' || deleting ? 0.5 : 1 }}
      >
        {deleting ? <Loader2 size={16} className="animate-spin" /> : <><Trash2 size={16} /> Permanently delete my account</>}
      </button>
    </section>
  );
}
