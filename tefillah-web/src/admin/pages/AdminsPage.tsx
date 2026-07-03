import { useEffect, useState } from 'react';
import { ShieldCheck, Star } from 'lucide-react';
import { adminApi, adminErr, type AdminRow } from '../adminApi';
import { AdminPage, AdminPageHeader, EmptyState, ErrorState, LoadingState, fmtDate, relTime } from '../adminUi';

export default function AdminsPage() {
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .getAdmins()
      .then((res) => !cancelled && setRows(res.admins ?? []))
      .catch((err) => !cancelled && setError(adminErr(err, 'Could not load admins. Super-admin access is required.')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AdminPage>
      <AdminPageHeader eyebrow="Admin" title="Admins" />

      {loading ? (
        <LoadingState label="Loading admins…" />
      ) : error ? (
        <ErrorState message={error} />
      ) : rows.length === 0 ? (
        <EmptyState title="No admins" />
      ) : (
        <div className="admin-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Permissions</th>
                  <th>Created</th>
                  <th>Last login</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="w-8 h-8 rounded-full flex items-center justify-center text-amber-400 shrink-0" style={{ background: 'rgba(212,175,55,0.12)' }}>
                          {a.is_super_admin ? <Star size={14} /> : <ShieldCheck size={14} />}
                        </span>
                        <div>
                          <p className="text-white font-medium">{a.name}</p>
                          <p className="text-xs text-gray-500">{a.email}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="admin-chip" style={a.is_super_admin ? { background: 'rgba(212,175,55,0.14)', color: '#e4c55d' } : { background: 'rgba(138,138,147,0.14)', color: '#a1a1aa' }}>
                        {a.is_super_admin ? 'Super Admin' : 'Admin'}
                      </span>
                    </td>
                    <td className="text-gray-400">
                      {a.is_super_admin ? 'All permissions' : (a.permissions?.length ? a.permissions.join(', ') : '—')}
                    </td>
                    <td className="text-gray-400">{fmtDate(a.created_at)}</td>
                    <td className="text-gray-400">{relTime(a.last_login)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminPage>
  );
}
