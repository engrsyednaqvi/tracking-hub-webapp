import { useEffect, useState, type FormEvent } from 'react';
import { Link2, Plus, RefreshCw, Store, Trash2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useAppErrors } from '@/context/ErrorContext';
import { useShops } from '@/context/ShopContext';
import { startEtsyOAuth } from '@/lib/functions';
import { createShop, deleteShop } from '@/services/shops';

const ETSY_CALLBACK =
  'https://us-central1-tracking-hub-webapp-29401.cloudfunctions.net/etsyOAuthCallback';

export function ShopsPage() {
  const { user, demoMode } = useAuth();
  const { reportError, reportInfo } = useAppErrors();
  const { shops, setActiveShopId, loading, syncing, syncShop } = useShops();
  const [searchParams, setSearchParams] = useSearchParams();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const needsReconnect = shops.filter((s) => s.reconnectRequired || (!s.connected && s.etsyShopId));
  const reconnectKey = needsReconnect.map((s) => s.id).join(',');

  useEffect(() => {
    const etsy = searchParams.get('etsy');
    if (!etsy) return;
    if (etsy === 'connected') {
      const shop = searchParams.get('shop');
      reportInfo(
        'Etsy connected',
        shop ? `Connected “${shop}”. Use Sync orders on the left.` : 'Etsy shop connected.',
      );
    } else if (etsy === 'error') {
      reportError('Etsy connect failed', searchParams.get('message') || 'Etsy connect failed.');
    }
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams, reportError, reportInfo]);

  useEffect(() => {
    if (!needsReconnect.length) return;
    reportError(
      'Reconnect required',
      needsReconnect
        .map((s) => `${s.name}${s.reconnectReason ? `: ${s.reconnectReason}` : ''}`)
        .join('\n'),
    );
    // Only when the set of shops needing reconnect changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by reconnectKey
  }, [reconnectKey]);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (demoMode || !user) {
      reportError('Add shop failed', 'Sign in to add shops.');
      return;
    }
    setBusy(true);
    try {
      const shop = await createShop(user.uid, { name });
      setName('');
      setActiveShopId(shop.id);
    } catch (err) {
      reportError('Add shop failed', err);
    } finally {
      setBusy(false);
    }
  }

  async function onConnectEtsy() {
    if (demoMode || !user) {
      reportError('Connect Etsy failed', 'Sign in first.');
      return;
    }
    setBusy(true);
    try {
      const { authUrl } = await startEtsyOAuth();
      window.location.assign(authUrl);
    } catch (err) {
      reportError('Connect Etsy failed', err);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Etsy shops</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Reconnect shops after an Etsy app key change. Sync and status messages are on the left.
          </p>
        </div>
        <button
          type="button"
          disabled={busy || demoMode}
          onClick={() => void onConnectEtsy()}
          className="inline-flex items-center gap-2 rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          <Link2 className="h-4 w-4" />
          {busy
            ? 'Redirecting…'
            : needsReconnect.length || shops.some((s) => s.connected)
              ? 'Reconnect / Connect shop'
              : 'Connect Etsy'}
        </button>
      </div>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <p className="font-medium">Etsy app Callback URL</p>
        <p className="mt-1">Must match exactly:</p>
        <code className="mt-2 block break-all rounded-lg bg-white/80 px-2 py-1.5 text-xs">
          {ETSY_CALLBACK}
        </code>
      </section>

      <form
        onSubmit={onAdd}
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-surface-line bg-white p-4 shadow-sm"
      >
        <label className="min-w-[14rem] flex-1 text-sm">
          <span className="text-slate-600">Manual shop name (optional)</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Or use Connect Etsy above"
            className="mt-1 w-full rounded-xl border border-surface-line px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="inline-flex items-center gap-2 rounded-xl border border-surface-line px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
        >
          <Plus className="h-4 w-4" /> Add manually
        </button>
      </form>

      {loading ? <p className="text-sm text-slate-500">Loading shops…</p> : null}

      <ul className="grid gap-3 sm:grid-cols-2">
        {shops.map((shop) => (
          <li
            key={shop.id}
            className="rounded-2xl border border-surface-line bg-white p-5 shadow-sm"
          >
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand-ink">
                <Store className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{shop.name}</p>
                <p className="text-xs uppercase tracking-wide text-slate-500">{shop.platform}</p>
                <p className="mt-2 text-sm text-slate-600">
                  {shop.connected
                    ? `Connected${shop.etsyShopId ? ` · #${shop.etsyShopId}` : ''}`
                    : shop.reconnectRequired
                      ? 'Needs reconnect'
                      : 'Not connected'}
                </p>
                {shop.lastSyncAt ? (
                  <p className="mt-1 text-xs text-slate-400">
                    Last sync {new Date(shop.lastSyncAt).toLocaleString()}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveShopId(shop.id)}
                    className="text-sm font-medium text-brand hover:underline"
                  >
                    View orders
                  </button>
                  {shop.connected ? (
                    <button
                      type="button"
                      disabled={syncing}
                      onClick={() => void syncShop(shop.id)}
                      className="inline-flex items-center gap-1 text-sm font-medium text-slate-700 hover:underline disabled:opacity-60"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                      Sync
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy || demoMode}
                      onClick={() => void onConnectEtsy()}
                      className="text-sm font-medium text-rose-700 hover:underline"
                    >
                      Reconnect
                    </button>
                  )}
                  {!demoMode && user ? (
                    <button
                      type="button"
                      onClick={() => void deleteShop(user.uid, shop.id)}
                      className="inline-flex items-center gap-1 text-sm text-rose-600 hover:underline"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {!loading && !shops.length ? (
        <p className="text-sm text-slate-500">No shops yet — click Connect Etsy.</p>
      ) : null}
    </div>
  );
}
