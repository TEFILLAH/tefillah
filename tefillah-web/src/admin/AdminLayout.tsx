import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Heart,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  ScrollText,
  Shield,
  Users,
  UserCog,
  X,
} from 'lucide-react';
import { useAdminAuth } from './adminAuth';
import AdminLogo from './AdminLogo';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  superOnly?: boolean;
  /** Permission required to reach this page; hidden if the admin lacks it. */
  requires?: string;
}

const NAV: NavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { to: '/admin/users', label: 'Users', icon: <Users size={18} />, requires: 'manage_users' },
  { to: '/admin/partners', label: 'Partners', icon: <Heart size={18} />, requires: 'manage_partners' },
  { to: '/admin/prayers', label: 'Prayers', icon: <ScrollText size={18} />, requires: 'manage_prayers' },
  { to: '/admin/analytics', label: 'Analytics', icon: <BarChart3 size={18} />, requires: 'view_analytics' },
  { to: '/admin/admins', label: 'Admins', icon: <UserCog size={18} />, superOnly: true },
  { to: '/admin/audit-logs', label: 'Audit Logs', icon: <Shield size={18} />, requires: 'view_analytics' },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const { admin, logout } = useAdminAuth();
  const [open, setOpen] = useState(false);

  const onLogout = () => {
    logout();
    navigate('/admin/login', { replace: true });
  };

  // Show an item only if the admin can actually reach it: super admins (and
  // the wildcard 'all' permission) see everything; otherwise gate by superOnly
  // and the item's required permission so no link dead-ends in a 403.
  const perms = admin?.permissions ?? [];
  const canSee = (n: NavItem) => {
    if (n.superOnly && !admin?.is_super_admin) return false;
    if (!n.requires) return true;
    return admin?.is_super_admin || perms.includes('all') || perms.includes(n.requires);
  };
  const nav = NAV.filter(canSee);

  return (
    <div className="admin-root min-h-screen flex text-[color:var(--t2)]">
      {/* Sidebar (desktop) */}
      <aside
        className="hidden lg:flex lg:flex-col w-64 shrink-0 border-r"
        style={{ background: 'rgba(11,11,18,0.72)', borderColor: 'var(--line)', backdropFilter: 'blur(12px)' }}
      >
        <SidebarInner nav={nav} onLogout={onLogout} adminName={admin?.name} isSuper={admin?.is_super_admin} />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside
            className="relative w-64 max-w-[80%] flex flex-col border-r admin-fade-up"
            style={{ background: 'rgba(11,11,18,0.96)', borderColor: 'var(--line)' }}
          >
            <SidebarInner
              nav={nav}
              onLogout={onLogout}
              adminName={admin?.name}
              isSuper={admin?.is_super_admin}
              onNavigate={() => setOpen(false)}
            />
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <header
          className="lg:hidden sticky top-0 z-40 flex items-center justify-between px-4 h-16 border-b"
          style={{ background: 'rgba(9,9,14,0.85)', borderColor: 'var(--line)', backdropFilter: 'blur(12px)' }}
        >
          <Link to="/admin" className="flex items-center gap-2.5">
            <AdminLogo size={34} />
            <span className="font-serif tracking-[0.18em] text-white text-sm">Tefillah</span>
          </Link>
          <button
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="inline-flex items-center justify-center w-10 h-10 rounded-lg cursor-pointer"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--line-2)' }}
          >
            <MenuIcon size={18} />
          </button>
        </header>

        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SidebarInner({
  nav,
  onLogout,
  adminName,
  isSuper,
  onNavigate,
}: {
  nav: NavItem[];
  onLogout: () => void;
  adminName?: string;
  isSuper?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <>
      {/* Brand */}
      <div className="flex items-center justify-between px-5 h-[4.75rem] border-b" style={{ borderColor: 'var(--line)' }}>
        <Link to="/admin" className="flex items-center gap-3" onClick={onNavigate}>
          <AdminLogo size={42} />
          <div className="leading-tight">
            <p className="font-serif tracking-[0.16em] text-white text-lg">Tefillah</p>
            <p className="text-[9px] uppercase tracking-[0.28em] admin-grad-gold font-semibold">Admin Console</p>
          </div>
        </Link>
        {onNavigate && (
          <button onClick={onNavigate} aria-label="Close menu" className="lg:hidden text-gray-400 hover:text-white cursor-pointer">
            <X size={18} />
          </button>
        )}
      </div>

      {/* Live status strip */}
      <div className="px-5 py-3 flex items-center gap-2 border-b" style={{ borderColor: 'var(--line)' }}>
        <span className="admin-dot" style={{ color: 'var(--emerald)', background: 'var(--emerald)' }} />
        <span className="text-[11px] tracking-wide text-[color:var(--t3)]">
          Systems <span style={{ color: 'var(--emerald)' }}>operational</span>
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/admin'}
            onClick={onNavigate}
            className="group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer"
            style={({ isActive }) =>
              isActive
                ? {
                    color: 'var(--gold-soft)',
                    background: 'linear-gradient(100deg, rgba(229,185,61,0.16), rgba(229,185,61,0.04))',
                    border: '1px solid rgba(229,185,61,0.22)',
                  }
                : { color: 'var(--t2)', border: '1px solid transparent' }
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r"
                    style={{ background: 'linear-gradient(var(--gold-soft), var(--gold))', boxShadow: 'var(--glow-gold)' }}
                  />
                )}
                <span
                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
                  style={
                    isActive
                      ? { background: 'rgba(229,185,61,0.14)', color: 'var(--gold-soft)' }
                      : { background: 'var(--surface-2)', color: 'var(--t3)' }
                  }
                >
                  {item.icon}
                </span>
                <span className={isActive ? '' : 'group-hover:text-white transition-colors'}>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User footer */}
      <div className="px-3 py-4 border-t" style={{ borderColor: 'var(--line)' }}>
        <div className="flex items-center gap-3 px-2 pb-3">
          <span
            className="inline-flex items-center justify-center w-9 h-9 rounded-full font-serif text-base shrink-0"
            style={{ background: 'rgba(229,185,61,0.12)', color: 'var(--gold-soft)', border: '1px solid rgba(229,185,61,0.25)' }}
          >
            {adminName?.[0]?.toUpperCase() ?? 'A'}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{adminName ?? 'Admin'}</p>
            <p className="text-[11px]" style={{ color: 'var(--gold)' }}>{isSuper ? 'Super Admin' : 'Admin'}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-[color:var(--t2)] hover:text-red-300 transition-colors cursor-pointer"
          style={{ border: '1px solid var(--line)' }}
        >
          <LogOut size={16} /> Sign Out
        </button>
      </div>
    </>
  );
}
