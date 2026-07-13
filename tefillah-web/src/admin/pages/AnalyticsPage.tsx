import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Heart, Minus, Sparkles, Users } from 'lucide-react';
import { adminApi, adminErr, type AnalyticsData } from '../adminApi';
import { AdminPage, AdminPageHeader, ErrorState, LoadingState } from '../adminUi';

type Period = 'day' | 'week' | 'month';

// Neon control-room palette — brand gold + cyan/emerald data-viz accents, on dark.
const GOLD = '#e5b93d';
const SLATE = '#35e0e0';
const EMERALD = '#38d39b';
const UP = '#38d39b';
const DOWN = '#fb7185';

interface Series {
  date: string;
  count: number;
}

function fmtAxisDate(iso: string): string {
  const d = new Date(iso.replace(' ', 'T'));
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function sum(s: Series[]): number {
  return s.reduce((a, d) => a + d.count, 0);
}

// Trend = second half vs first half of the window, as a signed percentage.
function trendPct(s: Series[]): number | null {
  if (s.length < 2) return null;
  const mid = Math.floor(s.length / 2);
  const first = sum(s.slice(0, mid));
  const second = sum(s.slice(mid));
  if (first === 0) return second > 0 ? 100 : null;
  return ((second - first) / first) * 100;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [period, setPeriod] = useState<Period>('week');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    adminApi
      .getAnalytics(period)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((err) => !cancelled && setError(adminErr(err, 'Could not load analytics.')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [period]);

  const llmSeries = useMemo<Series[]>(
    () => (data ? data.llm_usage.map((d) => ({ date: d.date, count: d.requests })) : []),
    [data],
  );

  const kpis = useMemo(() => {
    if (!data) return null;
    const members = data.user_registrations;
    const prayers = data.prayer_submissions;
    const days = Math.max(1, prayers.length);
    return {
      members: { value: sum(members), trend: trendPct(members), series: members },
      prayers: { value: sum(prayers), trend: trendPct(prayers), series: prayers },
      avgPerDay: { value: Math.round(sum(prayers) / days), trend: trendPct(prayers), series: prayers },
      verses: { value: sum(llmSeries), trend: trendPct(llmSeries), series: llmSeries },
    };
  }, [data, llmSeries]);

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Admin"
        title="Analytics"
        right={
          <div className="admin-seg">
            {(['day', 'week', 'month'] as Period[]).map((p) => (
              <button key={p} onClick={() => setPeriod(p)} className={period === p ? 'is-active' : ''}>
                {p}
              </button>
            ))}
          </div>
        }
      />

      {loading && <LoadingState label="Loading analytics…" />}
      {!loading && error && <ErrorState message={error} />}

      {!loading && !error && data && kpis && (
        <div className="space-y-5">
          {/* KPI ROW */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <KpiCard label="New members" value={kpis.members.value} trend={kpis.members.trend} series={kpis.members.series} icon={<Users size={15} />} color={GOLD} />
            <KpiCard label="Prayers submitted" value={kpis.prayers.value} trend={kpis.prayers.trend} series={kpis.prayers.series} icon={<Heart size={15} />} color={SLATE} />
            <KpiCard label="Avg / day" value={kpis.avgPerDay.value} trend={kpis.avgPerDay.trend} series={kpis.avgPerDay.series} icon={<Minus size={15} />} color={SLATE} />
            <KpiCard label="Verses generated" value={kpis.verses.value} trend={kpis.verses.trend} series={kpis.verses.series} icon={<Sparkles size={15} />} color={GOLD} />
          </div>

          {/* MAIN CHART */}
          <section className="admin-card p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
              <div>
                <h3 className="text-white text-base font-semibold">Activity over time</h3>
                <p className="text-[13px] text-gray-500 mt-0.5">Member sign-ups and prayer submissions per {period === 'day' ? 'hour' : 'day'}.</p>
              </div>
              <div className="flex items-center gap-4 text-[13px]">
                <LegendDot color={GOLD} label="Members" />
                <LegendDot color={SLATE} label="Prayers" />
                <LegendDot color={EMERALD} label="Answered" />
              </div>
            </div>
            <LineChart
              series={[
                { points: data.user_registrations, color: GOLD },
                { points: data.prayer_submissions, color: SLATE },
                { points: data.prayer_completions ?? [], color: EMERALD },
              ]}
            />
          </section>

          {/* TWO COLUMNS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <section className="admin-card p-5 sm:p-6">
              <h3 className="text-white text-base font-semibold">Prayer categories</h3>
              <p className="text-[13px] text-gray-500 mt-0.5 mb-5">Distribution of requests by topic.</p>
              <CategoryBreakdown categories={data.prayer_categories} />
            </section>

            <section className="admin-card p-5 sm:p-6 flex flex-col">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-white text-base font-semibold">Verse helper</h3>
                  <p className="text-[13px] text-gray-500 mt-0.5">Scripture suggestions generated.</p>
                </div>
                <div className="text-right">
                  <p className="text-3xl text-white font-light tabular-nums">{kpis.verses.value.toLocaleString()}</p>
                  <p className="text-[12px] text-gray-500">total this period</p>
                </div>
              </div>
              <div className="mt-auto pt-5">
                <LineChart series={[{ points: llmSeries, color: GOLD }]} height={150} compact />
              </div>
            </section>
          </div>
        </div>
      )}
    </AdminPage>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-gray-400">
      <span className="w-2.5 h-0.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function TrendChip({ trend }: { trend: number | null }) {
  if (trend === null) {
    return <span className="text-[12px] text-gray-600">—</span>;
  }
  const up = trend >= 0;
  const color = Math.abs(trend) < 0.5 ? '#6b7280' : up ? UP : DOWN;
  const Icon = Math.abs(trend) < 0.5 ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-medium" style={{ color }}>
      <Icon size={13} />
      {Math.abs(trend).toFixed(1)}%
    </span>
  );
}

function KpiCard({
  label,
  value,
  trend,
  series,
  icon,
  color,
}: {
  label: string;
  value: number;
  trend: number | null;
  series: Series[];
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="admin-card p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.1em] text-gray-500 font-medium">{label}</span>
        <span className="text-gray-600">{icon}</span>
      </div>
      <div className="flex items-end justify-between gap-3 mt-2">
        <div>
          <p className="text-3xl text-white font-light tabular-nums leading-none">{value.toLocaleString()}</p>
          <div className="mt-2">
            <TrendChip trend={trend} />
            <span className="text-[11px] text-gray-600 ml-1">vs first half</span>
          </div>
        </div>
        <Sparkline series={series} color={color} />
      </div>
    </div>
  );
}

function Sparkline({ series, color }: { series: Series[]; color: string }) {
  const W = 72;
  const H = 32;
  if (series.length < 2) return <div style={{ width: W, height: H }} />;
  const max = Math.max(1, ...series.map((d) => d.count));
  const pts = series.map((d, i) => {
    const x = (i / (series.length - 1)) * W;
    const y = H - 2 - (d.count / max) * (H - 4);
    return `${x},${y}`;
  });
  return (
    <svg width={W} height={H} className="shrink-0">
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.85" />
    </svg>
  );
}

/**
 * Professional multi-series line chart with a value axis, date axis, and
 * subtle gridlines. No markers clutter; thin lines; restrained palette.
 */
function LineChart({
  series,
  height = 260,
  compact = false,
}: {
  series: { points: Series[]; color: string }[];
  height?: number;
  compact?: boolean;
}) {
  const W = 760;
  const H = height;
  const padL = compact ? 8 : 40;
  const padR = 12;
  const padT = 14;
  const padB = 28;

  const all = series.flatMap((s) => s.points);
  if (all.length === 0) {
    return <p className="text-center text-gray-600 py-12 text-sm">No data for this period.</p>;
  }
  const maxRaw = Math.max(1, ...all.map((d) => d.count));
  // round the axis max up to a "nice" number
  const niceMax = niceCeil(maxRaw);
  // Zero-fill each series to the shared, sorted union of dates so a series with
  // fewer buckets aligns to the correct dates instead of plotting by index.
  const dates = Array.from(new Set(all.map((d) => d.date))).sort();
  const filled = series.map((s) => ({
    color: s.color,
    points: dates.map((d) => s.points.find((p) => p.date === d) ?? { date: d, count: 0 }),
  }));
  const n = dates.length;

  const xFor = (i: number) => (n <= 1 ? (W - padL - padR) / 2 + padL : padL + (i / (n - 1)) * (W - padL - padR));
  const yFor = (v: number) => padT + (1 - v / niceMax) * (H - padT - padB);

  const yTicks = compact ? [] : [0, niceMax / 2, niceMax];
  const labelIdx = n <= 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }}>
      {/* gridlines + y labels */}
      {yTicks.map((t, i) => {
        const y = yFor(t);
        return (
          <g key={i}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            <text x={padL - 8} y={y + 3} textAnchor="end" fontSize="11" fill="#7c7c8e">
              {Math.round(t)}
            </text>
          </g>
        );
      })}
      {compact && <line x1={padL} y1={yFor(0)} x2={W - padR} y2={yFor(0)} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />}

      {/* series lines + faint area */}
      {filled.map((s, si) => {
        if (s.points.length === 0) return null;
        const pts = s.points.map((d, i) => ({ x: xFor(i), y: yFor(d.count) }));
        const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
        const area = `${line} L${pts[pts.length - 1].x.toFixed(1)},${yFor(0)} L${pts[0].x.toFixed(1)},${yFor(0)} Z`;
        const gid = `fill-${s.color.replace('#', '')}-${si}`;
        return (
          <g key={si}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.16" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill={`url(#${gid})`} />
            <path d={line} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          </g>
        );
      })}

      {/* x date labels */}
      {!compact &&
        labelIdx.map((i) => (
          <text key={i} x={xFor(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#7c7c8e">
            {fmtAxisDate(dates[i] ?? '')}
          </text>
        ))}
    </svg>
  );
}

function CategoryBreakdown({ categories }: { categories: { category: string; count: number }[] }) {
  const sorted = [...categories].sort((a, b) => b.count - a.count);
  const total = sorted.reduce((a, d) => a + d.count, 0) || 1;
  const max = Math.max(1, ...sorted.map((d) => d.count));

  if (sorted.length === 0) {
    return <p className="text-center text-gray-600 py-8 text-sm">No category data yet.</p>;
  }

  return (
    <div className="space-y-3.5">
      {sorted.map((d, i) => {
        // single-hue, professional: gold fading with rank
        const opacity = Math.max(0.35, 1 - i * 0.12);
        const pct = ((d.count / total) * 100).toFixed(1);
        const width = (d.count / max) * 100;
        return (
          <div key={d.category}>
            <div className="flex items-center justify-between text-[13px] mb-1.5">
              <span className="text-gray-200 capitalize">{d.category || 'Other'}</span>
              <span className="text-gray-500 tabular-nums">
                <span className="text-white">{d.count}</span>
                <span className="text-gray-600"> · {pct}%</span>
              </span>
            </div>
            <div className="h-2 rounded-sm overflow-hidden" style={{ background: 'var(--surface-3)' }}>
              <div className="h-full rounded-sm transition-all duration-500" style={{ width: `${width}%`, background: GOLD, opacity }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function niceCeil(n: number): number {
  if (n <= 5) return 5;
  const pow = Math.pow(10, Math.floor(Math.log10(n)));
  const frac = n / pow;
  const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  return nice * pow;
}
