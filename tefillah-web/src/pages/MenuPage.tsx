import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, History as HistoryIcon, LogOut, Mail, MapPin, Phone, ScrollText, Shield, SlidersHorizontal, Sparkles, User, UserCog } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export default function MenuPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const onLogout = () => {
    logout();
    navigate('/', { replace: true });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
      <header className="anim-fade-up">
        <p className="eyebrow">Account</p>
        <h1 className="font-serif text-4xl sm:text-5xl mt-2">Your space</h1>
      </header>

      {/* Profile card */}
      <section className="mt-8 surface-card p-6 sm:p-8 anim-fade-up delay-100">
        <div className="flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center font-serif text-2xl shrink-0"
            style={{
              background: 'var(--color-accent-glow)',
              color: 'var(--color-accent)',
              border: '1px solid var(--color-border-strong)',
            }}
          >
            {user?.profile_photo_url ? (
              <img src={user.profile_photo_url} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              user?.name?.[0]?.toUpperCase() ?? '·'
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-serif text-2xl truncate">{user?.name ?? '—'}</p>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {user?.is_verified ? 'Verified account' : 'Account awaiting verification'}
            </p>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {user?.email && <DetailRow icon={<Mail size={14} />} label="Email" value={user.email} />}
          {user?.phone && <DetailRow icon={<Phone size={14} />} label="Phone" value={user.phone} />}
          {(user?.location_city || user?.location_country) && (
            <DetailRow
              icon={<MapPin size={14} />}
              label="Location"
              value={[user.location_city, user.location_country].filter(Boolean).join(', ')}
            />
          )}
          {user?.created_at && (
            <DetailRow
              icon={<User size={14} />}
              label="Member since"
              value={new Date(user.created_at).toLocaleDateString()}
            />
          )}
        </dl>
      </section>

      {/* Settings */}
      <p className="mt-8 mb-2 text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--color-text-muted)' }}>
        Settings
      </p>
      <section className="surface-card overflow-hidden anim-fade-up delay-200">
        <ActionRow to="/profile-settings" icon={<UserCog size={18} />} title="Profile Settings" subtitle="Name, email, phone, photo and password" />
        <ActionRow to="/app-settings" icon={<SlidersHorizontal size={18} />} title="App Settings" subtitle="Appearance and preferences" />
      </section>

      {/* Activity & legal */}
      <p className="mt-6 mb-2 text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--color-text-muted)' }}>
        Activity &amp; legal
      </p>
      <section className="surface-card overflow-hidden anim-fade-up delay-200">
        <ActionRow to="/history" icon={<HistoryIcon size={18} />} title="Prayer history" subtitle="Read every petition you have offered" />
        <ActionRow to="/privacy" icon={<Shield size={18} />} title="Privacy Policy" subtitle="How your prayers are handled" />
        <ActionRow to="/terms" icon={<ScrollText size={18} />} title="Terms and Conditions" subtitle="The covenant of using Tefillah" />
      </section>

      <section className="mt-6 anim-fade-up delay-300">
        <button onClick={onLogout} className="btn-ghost w-full justify-center" style={{ color: 'var(--color-error)' }}>
          <LogOut size={16} /> Sign out
        </button>
        <p className="mt-3 text-center text-xs italic" style={{ color: 'var(--color-text-muted)' }}>
          <Sparkles size={12} className="inline mr-1" />
          May the Lord bless you and keep you.
        </p>
      </section>
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div
      className="flex items-start gap-3 p-3 rounded-md"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      <span style={{ color: 'var(--color-accent)' }}>{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--color-text-muted)' }}>{label}</dt>
        <dd className="mt-0.5 break-words">{value}</dd>
      </div>
    </div>
  );
}

function ActionRow({
  to,
  icon,
  title,
  subtitle,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-4 p-4 sm:p-5 border-b last:border-b-0 hover:bg-[color:var(--color-surface)] transition-colors"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <span
        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
        style={{ background: 'var(--color-accent-glow)', color: 'var(--color-accent)' }}
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-medium">{title}</p>
        <p className="text-sm truncate" style={{ color: 'var(--color-text-secondary)' }}>
          {subtitle}
        </p>
      </div>
      <ChevronRight size={16} style={{ color: 'var(--color-text-muted)' }} />
    </Link>
  );
}
