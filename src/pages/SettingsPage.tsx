export function SettingsPage() {
  return (
    <div className="max-w-xl space-y-4 rounded-2xl border border-surface-line bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-900">Settings</h2>
      <p className="text-sm text-slate-600">
        Tracking providers, notifications, and theme placeholders. Backend config will live in
        Firebase so the website, phone app, and extension can share the same preferences.
      </p>
      <dl className="space-y-3 text-sm">
        <div className="flex justify-between gap-4 border-t border-surface-line pt-3">
          <dt className="text-slate-500">Hosting</dt>
          <dd className="font-medium text-slate-800">GitHub Pages (free)</dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-surface-line pt-3">
          <dt className="text-slate-500">Planned backend</dt>
          <dd className="font-medium text-slate-800">Firebase Auth + Firestore</dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-surface-line pt-3">
          <dt className="text-slate-500">Chrome extension</dt>
          <dd className="font-medium text-slate-800">Separate repo — stays as companion</dd>
        </div>
      </dl>
    </div>
  );
}
