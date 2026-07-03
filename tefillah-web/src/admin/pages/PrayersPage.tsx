import { useCallback, useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Search,
  Trash2,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react';
import {
  adminApi,
  adminErr,
  type PartnerForAssignment,
  type PrayerRow,
} from '../adminApi';
import { useAdminAuth } from '../adminAuth';
import {
  AdminPage,
  AdminPageHeader,
  EmailLink,
  EmptyState,
  ErrorState,
  LoadingState,
  Pagination,
  PhoneLink,
  StatusBadge,
  fmtDateTime,
} from '../adminUi';

const LIMIT = 20;
const STATUS_FILTERS = ['', 'pending', 'assigned', 'prayed', 'completed'];

export default function PrayersPage() {
  const { admin } = useAdminAuth();
  const canDelete = !!admin?.is_super_admin;

  const [rows, setRows] = useState<PrayerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [assignFor, setAssignFor] = useState<PrayerRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getPrayers({
        search: search || undefined,
        status: status || undefined,
        page,
        limit: LIMIT,
      });
      setRows(res.prayers ?? []);
      setTotal(res.total ?? 0);
      setError(null);
    } catch (err) {
      setError(adminErr(err, 'Could not load prayers.'));
    } finally {
      setLoading(false);
    }
  }, [search, status, page]);

  useEffect(() => {
    load();
  }, [load]);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3500);
  };

  const onUnassign = async (p: PrayerRow) => {
    setBusyId(p.id);
    setError(null);
    try {
      await adminApi.unassignPrayer(p.id);
      setRows((prev) =>
        prev.map((r) =>
          r.id === p.id ? { ...r, status: 'pending', assigned_partner_id: null, partner_name: null } : r,
        ),
      );
      flash('Prayer released back to pending.');
    } catch (err) {
      setError(adminErr(err, 'Unassign failed.'));
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (p: PrayerRow) => {
    if (!window.confirm('Delete this prayer permanently? This cannot be undone.')) return;
    setBusyId(p.id);
    setError(null);
    try {
      const res = await adminApi.deletePrayer(p.id);
      if (res.failed > 0 && res.success === 0) {
        setError('Delete failed — the prayer may have already been removed.');
      } else {
        setRows((prev) => prev.filter((r) => r.id !== p.id));
        setTotal((t) => Math.max(0, t - 1));
        flash('Prayer deleted.');
      }
    } catch (err) {
      setError(adminErr(err, 'Delete failed. Only a Super Admin can delete prayers.'));
    } finally {
      setBusyId(null);
    }
  };

  const onAssigned = (prayerId: string, partner: PartnerForAssignment) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === prayerId
          ? { ...r, status: 'assigned', assigned_partner_id: partner.id, partner_name: partner.name }
          : r,
      ),
    );
    flash(`Assigned to ${partner.name}.`);
  };

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  return (
    <AdminPage>
      <AdminPageHeader eyebrow="Admin" title="Prayers" />

      <div className="flex flex-wrap gap-2 mb-4">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s || 'all'}
            onClick={() => {
              setPage(1);
              setStatus(s);
            }}
            className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
            style={
              status === s
                ? { background: 'rgba(212,175,55,0.15)', color: '#e4c55d', border: '1px solid rgba(212,175,55,0.35)' }
                : { color: 'var(--t2)', border: '1px solid var(--line-2)' }
            }
          >
            {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
          </button>
        ))}
      </div>

      <form onSubmit={onSearch} className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="admin-input"
            placeholder="Search prayer content…"
          />
        </div>
        <button type="submit" className="px-4 py-2 rounded-lg bg-amber-500 text-black text-sm font-semibold hover:bg-amber-400">
          Search
        </button>
      </form>

      {notice && (
        <div
          className="mb-4 rounded-lg p-3 text-sm"
          style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)', color: '#4ade80' }}
        >
          {notice}
        </div>
      )}
      {error && <div className="mb-4"><ErrorState message={error} /></div>}

      {loading ? (
        <LoadingState label="Loading prayers…" />
      ) : rows.length === 0 ? (
        <EmptyState title="No prayers found" hint={search || status ? 'Try a different filter.' : undefined} />
      ) : (
        <div className="space-y-3">
          {rows.map((p) => {
            const open = !!expanded[p.id];
            const who = p.is_anonymous ? 'Anonymous' : p.user_name || 'A friend';
            const isAssigned = !!p.assigned_partner_id;
            const isPrayed = p.status === 'prayed' || p.status === 'completed';
            return (
              <article key={p.id} className="admin-card overflow-hidden">
                <button
                  onClick={() => setExpanded((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                  className="w-full text-left p-4 sm:p-5 flex items-start gap-3 hover:bg-white/[0.02]"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                      <span>{fmtDateTime(p.submitted_at)}</span>
                      <span aria-hidden>·</span>
                      <StatusBadge status={p.status} />
                      {p.category && (
                        <>
                          <span aria-hidden>·</span>
                          <span className="capitalize">{p.category}</span>
                        </>
                      )}
                      <span aria-hidden>·</span>
                      <span className="text-amber-500/80">{who}</span>
                      {p.partner_name && (
                        <>
                          <span aria-hidden>·</span>
                          <span className="text-blue-400/80">→ {p.partner_name}</span>
                        </>
                      )}
                    </div>
                    <p className={`mt-2 text-gray-200 ${open ? '' : 'line-clamp-2'}`}>{p.content}</p>
                  </div>
                  <span className="text-gray-500 mt-1">{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
                </button>

                {open && (
                  <div className="border-t px-4 sm:px-5 py-4" style={{ borderColor: 'var(--line)' }}>
                    {/* Contact cards — the info you need to call/confirm */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <ContactCard
                        title="Submitter"
                        name={p.is_anonymous ? 'Anonymous (identity hidden)' : p.user_name || '—'}
                        email={p.is_anonymous ? null : p.user_email}
                        phone={p.is_anonymous ? null : p.user_phone}
                      />
                      <ContactCard
                        title="Assigned Partner"
                        name={p.partner_name || 'Unassigned'}
                        email={p.partner_email}
                        phone={p.partner_phone}
                      />
                    </div>

                    {/* Secondary metadata */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm mt-4">
                      <Detail label="Location" value={[p.location_city, p.location_country].filter(Boolean).join(', ') || '—'} />
                      <Detail label="Submitted at" value={fmtDateTime(p.submitted_at)} />
                      <Detail label="Assigned at" value={fmtDateTime(p.assigned_at)} />
                      <Detail label="Prayed at" value={fmtDateTime(p.prayed_at)} />
                    </div>

                    {/* Actions */}
                    <div className="mt-4 flex flex-wrap gap-2">
                      {!isPrayed && (
                        <button
                          onClick={() => setAssignFor(p)}
                          disabled={busyId === p.id}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-50"
                        >
                          <UserPlus size={15} /> {isAssigned ? 'Reassign' : 'Assign to partner'}
                        </button>
                      )}
                      {isAssigned && !isPrayed && (
                        <button
                          onClick={() => onUnassign(p)}
                          disabled={busyId === p.id}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-200 hover:bg-white/5 disabled:opacity-50"
                          style={{ border: '1px solid var(--line-2)' }}
                        >
                          {busyId === p.id ? <Loader2 size={15} className="animate-spin" /> : <UserMinus size={15} />} Unassign
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => onDelete(p)}
                          disabled={busyId === p.id}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium hover:bg-red-500/10 disabled:opacity-50"
                          style={{ border: '1px solid rgba(248,113,113,0.3)', color: '#f87171' }}
                        >
                          <Trash2 size={15} /> Delete
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <Pagination page={page} total={total} limit={LIMIT} onPage={setPage} />

      {assignFor && (
        <AssignModal
          prayer={assignFor}
          onClose={() => setAssignFor(null)}
          onAssigned={(partner) => {
            onAssigned(assignFor.id, partner);
            setAssignFor(null);
          }}
        />
      )}
    </AdminPage>
  );
}

function AssignModal({
  prayer,
  onClose,
  onAssigned,
}: {
  prayer: PrayerRow;
  onClose: () => void;
  onAssigned: (partner: PartnerForAssignment) => void;
}) {
  const [partners, setPartners] = useState<PartnerForAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .getPartnersForAssignment()
      .then((res) => !cancelled && setPartners(res.partners ?? []))
      .catch((err) => !cancelled && setError(adminErr(err, 'Could not load partners.')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const assign = async (partner: PartnerForAssignment) => {
    setAssigningId(partner.id);
    setError(null);
    try {
      await adminApi.assignPrayer(prayer.id, partner.id);
      onAssigned(partner);
    } catch (err) {
      setError(adminErr(err, 'Assignment failed.'));
      setAssigningId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative admin-card w-full max-w-lg max-h-[80vh] flex flex-col" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--line)' }}>
          <h3 className="text-white font-serif text-xl">Assign to a partner</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-3 text-xs text-gray-500 border-b" style={{ borderColor: 'var(--line)' }}>
          <p className="line-clamp-2 text-gray-400">{prayer.content}</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="py-8 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
            </div>
          ) : error ? (
            <ErrorState message={error} />
          ) : partners.length === 0 ? (
            <p className="text-center text-sm text-gray-500 py-8">
              No active, verified partners available. Approve a partner first.
            </p>
          ) : (
            <div className="space-y-2">
              {partners.map((p) => {
                const full = p.available_slots <= 0;
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg"
                    style={{ border: '1px solid var(--line)' }}
                  >
                    <div className="min-w-0">
                      <p className="text-white font-medium truncate">{p.name}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {[p.location_city, p.location_country].filter(Boolean).join(', ') || '—'} ·{' '}
                        <span style={{ color: full ? '#f87171' : '#4ade80' }}>
                          {p.available_slots} slot{p.available_slots === 1 ? '' : 's'} free
                        </span>
                      </p>
                    </div>
                    <button
                      onClick={() => assign(p)}
                      disabled={full || assigningId !== null}
                      className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-40 shrink-0"
                      title={full ? 'Partner is at capacity' : 'Assign'}
                    >
                      {assigningId === p.id ? <Loader2 size={14} className="animate-spin" /> : 'Assign'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-xs uppercase tracking-[0.12em] text-gray-600 shrink-0 w-32">{label}</span>
      <span className="text-gray-300 break-words">{value}</span>
    </div>
  );
}

function ContactCard({
  title,
  name,
  email,
  phone,
}: {
  title: string;
  name: string;
  email?: string | null;
  phone?: string | null;
}) {
  return (
    <div className="rounded-lg p-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
      <p className="text-[11px] uppercase tracking-[0.14em] text-gray-500">{title}</p>
      <p className="text-white font-medium mt-1">{name}</p>
      <div className="mt-2 space-y-1 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600 w-12 shrink-0">Phone</span>
          <PhoneLink phone={phone} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600 w-12 shrink-0">Email</span>
          <EmailLink email={email} />
        </div>
      </div>
    </div>
  );
}
