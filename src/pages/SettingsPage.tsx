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

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <p className="font-medium">USPS Tracking API access</p>
        <p className="mt-1 leading-relaxed">
          Your CRID / Master MID / Label MID are saved as Firebase secrets. They still must be
          linked to your Developer App:
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 leading-relaxed">
          <li>
            Accept Tracking T&amp;Cs in Business Portal → My Apps → Developer Apps → Manage
          </li>
          <li>
            Run{' '}
            <a
              href="https://cop.usps.com/navigator?wf=apionboarding"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-brand underline"
            >
              API onboarding
            </a>{' '}
            and enter your Consumer Key so CRID/MID attach to the app
          </li>
          <li>Refresh Claims on the app, then Sync again (forces a new OAuth token)</li>
        </ol>
        <p className="mt-2 leading-relaxed">
          Free tracking only covers packages mailed under <strong>your</strong> Label MID. Etsy /
          Pitney labels embed a different MID — those need a paid IP Agreement via{' '}
          <a
            href="https://emailus.usps.com/s/usps-APIs"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-brand underline"
          >
            USPS API Support
          </a>
          . Until then, use the Etsy status column for those orders.
        </p>
      </div>

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
