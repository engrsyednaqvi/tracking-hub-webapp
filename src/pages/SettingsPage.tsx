import { useAuth } from '@/context/AuthContext';
import { isFirebaseConfigured } from '@/lib/firebase';

export function SettingsPage() {
  const { user, demoMode, logOut } = useAuth();

  return (
    <div className="max-w-xl space-y-4 rounded-2xl border border-surface-line bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-900">Settings</h2>
      <p className="text-sm text-slate-600">
        Account and backend status. Tracking providers and Etsy OAuth will plug in here next.
      </p>
      <dl className="space-y-3 text-sm">
        <div className="flex justify-between gap-4 border-t border-surface-line pt-3">
          <dt className="text-slate-500">Mode</dt>
          <dd className="font-medium text-slate-800">
            {demoMode ? 'Demo (no Firebase config)' : 'Live Firebase'}
          </dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-surface-line pt-3">
          <dt className="text-slate-500">Firebase</dt>
          <dd className="font-medium text-slate-800">
            {isFirebaseConfigured ? 'Configured' : 'Missing VITE_FIREBASE_* env'}
          </dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-surface-line pt-3">
          <dt className="text-slate-500">Signed in as</dt>
          <dd className="font-medium text-slate-800">{user?.email ?? '—'}</dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-surface-line pt-3">
          <dt className="text-slate-500">Hosting</dt>
          <dd className="font-medium text-slate-800">GitHub Pages</dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-surface-line pt-3">
          <dt className="text-slate-500">Chrome extension</dt>
          <dd className="font-medium text-slate-800">Separate companion repo</dd>
        </div>
      </dl>

      {user ? (
        <button
          type="button"
          onClick={() => void logOut()}
          className="rounded-xl border border-surface-line px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Sign out
        </button>
      ) : null}
    </div>
  );
}
