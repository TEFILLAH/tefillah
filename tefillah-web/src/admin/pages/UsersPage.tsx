import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Pencil, Search, ShieldOff, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import { adminApi, adminErr, type UserRow } from '../adminApi';
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
} from '../adminUi';

const LIMIT = 20;

export default function UsersPage() {
  const { admin } = useAdminAuth();
  const canDelete = admin?.is_super_admin || admin?.permissions?.includes('manage_users') || admin?.permissions?.includes('all');

  const [rows, setRows] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getUsers({ search: search || undefined, page, limit: LIMIT });
      setRows(res.users ?? []);
      setTotal(res.total ?? 0);
      setError(null);
    } catch (err) {
      setError(adminErr(err, 'Could not load users.'));
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleSuspend = async (u: UserRow) => {
    setBusyId(u.id);
    try {
      const next = u.status === 'suspended' ? 'active' : 'suspended';
      await adminApi.updateUser(u.id, { status: next });
      setRows((prev) => prev.map((r) => (r.id === u.id ? { ...r, status: next } : r)));
    } catch (err) {
      setError(adminErr(err, 'Update failed.'));
    } finally {
      setBusyId(null);
    }
  };

  const toggleVerify = async (u: UserRow) => {
    setBusyId(u.id);
    try {
      await adminApi.updateUser(u.id, { is_verified: !u.is_verified });
      setRows((prev) => prev.map((r) => (r.id === u.id ? { ...r, is_verified: !r.is_verified } : r)));
    } catch (err) {
      setError(adminErr(err, 'Update failed.'));
    } finally {
      setBusyId(null);
    }
  };

  const openEdit = (u: UserRow) => {
    setEditing(u);
    setEditName(u.name);
    setEditEmail(u.email);
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
      await adminApi.updateUser(editing.id, params);
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

  const remove = async (u: UserRow) => {
    if (!window.confirm(`Delete user "${u.name}"? This cannot be undone.`)) return;
    setBusyId(u.id);
    try {
      await adminApi.deleteUser(u.id);
      setRows((prev) => prev.filter((r) => r.id !== u.id));
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
      <AdminPageHeader eyebrow="Admin" title="Users" />

      <form onSubmit={onSearch} className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="admin-input"
            placeholder="Search by name or email…"
          />
        </div>
        <button type="submit" className="px-4 py-2 rounded-lg bg-amber-500 text-black text-sm font-semibold hover:bg-amber-400">
          Search
        </button>
      </form>

      {error && <div className="mb-4"><ErrorState message={error} /></div>}

      {loading ? (
        <LoadingState label="Loading users…" />
      ) : rows.length === 0 ? (
        <EmptyState title="No users found" hint={search ? 'Try a different search.' : undefined} />
      ) : (
        <div className="admin-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Verified</th>
                  <th>Joined</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <Avatar url={u.profile_photo_url} name={u.name} />
                        <div className="min-w-0">
                          <p className="text-white font-medium">{u.name}</p>
                          <p className="text-xs text-gray-500">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td><PhoneLink phone={u.phone} compact /></td>
                    <td className="text-gray-400">
                      {[u.location_city, u.location_country].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td><StatusBadge status={u.status} /></td>
                    <td>{u.is_verified ? <CheckCircle2 size={16} className="text-green-400" /> : <XCircle size={16} className="text-gray-600" />}</td>
                    <td className="text-gray-400">{fmtDate(u.created_at)}</td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <IconBtn title="Edit name / email" onClick={() => openEdit(u)} disabled={busyId === u.id}>
                          <Pencil size={15} />
                        </IconBtn>
                        <IconBtn
                          title={u.is_verified ? 'Unverify' : 'Verify'}
                          onClick={() => toggleVerify(u)}
                          disabled={busyId === u.id}
                        >
                          {u.is_verified ? <ShieldOff size={15} /> : <ShieldCheck size={15} />}
                        </IconBtn>
                        <IconBtn
                          title={u.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                          onClick={() => toggleSuspend(u)}
                          disabled={busyId === u.id}
                          tone={u.status === 'suspended' ? '#4ade80' : '#fbbf24'}
                        >
                          {u.status === 'suspended' ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                        </IconBtn>
                        {canDelete && (
                          <IconBtn title="Delete" onClick={() => remove(u)} disabled={busyId === u.id} tone="#f87171">
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
            <h3 className="text-lg font-semibold text-white mb-1">Edit user</h3>
            <p className="text-xs text-gray-500 mb-4">Update this user's name or email address.</p>

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
