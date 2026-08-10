import { useEffect, useState, type FormEvent } from 'react';
import { Link2, Plus, RefreshCw, Store, Trash2, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useAppErrors } from '@/context/ErrorContext';
import { useShops } from '@/context/ShopContext';
import { useEtsyConnect } from '@/hooks/useEtsyConnect';
import { createShop, deleteShop } from '@/services/shops';
import type { Shop } from '@/types';
import { cn } from '@/lib/cn';

const ETSY_CALLBACK =
  'https://us-central1-tracking-hub-webapp-29401.cloudfunctions.net/etsyOAuthCallback';

export function ShopsPage() {
  const { user, demoMode } = useAuth();
  const { reportError, reportInfo, notices, dismissNotice, clearErrors, etsyAuthUrl, setEtsyAuthUrl } =
    useAppErrors();
  const { shops, setActiveShopId, loading, syncing, syncAll, syncShop } = useShops();
  const { connectEtsy, connecting } = useEtsyConnect();
  const [searchParams, setSearchParams] = useSearchParams();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [newKeystring, setNewKeystring] = useState('');
  const [newSecret, setNewSecret] = useState('');

  useEffect(() => {
    const etsy = searchParams.get('etsy');
    if (!etsy) return;
    if (etsy === 'connected') {
      const shop = searchParams.get('shop');
      reportInfo(
        'Etsy connected',
        shop ? `Connected “${shop}”. You can Sync now.` : 'Etsy shop connected.',
      );
    } else if (etsy === 'error') {
      reportError('Etsy connect failed', searchParams.get('message') || 'Etsy connect failed.');
    }
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams, reportError, reportInfo]);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Etsy shops</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Each shop uses its own Etsy Seller app. Paste that account’s keystring + secret under
            the shop card, then Connect while logged into that seller on Etsy.
          </p>
        </div>
        <button
          type="button"
          disabled={demoMode || syncing || !shops.some((s) => s.connected && !s.reconnectRequired)}
          onClick={() => void syncAll()}
          className="inline-flex items-center gap-2 rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          <RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin')} />
          {syncing ? 'Syncing…' : 'Sync all'}
        </button>
      </div>

      {etsyAuthUrl ? (
        <a
          href={etsyAuthUrl}
          target="_blank"
          rel="noreferrer"
          onClick={() => setEtsyAuthUrl(null)}
          className="inline-flex items-center gap-2 rounded-xl border border-teal-300 bg-teal-50 px-3 py-2 text-sm font-medium text-teal-900"
        >
          Open Etsy login ↗
        </a>
      ) : null}

      {notices.length ? (
        <div className="space-y-2">
          <div className="flex justify-end">
            <button type="button" onClick={clearErrors} className="text-xs text-slate-500 hover:underline">
              Clear status
            </button>
          </div>
          {notices.map((n) => (
            <div
              key={n.id}
              className={cn(
                'rounded-xl border px-3 py-2 text-sm',
                n.kind === 'error'
                  ? 'border-rose-200 bg-rose-50 text-rose-950'
                  : 'border-teal-200 bg-teal-50 text-teal-950',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{n.title}</p>
                <button type="button" onClick={() => dismissNotice(n.id)} className="text-slate-400">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <pre className="mt-1 whitespace-pre-wrap break-words text-xs">{n.detail}</pre>
            </div>
          ))}
        </div>
      ) : null}

      <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <p className="font-medium">Callback URL (same for every Seller app)</p>
        <code className="mt-2 block break-all rounded-lg bg-white/80 px-2 py-1.5 text-xs">
          {ETSY_CALLBACK}
        </code>
      </section>

      <section className="rounded-2xl border border-surface-line bg-white p-4 shadow-sm">
        <p className="text-sm font-medium text-slate-800">Connect a new Etsy shop</p>
        <p className="mt-1 text-xs text-slate-500">
          Paste that seller’s app keys, then Connect (approve while logged into that Etsy account).
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input
            value={newKeystring}
            onChange={(e) => setNewKeystring(e.target.value)}
            placeholder="Keystring"
            autoComplete="off"
            className="rounded-xl border border-surface-line px-3 py-2 text-sm"
          />
          <input
            value={newSecret}
            onChange={(e) => setNewSecret(e.target.value)}
            placeholder="Shared secret"
            type="password"
            autoComplete="off"
            className="rounded-xl border border-surface-line px-3 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          disabled={demoMode || connecting || !newKeystring.trim() || !newSecret.trim()}
          onClick={() =>
            void connectEtsy({ keystring: newKeystring, sharedSecret: newSecret })
          }
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          <Link2 className="h-4 w-4" />
          {connecting ? 'Opening Etsy…' : 'Connect new shop'}
        </button>
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
            placeholder="Placeholder card before Connect"
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

      <ul className="grid gap-4 lg:grid-cols-2">
        {shops.map((shop) => (
          <ShopCard
            key={shop.id}
            shop={shop}
            demoMode={demoMode}
            userId={user?.uid}
            syncing={syncing}
            connecting={connecting}
            onView={() => setActiveShopId(shop.id)}
            onSync={() => void syncShop(shop.id)}
            onConnect={(keys) => void connectEtsy(keys)}
            onDelete={() => user && void deleteShop(user.uid, shop.id)}
          />
        ))}
      </ul>

      {!loading && !shops.length ? (
        <p className="text-sm text-slate-500">No shops yet — use Connect new shop above.</p>
      ) : null}
    </div>
  );
}

function ShopCard({
  shop,
  demoMode,
  userId,
  syncing,
  connecting,
  onView,
  onSync,
  onConnect,
  onDelete,
}: {
  shop: Shop;
  demoMode: boolean;
  userId?: string;
  syncing: boolean;
  connecting: boolean;
  onView: () => void;
  onSync: () => void;
  onConnect: (input: { shopId?: string; keystring?: string; sharedSecret?: string }) => void;
  onDelete: () => void;
}) {
  const [keystring, setKeystring] = useState('');
  const [sharedSecret, setSharedSecret] = useState('');
  const ready = shop.connected && !shop.reconnectRequired;

  return (
    <li className="rounded-2xl border border-surface-line bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-ink">
          <Store className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">{shop.name}</p>
          <p className="text-xs uppercase tracking-wide text-slate-500">{shop.platform}</p>
          <p className="mt-2 text-sm text-slate-600">
            {ready
              ? `Connected${shop.etsyShopId ? ` · #${shop.etsyShopId}` : ''}`
              : 'Not connected — enter this shop’s Seller app keys below'}
          </p>
          {shop.lastSyncAt ? (
            <p className="mt-1 text-xs text-slate-400">
              Last sync {new Date(shop.lastSyncAt).toLocaleString()}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onView}
              className="text-sm font-medium text-brand hover:underline"
            >
              View orders
            </button>
            {ready ? (
              <button
                type="button"
                disabled={syncing}
                onClick={onSync}
                className="inline-flex items-center gap-1 text-sm font-medium text-slate-700 hover:underline disabled:opacity-60"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} />
                Sync
              </button>
            ) : null}
            {!demoMode && userId ? (
              <button
                type="button"
                onClick={onDelete}
                className="inline-flex items-center gap-1 text-sm text-rose-600 hover:underline"
              >
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </button>
            ) : null}
          </div>

          <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-medium text-slate-700">Seller app keys for this shop</p>
            <input
              value={keystring}
              onChange={(e) => setKeystring(e.target.value)}
              placeholder="Keystring"
              autoComplete="off"
              className="w-full rounded-lg border border-surface-line bg-white px-2.5 py-1.5 text-sm"
            />
            <input
              value={sharedSecret}
              onChange={(e) => setSharedSecret(e.target.value)}
              placeholder="Shared secret"
              type="password"
              autoComplete="off"
              className="w-full rounded-lg border border-surface-line bg-white px-2.5 py-1.5 text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={
                  demoMode ||
                  connecting ||
                  (Boolean(keystring.trim()) !== Boolean(sharedSecret.trim()))
                }
                onClick={() => {
                  if (keystring.trim() && sharedSecret.trim()) {
                    onConnect({
                      shopId: shop.id,
                      keystring,
                      sharedSecret,
                    });
                  } else {
                    onConnect({ shopId: shop.id });
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-700 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                <Link2 className="h-3.5 w-3.5" />
                {connecting
                  ? 'Opening Etsy…'
                  : keystring.trim() && sharedSecret.trim()
                    ? 'Connect with these keys'
                    : 'Reconnect (saved keys)'}
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Leave keys blank only if this shop already saved them before — otherwise paste both.
            </p>
          </div>
        </div>
      </div>
    </li>
  );
}
