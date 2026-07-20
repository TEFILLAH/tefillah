import { useCallback, useEffect, useState } from 'react';
import { Loader2, Pencil, Power, PowerOff, Search, ThumbsUp, Trash2 } from 'lucide-react';
import { adminApi, adminErr, type PartnerRow } from '../adminApi';
import { useAdminAuth } from '../adminAuth';
import {
  AdminPage,
  AdminPageHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  Pagination,
  PhoneLink,
  StatusBadge,
  fmtDate,
  relTime,
} from '../adminUi';

const LIMIT = 20;

function isOnline(lastActive?: string | null): boolean {
  if (!lastActive) return false;
  try {
    return Date.now() - new Date(lastActive).getTime() < 5 * 60 * 1000;
  } catch {
    return false;
  }
}

export default function PartnersPage() {
  const { admin } = useAdminAuth();
  const canDelete = admin?.is_super_admin || admin?.permissions?.includes('manage_partners') || admin?.permissions?.includes('all');

  const [rows, setRows] = useState<PartnerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<PartnerRow | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getPartners({ search: search || undefined, page, limit: LIMIT });
      setRows(res.partners ?? []);
      setTotal(res.total ?? 0);
      setError(null);
    } catch (err) {
      setError(adminErr(err, 'Could not load partners.'));
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    load();
  }, [load]);

  const onlineCount = rows.filter((p) => isOnline(p.last_active)).length;

  const approve = async (p: PartnerRow) => {
    setBusyId(p.id);
    try {
      await adminApi.approvePartner(p.id);
      setRows((prev) => prev.map((r) => (r.id === p.id ? { ...r, status: 'active', is_active: true } : r)));
    } catch (err) {
      setError(adminErr(err, 'Approve failed.'));
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (p: PartnerRow) => {
    setBusyId(p.id);
    try {
      await adminApi.updatePartner(p.id, { is_active: !p.is_active });
      setRows((prev) => prev.map((r) => (r.id === p.id ? { ...r, is_active: !r.is_active } : r)));
    } catch (err) {
      setError(adminErr(err, 'Update failed.'));
    } finally {
      setBusyId(null);
    }
  };

  const openEdit = (p: PartnerRow) => {
    setEditing(p);
    setEditName(p.name);
    setEditEmail(p.email);
    setError(null);
  };

  const saveEdit = async () => {
    if (!editing) return;
    const params: { name?: string; email?: string } = {};
    if (editName.trim() !== editing.name) params.name = editName.trim();
    if (editEmail.trim().toLowerCase() !== editing.email.toLowerCase()) params.email = editEmail.trim();
    if (!params.name && !params.email) {
      setEditing(null);
      return;
    }
    setSavingEdit(true);
    try {
      await adminApi.updatePartner(editing.id, params);
      setRows((prev) =>
        prev.map((r) =>
          r.id === editing.id
            ? { ...r, name: params.name ?? r.name, email: params.email ? params.email.toLowerCase() : r.email }
            : r,
        ),
      );
      setEditing(null);
    } catch (err) {
      setError(adminErr(err, 'Update failed.'));
    } finally {
      setSavingEdit(false);
    }
  };

  const remove = async (p: PartnerRow) => {
    if (!window.confirm(`Delete partner "${p.name}"? This cannot be undone.`)) return;
    setBusyId(p.id);
    try {
      await adminApi.deletePartner(p.id);
      setRows((prev) => prev.filter((r) => r.id !== p.id));
      setTotal((t) => Math.max(0, t - 1));
    } catch (err) {
      setError(adminErr(err, 'Delete failed.'));
    } finally {
      setBusyId(null);
    }
  };

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  return (
    <AdminPage>
      <AdminPageHeader eyebrow="Admin" title="Partners" />

      {/* quick counts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <Mini label="Total Partners" value={total} />
        <Mini label="Online Now" value={onlineCount} dot="#4ade80" />
        <Mini label="Active (page)" value={rows.filter((p) => p.is_active).length} />
        <Mini label="Pending (page)" value={rows.filter((p) => p.status === 'pending_approval').length} dot="#fbbf24" />
      </div>

      <form onSubmit={onSearch} className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="admin-input"
            placeholder="Search by name, email or organization…"
          />
        </div>
        <button type="submit" className="px-4 py-2 rounded-lg bg-amber-500 text-black text-sm font-semibold hover:bg-amber-400">
          Search
        </button>
      </form>

      {error && <div className="mb-4"><ErrorState message={error} /></div>}

      {loading ? (
        <LoadingState label="Loading partners…" />
      ) : rows.length === 0 ? (
        <EmptyState title="No partners found" hint={search ? 'Try a different search.' : undefined} />
      ) : (
        <div className="admin-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Partner</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Handled</th>
                  <th>Joined</th>
                  <th>Last active</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        {isOnline(p.last_active) && <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" title="Online" />}
                        <Avatar url={p.profile_photo_url} name={p.name} />
                        <div className="min-w-0">
                          <p className="text-white font-medium">{p.name}</p>
                          <p className="text-xs text-gray-500">{p.email}</p>
                          <div className="text-xs mt-0.5"><PhoneLink phone={p.phone} compact /></div>
                          {p.organization && <p className="text-[11px] text-gray-600">{p.organization}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="text-gray-400">{[p.location_city, p.location_country].filter(Boolean).join(', ') || '—'}</td>
                    <td><StatusBadge status={p.status === 'pending_approval' ? 'pending_approval' : (p.is_active ? p.status : 'inactive')} /></td>
                    <td className="text-gray-300">{p.prayers_handled}</td>
                    <td className="text-gray-400">{fmtDate(p.created_at)}</td>
                    <td className="text-gray-400">{relTime(p.last_active)}</td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <IconBtn title="Edit name / email" onClick={() => openEdit(p)} disabled={busyId === p.id}>
                          <Pencil size={15} />
                        </IconBtn>
                        {p.status === 'pending_approval' && (
                          <IconBtn title="Approve" onClick={() => approve(p)} disabled={busyId === p.id} tone="#4ade80">
                            <ThumbsUp size={15} />
                          </IconBtn>
                        )}
                        <IconBtn
                          title={p.is_active ? 'Disable' : 'Enable'}
                          onClick={() => toggleActive(p)}
                          disabled={busyId === p.id}
                          tone={p.is_active ? '#fbbf24' : '#4ade80'}
                        >
                          {p.is_active ? <PowerOff size={15} /> : <Power size={15} />}
                        </IconBtn>
                        {canDelete && (
                          <IconBtn title="Delete" onClick={() => remove(p)} disabled={busyId === p.id} tone="#f87171">
                            <Trash2 size={15} />
                          </IconBtn>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Pagination page={page} total={total} limit={LIMIT} onPage={setPage} />

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => !savingEdit && setEditing(null)}
        >
          <div className="admin-card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-1">Edit partner</h3>
            <p className="text-xs text-gray-500 mb-4">Update this partner's name or email address.</p>

            <label className="block text-xs text-gray-400 mb-1">Full name</label>
            <input className="admin-input mb-3" value={editName} onChange={(e) => setEditName(e.target.value)} />

            <label className="block text-xs text-gray-400 mb-1">Email</label>
            <input className="admin-input mb-4" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditing(null)}
                disabled={savingEdit}
                className="px-4 py-2 rounded-lg text-sm text-gray-300 hover:bg-white/5 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={savingEdit}
                className="px-4 py-2 rounded-lg bg-amber-500 text-black text-sm font-semibold hover:bg-amber-400 disabled:opacity-40 inline-flex items-center gap-2"
              >
                {savingEdit && <Loader2 size={15} className="animate-spin" />} Save
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminPage>
  );
}

function Avatar({ url, name }: { url?: string | null; name: string }) {
  return (
    <span className="w-9 h-9 rounded-full overflow-hidden shrink-0 inline-flex items-center justify-center bg-amber-500/15 text-amber-400 text-sm font-semibold">
      {url ? (
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : (
        (name?.[0] ?? '·').toUpperCase()
      )}
    </span>
  );
}

function Mini({ label, value, dot }: { label: string; value: number; dot?: string }) {
  return (
    <div className="admin-card p-4">
      <div className="flex items-center gap-2">
        {dot && <span className="w-2 h-2 rounded-full" style={{ background: dot }} />}
        <p className="font-serif text-2xl text-white">{value.toLocaleString()}</p>
      </div>
      <p className="text-[11px] text-gray-500 mt-1">{label}</p>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  disabled,
  tone = '#a1a1aa',
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
  tone?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="w-8 h-8 inline-flex items-center justify-center rounded-lg hover:bg-white/5 disabled:opacity-40 transition-colors"
      style={{ color: tone }}
    >
      {children}
    </button>
  );
}
