import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  Clock,
  Heart,
  RefreshCw,
  ScrollText,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
  UserX,
} from 'lucide-react';
import { adminApi, adminErr, type AdminStats, type AnalyticsData } from '../adminApi';
import { useAdminAuth } from '../adminAuth';
import { AdminPage, CountUp, ErrorState, LoadingState } from '../adminUi';
import AdminLogo from '../AdminLogo';

type Period = 'day' | 'week' | 'month';
type Pt = { date: string; count: number };

const C = {
  gold: '#e5b93d',
  cyan: '#35e0e0',
  violet: '#a78bfa',
  emerald: '#38d39b',
  rose: '#fb7185',
  amber: '#fbbf24',
  blue: '#5aa8ff',
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night';
}

export default function DashboardPage() {
  const { admin } = useAdminAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [period, setPeriod] = useState<Period>('week');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = async (isRefresh = false, isCancelled: () => boolean = () => false) => {
    if (isRefresh) setRefreshing(true);
    try {
      // Stats is the hard requirement; analytics is optional (an admin without
      // view_analytics 403s on it). Don't let a missing chart blank the whole
      // dashboard — the chart/series code already handles null/empty analytics.
      const [s, a] = await Promise.all([
        adminApi.getStats(),
        adminApi.getAnalytics(period).catch(() => null),
      ]);
      if (isCancelled()) return; // a newer period was selected — don't show stale data
      setStats(s);
      setAnalytics(a);
      setUpdatedAt(new Date());
      setError(null);
    } catch (err) {
      if (isCancelled()) return;
      setError(adminErr(err, 'Could not load dashboard data.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let cancelled = false;
    load(false, () => cancelled);
    return () => { cancelled = true; };
  }, [period]);

  const series = useMemo(() => {
    const a = analytics;
    return {
      users: a?.user_registrations ?? [],
      prayers: a?.prayer_submissions ?? [],
      partners: a?.partner_registrations ?? [],
      completions: a?.prayer_completions ?? [],
    };
  }, [analytics]);

  return (
    <AdminPage>
      {/* ---- Hero greeting ---- */}
      <div className="admin-hero p-5 sm:p-6 mb-6 admin-fade-up">
        <div className="relative flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <AdminLogo size={56} />
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] admin-grad-gold font-semibold">{greeting()}</p>
              <h1 className="font-serif text-2xl sm:text-3xl text-white leading-tight mt-0.5">
                {admin?.name ?? 'Admin'}
              </h1>
              <p className="text-[13px] text-[color:var(--t3)] mt-0.5">
                {admin?.is_super_admin ? 'Super Administrator' : 'Administrator'} · Tefillah control room
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="admin-seg">
              {(['day', 'week', 'month'] as Period[]).map((p) => (
                <button key={p} className={period === p ? 'is-active' : ''} onClick={() => setPeriod(p)}>
                  {p}
                </button>
              ))}
            </div>
            <button onClick={() => load(true)} className="admin-btn" aria-label="Refresh">
              <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>
        {updatedAt && (
          <p className="relative mt-3 text-[11px] text-[color:var(--t3)] flex items-center gap-2">
            <span className="admin-dot" style={{ color: C.emerald, background: C.emerald }} />
            Live · updated {updatedAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
          </p>
        )}
      </div>

      {loading && <LoadingState label="Loading control room…" />}
      {!loading && error && <ErrorState message={error} />}

      {!loading && !error && stats && (
        <>
          {/* ---- Stat tiles ---- */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <StatTile i={0} to="/admin/users" icon={<Users size={17} />} label="Total Users" value={stats.total_users} color={C.gold} spark={series.users} />
            <StatTile i={1} to="/admin/partners" icon={<Heart size={17} />} label="Prayer Partners" value={stats.total_partners} color={C.violet} spark={series.partners} />
            <StatTile i={2} to="/admin/prayers" icon={<ScrollText size={17} />} label="Total Prayers" value={stats.total_prayers} color={C.cyan} spark={series.prayers} />
            <StatTile i={3} to="/admin/prayers" icon={<Clock size={17} />} label="Pending" value={stats.prayers_pending} color={C.amber} />
            <StatTile i={4} to="/admin/prayers" icon={<CheckCircle2 size={17} />} label="Answered" value={stats.prayers_completed} color={C.emerald} spark={series.completions} />
            <StatTile i={5} icon={<Sparkles size={17} />} label="Active Today" value={stats.active_users_today} color={C.blue} />
          </div>

          {/* ---- Activity chart + pipeline ---- */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-5">
            <section className="admin-card p-5 sm:p-6 lg:col-span-2 admin-fade-up admin-d2">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-white text-base font-semibold flex items-center gap-2">
                    <TrendingUp size={16} style={{ color: C.gold }} /> Activity over time
                  </h2>
                  <p className="text-[13px] text-[color:var(--t3)] mt-0.5">
                    Per {period === 'day' ? 'hour' : 'day'}, last {period === 'day' ? '24 hours' : period === 'week' ? '7 days' : '30 days'}.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
                  <Legend color={C.gold} label="Members" />
                  <Legend color={C.cyan} label="Prayers" />
                  <Legend color={C.emerald} label="Answered" />
                </div>
              </div>
              <AreaChart
                lines={[
                  { points: series.users, color: C.gold },
                  { points: series.prayers, color: C.cyan },
                  { points: series.completions, color: C.emerald },
                ]}
              />
            </section>

            <section className="admin-card p-5 sm:p-6 admin-fade-up admin-d3">
              <h2 className="text-white text-base font-semibold mb-1">Prayer pipeline</h2>
              <p className="text-[13px] text-[color:var(--t3)] mb-4">Where every request stands right now.</p>
              <Donut
                segments={[
                  { label: 'Pending', value: stats.prayers_pending, color: C.amber },
                  { label: 'Assigned', value: stats.prayers_assigned, color: C.gold },
                  { label: 'Answered', value: stats.prayers_completed, color: C.emerald },
                ]}
                centerLabel="Total"
                centerValue={stats.total_prayers}
              />
            </section>
          </div>

          {/* ---- Community health ---- */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-5">
            <section className="admin-card p-5 sm:p-6 admin-fade-up admin-d3">
              <h2 className="text-white text-base font-semibold mb-4">Members</h2>
              <HealthRow icon={<UserCheck size={15} />} label="Active" value={stats.users_active} tone={C.emerald} total={stats.total_users} />
              <HealthRow icon={<UserX size={15} />} label="Suspended" value={stats.users_suspended} tone={C.rose} total={stats.total_users} />
              <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--line)' }}>
                <MiniKpi label="New this week" value={stats.new_users_this_week} tone={C.gold} />
              </div>
            </section>

            <section className="admin-card p-5 sm:p-6 admin-fade-up admin-d4">
              <h2 className="text-white text-base font-semibold mb-4">Partners</h2>
              <HealthRow icon={<Heart size={15} />} label="Active" value={stats.partners_active} tone={C.emerald} total={stats.total_partners} />
              <HealthRow icon={<Clock size={15} />} label="Pending approval" value={stats.partners_pending_approval} tone={C.amber} total={stats.total_partners} />
              <HealthRow icon={<UserX size={15} />} label="Inactive" value={stats.partners_inactive} tone={C.rose} total={stats.total_partners} />
              <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--line)' }}>
                <MiniKpi label="New this week" value={stats.new_partners_this_week} tone={C.violet} />
              </div>
            </section>

            <section className="admin-card p-5 sm:p-6 admin-fade-up admin-d5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white text-base font-semibold">Verse helper</h2>
                <Link to="/admin/analytics" className="text-[12px]" style={{ color: C.gold }}>
                  Analytics →
                </Link>
              </div>
              <p className="text-4xl font-light text-white admin-num leading-none">
                <CountUp value={stats.total_llm_requests} />
              </p>
              <p className="text-[12px] text-[color:var(--t3)] mt-1">scripture suggestions generated</p>
              <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--line)' }}>
                <MiniKpi label="Tokens used" value={stats.llm_tokens_used} tone={C.cyan} />
              </div>
            </section>
          </div>
        </>
      )}
    </AdminPage>
  );
}

/* ------------------------------------------------------------------ tiles */

function StatTile({
  i,
  icon,
  label,
  value,
  color,
  to,
  spark,
}: {
  i: number;
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
  to?: string;
  spark?: Pt[];
}) {
  const body = (
    <div className={`admin-card admin-card-hover p-4 h-full admin-fade-up admin-d${Math.min(6, i + 1)}`}>
      <div className="flex items-center justify-between">
        <span
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg"
          style={{ background: `${color}1f`, color, boxShadow: `0 0 18px ${color}22` }}
        >
          {icon}
        </span>
        {spark && spark.length > 1 && <Sparkline points={spark} color={color} />}
      </div>
      <p className="font-light text-2xl sm:text-[1.7rem] text-white mt-3 admin-num leading-none" style={{ textShadow: `0 0 22px ${color}22` }}>
        <CountUp value={value} />
      </p>
      <p className="text-[12px] text-[color:var(--t3)] mt-1.5">{label}</p>
    </div>
  );
  return to ? (
    <Link to={to} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[color:var(--t2)]">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
      {label}
    </span>
  );
}

function MiniKpi({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px] text-[color:var(--t3)]">{label}</span>
      <span className="text-lg font-medium admin-num" style={{ color: tone }}>
        <CountUp value={value} />
      </span>
    </div>
  );
}

function HealthRow({ icon, label, value, tone, total }: { icon: React.ReactNode; label: string; value: number; tone: string; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-center justify-between text-[13px] mb-1.5">
        <span className="flex items-center gap-2 text-[color:var(--t2)]">
          <span style={{ color: tone }}>{icon}</span>
          {label}
        </span>
        <span className="admin-num">
          <span className="text-white font-medium">{value.toLocaleString()}</span>
          <span className="text-[color:var(--t3)] text-[11px]"> · {pct}%</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: tone, boxShadow: `0 0 10px ${tone}` }} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ charts */

function Sparkline({ points, color }: { points: Pt[]; color: string }) {
  const W = 66;
  const H = 26;
  if (points.length < 2) return <div style={{ width: W, height: H }} />;
  const max = Math.max(1, ...points.map((d) => d.count));
  const coords = points.map((d, i) => {
    const x = (i / (points.length - 1)) * W;
    const y = H - 2 - (d.count / max) * (H - 4);
    return { x, y };
  });
  const line = coords.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;
  const gid = `sp-${color.replace('#', '')}`;
  return (
    <svg width={W} height={H} className="shrink-0" aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function niceCeil(n: number): number {
  if (n <= 5) return 5;
  const pow = Math.pow(10, Math.floor(Math.log10(n)));
  const frac = n / pow;
  const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  return nice * pow;
}

function fmtAxisDate(iso: string): string {
  const d = new Date(iso.replace(' ', 'T'));
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function AreaChart({ lines, height = 250 }: { lines: { points: Pt[]; color: string }[]; height?: number }) {
  const W = 760;
  const H = height;
  const padL = 34;
  const padR = 14;
  const padT = 14;
  const padB = 28;

  const all = lines.flatMap((s) => s.points);
  if (all.length === 0) {
    return <p className="text-center text-[color:var(--t3)] py-16 text-sm">No activity for this period yet.</p>;
  }
  // Zero-fill: align every series to the shared, sorted union of dates so a
  // series with fewer buckets plots against the correct dates (not by index).
  const dates = Array.from(new Set(all.map((d) => d.date))).sort();
  const filled = lines.map((s) => ({
    color: s.color,
    points: dates.map((d) => s.points.find((p) => p.date === d) ?? { date: d, count: 0 }),
  }));
  const niceMax = niceCeil(Math.max(1, ...all.map((d) => d.count)));
  const n = dates.length;
  const xFor = (i: number) => (n <= 1 ? (W - padL - padR) / 2 + padL : padL + (i / (n - 1)) * (W - padL - padR));
  const yFor = (v: number) => padT + (1 - v / niceMax) * (H - padT - padB);
  const yTicks = [0, niceMax / 2, niceMax];
  const labelIdx = n <= 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }}>
      {yTicks.map((t, i) => {
        const y = yFor(t);
        return (
          <g key={i}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            <text x={padL - 8} y={y + 3} textAnchor="end" fontSize="10" fill="#7c7c8e">{Math.round(t)}</text>
          </g>
        );
      })}
      {filled.map((s, si) => {
        if (s.points.length === 0) return null;
        const pts = s.points.map((d, i) => ({ x: xFor(i), y: yFor(d.count) }));
        const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
        const area = `${line} L${pts[pts.length - 1].x.toFixed(1)},${yFor(0)} L${pts[0].x.toFixed(1)},${yFor(0)} Z`;
        const gid = `ac-${s.color.replace('#', '')}-${si}`;
        return (
          <g key={si}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.22" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill={`url(#${gid})`} />
            <path d={line} fill="none" stroke={s.color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 4px ${s.color}66)` }} />
          </g>
        );
      })}
      {labelIdx.map((i) => (
        <text key={i} x={xFor(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="#7c7c8e">
          {fmtAxisDate(dates[i] ?? '')}
        </text>
      ))}
    </svg>
  );
}

function Donut({
  segments,
  centerLabel,
  centerValue,
}: {
  segments: { label: string; value: number; color: string }[];
  centerLabel: string;
  centerValue: number;
}) {
  const size = 168;
  const stroke = 20;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const total = segments.reduce((a, s) => a + s.value, 0);
  let offset = 0;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="rotate-[-90deg]" aria-hidden>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
          {total > 0 &&
            segments.map((s) => {
              const frac = s.value / total;
              const dash = frac * circ;
              const el = (
                <circle
                  key={s.label}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={stroke}
                  strokeDasharray={`${dash} ${circ - dash}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="round"
                  style={{ filter: `drop-shadow(0 0 5px ${s.color}88)`, transition: 'stroke-dasharray 700ms ease' }}
                />
              );
              offset += dash;
              return el;
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-2xl font-light text-white admin-num leading-none">
            <CountUp value={centerValue} />
          </p>
          <p className="text-[10px] uppercase tracking-widest text-[color:var(--t3)] mt-1">{centerLabel}</p>
        </div>
      </div>
      <div className="w-full space-y-2 mt-5">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center justify-between text-[13px]">
            <span className="flex items-center gap-2 text-[color:var(--t2)]">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color, boxShadow: `0 0 8px ${s.color}` }} />
              {s.label}
            </span>
            <span className="text-white admin-num font-medium">{s.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
