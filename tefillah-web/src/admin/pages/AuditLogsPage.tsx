import { useCallback, useEffect, useState } from 'react';
import { adminApi, adminErr, type ActivityLog } from '../adminApi';
import {
  AdminPage,
  AdminPageHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  Pagination,
  fmtDateTime,
} from '../adminUi';

const LIMIT = 50;

function actorColor(t: string): string {
  if (t === 'admin') return '#e4c55d';
  if (t === 'partner') return '#60a5fa';
  if (t === 'user') return '#4ade80';
  return '#a1a1aa';
}

export default function AuditLogsPage() {
  const [rows, setRows] = useState<ActivityLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getActivityLogs({ page, limit: LIMIT });
      setRows(res.logs ?? []);
      setTotal(res.total ?? 0);
      setError(null);
    } catch (err) {
      setError(adminErr(err, 'Could not load audit logs.'));
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AdminPage>
      <AdminPageHeader eyebrow="Admin" title="Audit Logs" />

      {loading ? (
        <LoadingState label="Loading audit logs…" />
      ) : error ? (
        <ErrorState message={error} />
      ) : rows.length === 0 ? (
        <EmptyState title="No activity yet" />
      ) : (
        <div className="admin-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Target</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((log) => (
                  <tr key={log.id}>
                    <td className="text-gray-400 whitespace-nowrap">{fmtDateTime(log.timestamp)}</td>
                    <td>
                      <span className="text-gray-200 font-medium">{log.action.replace(/_/g, ' ')}</span>
                    </td>
                    <td>
                      <span className="text-white">{log.actor_name}</span>
                      <span className="ml-2 admin-chip" style={{ background: `${actorColor(log.actor_type)}1f`, color: actorColor(log.actor_type) }}>
                        {log.actor_type}
                      </span>
                    </td>
                    <td className="text-gray-400">
                      {log.target_type ? `${log.target_type}${log.target_id ? ` · ${log.target_id.slice(0, 8)}` : ''}` : '—'}
                    </td>
                    <td className="text-gray-500 text-xs">{log.ip_address || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Pagination page={page} total={total} limit={LIMIT} onPage={setPage} />
    </AdminPage>
  );
}
