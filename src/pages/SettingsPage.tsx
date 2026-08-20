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
          Your CRID / Master MID / Label MID are saved as Firebase secrets. USPS still has to
          authorize the <em>app</em> for tracking. Portal menus vary — use these working entry
          points:
        </p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 leading-relaxed">
          <li>
            Open{' '}
            <a
              href="https://cop.usps.com"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-brand underline"
            >
              cop.usps.com
            </a>{' '}
            (or{' '}
            <a
              href="https://developers.usps.com"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-brand underline"
            >
              developers.usps.com
            </a>
            ) and sign in.
          </li>
          <li>
            Go to <strong>My Apps</strong> → open your app. If a Terms banner/modal appears,
            accept it (it may not say “Tracking T&amp;Cs”). Then click{' '}
            <strong>Refresh Claims</strong> if shown.
          </li>
          <li>
            If you see “Authorize app” / enter Consumer Key, paste your app’s Consumer Key so
            CRID/MID attach to the app.
          </li>
          <li>
            For packages <strong>not</strong> mailed under your Label MID (most Etsy/Pitney
            labels), open a ticket at{' '}
            <a
              href="https://emailus.usps.com/s/usps-APIs"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-brand underline"
            >
              emailus.usps.com/s/usps-APIs
            </a>{' '}
            and ask for Tracking API Access Control / IP Agreement. Helpdesk:{' '}
            <span className="font-medium">1-877-672-0007</span> (option 6, then 2).
          </li>
        </ol>
        <p className="mt-2 leading-relaxed">
          If My Apps already shows <strong>Approved</strong> and you Refresh Claims’d, portal setup
          is done. Click <strong>Sync orders</strong> so we mint a fresh OAuth token. Free tracking
          still only covers labels that embed <strong>your</strong> Label MID; Etsy/Pitney postage
          usually will not, and needs a USPS IP Agreement ticket.
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
