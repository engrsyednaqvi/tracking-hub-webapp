import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Settings, Store } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ShopSwitcher } from '@/components/shops/ShopSwitcher';
import { ShopProvider } from '@/context/ShopContext';
import { useAuth } from '@/context/AuthContext';

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/shops', label: 'Shops', icon: Store },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function AppShell() {
  const { user, demoMode, logOut } = useAuth();

  return (
    <ShopProvider>
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        {demoMode ? (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Running in demo mode. Add Firebase env vars (see README) to enable real accounts and sync.
          </div>
        ) : null}

        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-brand-ink/70">Tracking Hub</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Order dashboard
            </h1>
            <p className="mt-2 max-w-xl text-sm text-slate-600">
              One place for every Etsy shop. Connect shops, switch views, track supplier shipments.
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <ShopSwitcher />
            {user ? (
              <button
                type="button"
                onClick={() => void logOut()}
                className="text-left text-xs text-slate-500 hover:text-slate-800 sm:text-right"
              >
                {user.email} · Sign out
              </button>
            ) : null}
          </div>
        </header>

        <nav className="mb-6 flex flex-wrap gap-1 border-b border-surface-line pb-px">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'inline-flex items-center gap-2 rounded-t-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-white text-brand-ink shadow-sm ring-1 ring-surface-line'
                    : 'text-slate-500 hover:text-slate-800',
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <main className="flex-1">
          <Outlet />
        </main>

        <footer className="mt-10 border-t border-surface-line pt-4 text-xs text-slate-500">
          Multi-shop Firebase backend online · Etsy OAuth + tracking refresh next · Extension stays separate
        </footer>
      </div>
    </ShopProvider>
  );
}
