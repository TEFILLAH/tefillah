import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Ban,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Flag,
  Hand,
  Heart,
  Inbox,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  Menu,
  ScrollText,
  Shield,
  ShieldCheck,
  X,
} from 'lucide-react';
import { partnerAPI, type PartnerStats } from '../api/client';
import { useAuthStore } from '../store/authStore';
import NotificationsToggle from '../components/NotificationsToggle';
import AboutTefillah from '../components/AboutTefillah';

interface PartnerRequest {
  id: string;
  content: string;
  category?: string;
  status: string;
  submitted_at: string;
  assigned_at?: string;
  seen_by_partner?: boolean;
  seen_at?: string | null;
  location_city?: string;
  location_country?: string;
  requester_id?: string | null;
}

type Tab = 'overview' | 'requests';

const HOUR_MS = 3600000;

function fmtDate(iso?: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function asArray(r: unknown): PartnerRequest[] {
  if (Array.isArray(r)) return r as PartnerRequest[];
  if (r && typeof r === 'object' && 'requests' in r) {
    const inner = (r as { requests?: unknown }).requests;
    if (Array.isArray(inner)) return inner as PartnerRequest[];
  }
  return [];
}

interface WeekDay {
  date: string;
  label: string;
  initial: string;
  count: number;
}

/**
 * Build a fixed 7-day window (oldest → today) and map the API's sparse
 * weekly_activity (only days that had prayers) onto it, so the chart always
 * shows seven labelled day-bars instead of a single stretched bar.
 */
function buildWeek(activity: Array<{ date: string; count: number }>): WeekDay[] {
  const counts: Record<string, number> = {};
  (activity || []).forEach((d) => {
    counts[d.date] = d.count;
  });
  const out: WeekDay[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    // UTC to match the backend, which groups prayed_at with UTC $dateToString — a
    // local window dropped day-boundary prayers onto the wrong (or missing) bar.
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    out.push({
      date: key,
      label: d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
      initial: d.toLocaleDateString('en-US', { weekday: 'narrow', timeZone: 'UTC' }),
      count: counts[key] ?? 0,
    });
  }
  return out;
}

function extractMessage(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const r = (err as { response?: { data?: { detail?: string } } }).response;
    if (r?.data?.detail) return r.data.detail;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

export default function PartnerDashboardPage() {
  const { partner } = useAuthStore();
  const [stats, setStats] = useState<PartnerStats | null>(null);
  const [recent, setRecent] = useState<PartnerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [reqFilter, setReqFilter] = useState<string | undefined>(undefined);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const goToRequests = (filter?: string) => {
    setReqFilter(filter);
    setTab('requests');
  };

  const fetchData = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([
        partnerAPI.getStats().catch((e: any) => { if (e?.response?.status === 403) setPending(true); return null; }),
        partnerAPI.getRequests(undefined, 1, 5).catch(() => []),
      ]);
      if (s) setStats(s as PartnerStats);
      setRecent(asArray(r));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const firstName = partner?.name?.split(' ')[0] ?? 'friend';
  const initial = partner?.name?.charAt(0)?.toUpperCase() ?? 'P';

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-20 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Partner badge + settings icon */}
      <section className="surface-card p-5 flex items-center gap-4 anim-fade-up">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center font-serif text-2xl shrink-0"
          style={{ background: 'var(--color-accent)', color: '#0f0f1a' }}
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-serif text-2xl leading-tight truncate">{partner?.name ?? 'Partner'}</p>
          <p className="mt-1 inline-flex items-center gap-1.5 text-sm" style={{ color: 'var(--color-accent)' }}>
            <ShieldCheck size={15} /> Prayer Partner
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0 transition-colors hover:opacity-80"
          style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
          aria-label="Menu"
          title="Menu"
        >
          <Menu size={20} />
        </button>
      </section>

      {/* Pending-approval notice: the stats/requests calls 403 until an admin approves,
          and those errors are swallowed — without this the partner just sees zeros. */}
      {pending && (
        <section className="surface-card p-4 mt-4 anim-fade-up" style={{ borderColor: 'var(--color-accent)' }}>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            <strong style={{ color: 'var(--color-accent)' }}>Your prayer-partner account is pending approval.</strong>{' '}
            An administrator will review it shortly. Once approved, you'll be able to see and pray for requests assigned to you.
          </p>
        </section>
      )}

      {/* Tabs */}
      <div className="mt-6 grid grid-cols-2 gap-2 anim-fade-up delay-100">
        {(['overview', 'requests'] as const).map((t) => {
          const active = tab === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="py-2.5 rounded-lg text-sm font-medium capitalize transition-colors"
              style={{
                background: active ? 'var(--color-accent)' : 'var(--color-surface)',
                color: active ? '#0f0f1a' : 'var(--color-text-secondary)',
                border: '1px solid var(--color-border)',
              }}
            >
              {t}
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        {tab === 'overview' && (
          <Overview stats={stats} recent={recent} firstName={firstName} onNavigate={goToRequests} />
        )}
        {tab === 'requests' && <RequestsTab onChanged={fetchData} initialFilter={reqFilter} />}
      </div>

      <AboutTefillah />

      {settingsOpen && <SettingsDrawer onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

/* ----------------------------- Overview tab ----------------------------- */

function Overview({
  stats,
  recent,
  firstName,
  onNavigate,
}: {
  stats: PartnerStats | null;
  recent: PartnerRequest[];
  firstName: string;
  onNavigate: (filter?: string) => void;
}) {
  const week = useMemo(() => buildWeek(stats?.weekly_activity ?? []), [stats?.weekly_activity]);
  const maxCount = useMemo(() => Math.max(1, ...week.map((d) => d.count)), [week]);
  const hasAny = week.some((d) => d.count > 0);

  return (
    <div className="anim-fade-up">
      <p className="text-base sm:text-lg mb-4" style={{ color: 'var(--color-text-secondary)' }}>
        Peace, {firstName}. Here is your watch at a glance.
      </p>

      {/* The four watch buckets — each drills into the matching Requests view. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          icon={<Inbox size={20} />}
          value={stats?.prayers_new ?? 0}
          label="New Prayer Requests"
          tone="accent"
          onClick={() => onNavigate('new')}
        />
        <StatCard
          icon={<Hand size={20} />}
          value={stats?.prayers_assigned ?? 0}
          label="Assigned"
          tone="info"
          onClick={() => onNavigate('assigned')}
        />
        <StatCard
          icon={<AlertTriangle size={20} />}
          value={stats?.prayers_overdue ?? 0}
          label="Pending"
          tone="warning"
          onClick={() => onNavigate('pending')}
        />
        <StatCard
          icon={<Heart size={20} />}
          value={stats?.total_prayers_received ?? 0}
          label="Total Prayers"
          tone="success"
          onClick={() => onNavigate(undefined)}
        />
      </div>

      {/* Performance summary */}
      <div className="surface-card p-6 mt-4">
        <h3 className="font-serif text-xl">Performance Summary</h3>
        <div className="mt-4 flex items-center">
          <div className="flex-1 text-center">
            <p className="font-serif text-3xl" style={{ color: 'var(--color-accent)' }}>
              {(stats?.average_response_time_hours ?? 0).toFixed(1)}h
            </p>
            <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>Avg Response</p>
          </div>
          <div className="w-px h-10 mx-4" style={{ background: 'var(--color-border)' }} />
          <div className="flex-1 text-center">
            <p className="font-serif text-3xl" style={{ color: 'var(--color-accent)' }}>
              {stats?.total_prayer_time_minutes ?? 0}
            </p>
            <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>Total Minutes</p>
          </div>
        </div>
      </div>

      {/* Weekly activity bar graph — always 7 labelled day bars */}
      <div className="surface-card p-6 mt-4">
        <div className="flex items-baseline justify-between">
          <h3 className="font-serif text-xl">Weekly Activity</h3>
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Last 7 days</span>
        </div>
        <div className="mt-5 flex items-end justify-between gap-2 sm:gap-3 h-32">
          {week.map((day) => {
            const h = Math.max(6, Math.round((day.count / maxCount) * 92));
            return (
              <div key={day.date} className="flex-1 flex flex-col items-center justify-end gap-2 h-full">
                <span
                  className="text-xs font-semibold"
                  style={{ color: day.count ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
                >
                  {day.count || ''}
                </span>
                <div
                  className="w-full max-w-[2.5rem] rounded-md transition-all"
                  style={{
                    height: `${h}px`,
                    background: day.count ? 'var(--color-accent)' : 'var(--color-border-strong)',
                    opacity: day.count ? 1 : 0.45,
                  }}
                  title={`${day.count} prayer${day.count === 1 ? '' : 's'} · ${day.label}`}
                />
                <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
                  {day.initial}
                </span>
              </div>
            );
          })}
        </div>
        {!hasAny && (
          <p className="mt-4 text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>
            No prayer activity in the last 7 days yet.
          </p>
        )}
      </div>

      {/* Recent requests */}
      <div className="surface-card p-6 mt-4">
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-xl">Recent Requests</h3>
          <button
            type="button"
            onClick={() => onNavigate(undefined)}
            className="text-sm font-medium"
            style={{ color: 'var(--color-accent)' }}
          >
            View All
          </button>
        </div>
        {recent.length > 0 ? (
          <div className="mt-3 divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {recent.slice(0, 3).map((req) => (
              <div key={req.id} className="py-3 first:pt-0">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-xs font-semibold capitalize px-2 py-0.5 rounded"
                    style={{ background: 'var(--color-accent-glow)', color: 'var(--color-accent)' }}
                  >
                    {req.category || 'Prayer'}
                  </span>
                  <StatusBadge status={req.status} seen={req.seen_by_partner} />
                </div>
                <p className="mt-2 text-sm leading-relaxed line-clamp-2">{req.content}</p>
                <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {fmtDate(req.submitted_at)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>No requests yet.</p>
        )}
      </div>
    </div>
  );
}

type Tone = 'accent' | 'success' | 'warning' | 'info';

const TONE_COLORS: Record<Tone, string> = {
  accent: 'var(--color-accent)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  info: '#5b8def',
};

function StatCard({
  icon,
  value,
  label,
  tone,
  onClick,
}: {
  icon: React.ReactNode;
  value: number | string;
  label: string;
  tone: Tone;
  onClick?: () => void;
}) {
  const color = TONE_COLORS[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className="surface-card p-4 sm:p-5 flex flex-col items-center text-center w-full transition-transform hover:-translate-y-0.5 active:translate-y-0"
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <div
        className="w-11 h-11 rounded-full flex items-center justify-center"
        style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
      >
        {icon}
      </div>
      <p className="mt-3 font-serif text-3xl">{value}</p>
      <p className="mt-1 text-xs leading-tight" style={{ color: 'var(--color-text-secondary)' }}>{label}</p>
    </button>
  );
}

function StatusBadge({ status, seen }: { status: string; seen?: boolean }) {
  let label = status;
  let color = 'var(--color-warning)';
  if (status === 'prayed') {
    label = 'prayed';
    color = 'var(--color-success)';
  } else if (status === 'assigned' && !seen) {
    label = 'new';
    color = 'var(--color-accent)';
  } else if (status === 'assigned') {
    label = 'assigned';
    color = '#5b8def';
  }
  return (
    <span
      className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded"
      style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
    >
      {label}
    </span>
  );
}

/* ----------------------------- Requests tab ----------------------------- */

const FILTERS: { label: string; value?: string }[] = [
  { label: 'New', value: 'new' },
  { label: 'Assigned', value: 'assigned' },
  { label: 'Pending', value: 'pending' },
  { label: 'Prayed', value: 'prayed' },
  { label: 'All', value: undefined },
];

function RequestsTab({ onChanged, initialFilter }: { onChanged: () => void; initialFilter?: string }) {
  const [requests, setRequests] = useState<PartnerRequest[]>([]);
  const [filter, setFilter] = useState<string | undefined>(initialFilter);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await partnerAPI.getRequests(filter, 1, 50);
      setRequests(asArray(r));
    } catch (err) {
      setError(extractMessage(err, 'Could not load requests.'));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const openRequest = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      await partnerAPI.markSeen(id);
      setNotice('Request opened. You can mark it as prayed after 60 minutes of prayer.');
      await load();
      onChanged();
    } catch (err) {
      setError(extractMessage(err, 'Could not open this request.'));
    } finally {
      setBusy(null);
    }
  };

  const markPrayed = async (id: string) => {
    setBusy(id);
    setNotice(null);
    setError(null);
    try {
      await partnerAPI.markPrayed(id, 5);
      setNotice('Prayer completed. May God bless you.');
      await load();
      onChanged();
    } catch (err) {
      setError(extractMessage(err, 'Could not mark this as prayed.'));
    } finally {
      setBusy(null);
    }
  };

  const reportRequest = async (id: string, reason: string) => {
    setBusy(id);
    setNotice(null);
    setError(null);
    try {
      const res = await partnerAPI.report(id, reason || undefined);
      setNotice(res.message || 'Reported for review.');
      await load();
      onChanged();
    } catch (err) {
      setError(extractMessage(err, 'Could not report this request.'));
    } finally {
      setBusy(null);
    }
  };

  const blockRequester = async (id: string, requesterId: string) => {
    setBusy(id);
    setNotice(null);
    setError(null);
    try {
      const res = await partnerAPI.blockUser(requesterId);
      setNotice(res.message || 'Requester blocked.');
      await load();
      onChanged();
    } catch (err) {
      setError(extractMessage(err, 'Could not block this requester.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="anim-fade-up">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = filter === f.value;
          return (
            <button
              key={f.label}
              type="button"
              onClick={() => setFilter(f.value)}
              className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: active ? 'var(--color-accent)' : 'var(--color-surface)',
                color: active ? '#0f0f1a' : 'var(--color-text-secondary)',
                border: '1px solid var(--color-border)',
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {notice && (
        <div
          className="mt-4 surface-card p-3 text-sm flex items-center gap-2"
          style={{ color: 'var(--color-success)' }}
        >
          <CheckCircle2 size={16} /> {notice}
        </div>
      )}
      {error && (
        <div className="mt-4 surface-card p-3 text-sm" style={{ color: 'var(--color-error)' }}>
          {error}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {loading && (
          <div className="surface-card p-10 flex justify-center">
            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
          </div>
        )}
        {!loading && requests.length === 0 && (
          <div className="surface-card p-10 text-center">
            <CheckCircle2 size={22} className="mx-auto" style={{ color: 'var(--color-success)' }} />
            <p className="mt-3 font-serif text-2xl">All caught up.</p>
            <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              No requests in this view right now.
            </p>
          </div>
        )}
        {!loading &&
          requests.map((req) => (
            <RequestCard
              key={req.id}
              req={req}
              busy={busy === req.id}
              onOpen={openRequest}
              onPray={markPrayed}
              onReport={reportRequest}
              onBlock={blockRequester}
            />
          ))}
      </div>
    </div>
  );
}

function RequestCard({
  req,
  busy,
  onOpen,
  onPray,
  onReport,
  onBlock,
}: {
  req: PartnerRequest;
  busy: boolean;
  onOpen: (id: string) => void;
  onPray: (id: string) => void;
  onReport: (id: string, reason: string) => void;
  onBlock: (id: string, requesterId: string) => void;
}) {
  const [, forceTick] = useState(0);
  const [modOpen, setModOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');

  const isPrayed = req.status === 'prayed';
  const isNew = req.status === 'assigned' && !req.seen_by_partner;
  const isOpened = req.status === 'assigned' && !!req.seen_by_partner;

  // The 60-minute minimum runs from when the partner OPENED the request.
  const seenAt = req.seen_at ? new Date(req.seen_at).getTime() : 0;
  const elapsed = seenAt ? Date.now() - seenAt : 0;
  const canMark = isOpened && seenAt > 0 && elapsed >= HOUR_MS;
  const remainingMin = canMark ? 0 : Math.max(1, Math.ceil((HOUR_MS - elapsed) / 60000));

  // Re-render once a minute so the "wait" countdown stays live.
  useEffect(() => {
    if (!isOpened || canMark) return;
    const t = setInterval(() => forceTick((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, [isOpened, canMark]);

  return (
    <article
      className="surface-card p-5"
      style={isNew ? { borderColor: 'var(--color-accent)', borderWidth: 1 } : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-xs font-semibold capitalize px-2 py-0.5 rounded"
          style={{ background: 'var(--color-accent-glow)', color: 'var(--color-accent)' }}
        >
          {req.category || 'Prayer'}
        </span>
        <StatusBadge status={req.status} seen={req.seen_by_partner} />
      </div>

      {(req.location_city || req.location_country) && (
        <div className="mt-2 flex items-center gap-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          <MapPin size={13} />
          {[req.location_city, req.location_country].filter(Boolean).join(', ')}
        </div>
      )}

      <p className="mt-3 font-serif text-lg leading-relaxed">{req.content}</p>

      <p className="mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {fmtDate(req.submitted_at)}
      </p>

      {isNew && (
        <button
          type="button"
          onClick={() => onOpen(req.id)}
          disabled={busy}
          className="mt-4 w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          style={{ background: 'var(--color-accent)', color: '#0f0f1a', border: '1px solid var(--color-border)' }}
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <><Inbox size={16} /> Open Request</>}
        </button>
      )}

      {isOpened && (
        <button
          type="button"
          onClick={() => canMark && onPray(req.id)}
          disabled={!canMark || busy}
          className="mt-4 w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          style={{
            background: canMark ? 'var(--color-accent)' : 'var(--color-surface)',
            color: canMark ? '#0f0f1a' : 'var(--color-text-muted)',
            border: '1px solid var(--color-border)',
            cursor: canMark ? 'pointer' : 'not-allowed',
          }}
          title={canMark ? 'Mark as prayed' : `Please spend time in prayer — available in ${remainingMin}m`}
        >
          {busy ? (
            <Loader2 size={16} className="animate-spin" />
          ) : canMark ? (
            <><Check size={16} /> Mark as Prayed</>
          ) : (
            <><Clock size={16} /> Wait {remainingMin}m</>
          )}
        </button>
      )}

      {isPrayed && (
        <div
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold"
          style={{ color: 'var(--color-success)' }}
        >
          <CheckCircle2 size={16} /> Prayed over
        </div>
      )}

      {/* Moderation — report an objectionable request or block the requester.
          Required so prayer partners can flag abusive user-generated content. */}
      {!isPrayed && (
        <div className="mt-4 pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
          {!modOpen ? (
            <button
              type="button"
              onClick={() => setModOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium transition-colors"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <Flag size={13} /> Report or block
            </button>
          ) : (
            <div className="anim-fade-up">
              <p className="text-xs mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                Report this request if it's abusive, hateful or inappropriate. It will be
                reviewed and removed from your queue.
              </p>
              <textarea
                className="input w-full text-sm"
                rows={2}
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder="Reason (optional)"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onReport(req.id, reportReason.trim())}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
                  style={{ background: 'var(--color-error)', color: '#fff', opacity: busy ? 0.5 : 1 }}
                >
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <><Flag size={13} /> Report request</>}
                </button>
                {req.requester_id && (
                  <button
                    type="button"
                    onClick={() => onBlock(req.id, req.requester_id as string)}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
                    style={{ border: '1px solid var(--color-border)', color: 'var(--color-error)', opacity: busy ? 0.5 : 1 }}
                  >
                    <Ban size={13} /> Block requester
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setModOpen(false); setReportReason(''); }}
                  disabled={busy}
                  className="inline-flex items-center px-3 py-2 rounded-lg text-xs font-medium"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

/* ---------------------------- Settings drawer --------------------------- */

function SettingsDrawer({ onClose }: { onClose: () => void }) {
  const { partner, logout } = useAuthStore();
  const navigate = useNavigate();

  const [name, setName] = useState(partner?.name ?? '');
  const [phone, setPhone] = useState(partner?.phone ?? '');
  const [organization, setOrganization] = useState(partner?.organization ?? '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const dirty =
    name.trim() !== (partner?.name ?? '') ||
    phone.trim() !== (partner?.phone ?? '') ||
    organization.trim() !== (partner?.organization ?? '');

  const save = async () => {
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      await partnerAPI.updateProfile({
        name: name.trim(),
        phone: phone.trim(),
        organization: organization.trim(),
      });
      useAuthStore.setState((s) => ({
        partner: s.partner
          ? { ...s.partner, name: name.trim(), phone: phone.trim(), organization: organization.trim() }
          : s.partner,
      }));
      setMsg('Saved.');
    } catch (e) {
      setErr(extractMessage(e, 'Could not save your changes.'));
    } finally {
      setSaving(false);
    }
  };

  const signOut = () => {
    logout();
    navigate('/', { replace: true });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.5)' }}
        onClick={onClose}
        aria-hidden
      />
      {/* Panel */}
      <div
        className="relative w-full max-w-md h-full overflow-y-auto shadow-2xl anim-slide-in"
        style={{ background: 'var(--color-bg, var(--color-surface))', borderLeft: '1px solid var(--color-border)' }}
      >
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-5 py-4"
          style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}
        >
          <h2 className="font-serif text-xl">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Edit organisation */}
          <section className="surface-card p-5">
            <h3 className="font-serif text-lg flex items-center gap-2">
              <Building2 size={18} style={{ color: 'var(--color-accent)' }} /> Congregation &amp; details
            </h3>

            {partner?.email && (
              <p className="mt-3 inline-flex items-center gap-1.5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                <Mail size={14} /> {partner.email}
              </p>
            )}

            <div className="mt-4 space-y-4">
              <Field label="Name">
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
              </Field>
              <Field label="Phone">
                <input
                  className="input"
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Your phone"
                />
              </Field>
              <Field label="Congregation">
                <input
                  className="input"
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  placeholder="Your church or congregation"
                />
              </Field>
            </div>

            {msg && <p className="mt-3 text-sm" style={{ color: 'var(--color-success)' }}>{msg}</p>}
            {err && <p className="mt-3 text-sm" style={{ color: 'var(--color-error)' }}>{err}</p>}

            <button
              type="button"
              onClick={save}
              disabled={saving || !dirty}
              className="btn-primary w-full mt-4"
              style={{ opacity: !dirty ? 0.6 : 1 }}
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : 'Save Changes'}
            </button>
          </section>

          {/* Notifications */}
          <section className="surface-card p-5">
            <NotificationsToggle />
          </section>

          {/* Legal */}
          <section className="surface-card overflow-hidden">
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 border-b transition-colors hover:bg-[color:var(--color-surface)]"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <Shield size={18} style={{ color: 'var(--color-accent)' }} />
              <span className="flex-1 text-sm font-medium">Privacy Policy</span>
              <ChevronRight size={16} style={{ color: 'var(--color-text-muted)' }} />
            </a>
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 transition-colors hover:bg-[color:var(--color-surface)]"
            >
              <ScrollText size={18} style={{ color: 'var(--color-accent)' }} />
              <span className="flex-1 text-sm font-medium">Terms and Conditions</span>
              <ChevronRight size={16} style={{ color: 'var(--color-text-muted)' }} />
            </a>
          </section>

          {/* Sign out */}
          <button
            type="button"
            onClick={signOut}
            className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold transition-colors"
            style={{ border: '1px solid var(--color-border)', color: 'var(--color-error)', background: 'var(--color-surface)' }}
          >
            <LogOut size={18} /> Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
        {label}
      </p>
      {children}
    </div>
  );
}
