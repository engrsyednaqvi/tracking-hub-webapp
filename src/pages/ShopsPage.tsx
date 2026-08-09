import { useEffect, useState, type FormEvent } from 'react';
import { Link2, Plus, RefreshCw, Store, Trash2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useShops } from '@/context/ShopContext';
import { applyEtsyShipmentsByOrder, startEtsyOAuth, syncEtsyOrders } from '@/lib/functions';
import { createShop, deleteShop } from '@/services/shops';

const ETSY_CALLBACK =
  'https://us-central1-tracking-hub-webapp-29401.cloudfunctions.net/etsyOAuthCallback';

export function ShopsPage() {
  const { user, demoMode } = useAuth();
  const { shops, setActiveShopId, loading, error } = useShops();
  const [searchParams, setSearchParams] = useSearchParams();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [syncingId, setSyncingId] = useState<string | 'all' | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [shipmentsJson, setShipmentsJson] = useState('');
  const [applyingTracking, setApplyingTracking] = useState(false);

  useEffect(() => {
    const etsy = searchParams.get('etsy');
    if (!etsy) return;
    if (etsy === 'connected') {
      const shop = searchParams.get('shop');
      setBanner(shop ? `Connected “${shop}”. Click Sync to pull orders.` : 'Etsy shop connected.');
    } else if (etsy === 'error') {
      setFormError(searchParams.get('message') || 'Etsy connect failed.');
    }
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (demoMode || !user) {
      setFormError('Sign in to add shops.');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const shop = await createShop(user.uid, { name });
      setName('');
      setActiveShopId(shop.id);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not add shop');
    } finally {
      setBusy(false);
    }
  }

  async function onConnectEtsy() {
    if (demoMode || !user) {
      setFormError('Sign in first.');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const { authUrl } = await startEtsyOAuth();
      window.location.assign(authUrl);
    } catch (err) {
      const anyErr = err as { message?: string; code?: string; details?: unknown };
      setFormError(
        anyErr?.message ||
          (typeof anyErr?.code === 'string' ? anyErr.code : null) ||
          'Could not start Etsy connect',
      );
      setBusy(false);
    }
  }

  async function onSync(shopId?: string) {
    if (demoMode || !user) return;
    setSyncingId(shopId ?? 'all');
    setFormError(null);
    try {
      const result = await syncEtsyOrders({ shopId, syncDays: 30 });
      setBanner(
        `Synced ${result.shops} shop(s): ${result.created} new, ${result.updated} updated (last ${result.syncDays} days).`,
      );
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncingId(null);
    }
  }

  async function onApplyTrackingJson() {
    if (demoMode || !user) return;
    setApplyingTracking(true);
    setFormError(null);
    try {
      const payload = JSON.parse(shipmentsJson) as unknown;
      const result = await applyEtsyShipmentsByOrder(payload);
      setBanner(
        `Applied Mission Control tracking: ${result.updated} order(s) updated (${result.matched} in payload).`,
      );
      setShipmentsJson('');
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Could not apply tracking JSON',
      );
    } finally {
      setApplyingTracking(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Etsy shops</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Connect with the same Etsy developer app as the Chrome extension. Orders sync into
            Firebase for this web dashboard.
          </p>
          {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
          {banner ? <p className="mt-2 text-sm text-teal-700">{banner}</p> : null}
          {formError ? <p className="mt-2 text-sm text-rose-600">{formError}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || demoMode}
            onClick={() => void onConnectEtsy()}
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            <Link2 className="h-4 w-4" />
            {busy ? 'Redirecting…' : 'Connect Etsy'}
          </button>
          <button
            type="button"
            disabled={!!syncingId || demoMode || !shops.some((s) => s.connected)}
            onClick={() => void onSync()}
            className="inline-flex items-center gap-2 rounded-xl border border-surface-line bg-white px-3 py-2 text-sm font-medium text-slate-800 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${syncingId === 'all' ? 'animate-spin' : ''}`} />
            Sync all
          </button>
        </div>
      </div>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <p className="font-medium">One-time Etsy app Callback URL change</p>
        <p className="mt-1">
          Etsy allows only one callback URL per app. For web Connect to work, set your app’s
          Callback URL to exactly:
        </p>
        <code className="mt-2 block break-all rounded-lg bg-white/80 px-2 py-1.5 text-xs">
          {ETSY_CALLBACK}
        </code>
        <p className="mt-2 text-amber-900/80">
          That replaces the extension callback (
          <span className="break-all">
            …chromiumapp.org/etsy
          </span>
          ) until we migrate the extension to this same Firebase OAuth. Keystring/secret stay the
          same.
        </p>
      </section>

      <section className="rounded-2xl border border-surface-line bg-white p-4 shadow-sm">
        <p className="font-medium text-slate-900">Pre-transit / In transit from Etsy</p>
        <p className="mt-1 text-sm text-slate-600">
          Etsy’s public API cannot read those statuses — only the seller site can (
          <code className="text-xs">majorTrackingState</code>). Paste is a temporary bridge; next
          step is auto-refresh via the Chrome extension while you’re logged into Etsy (no more
          paste). For now: Network →{' '}
          <code className="text-xs">/shipments/by-order</code> on Pre-transit and In transit
          filters.
        </p>
        <textarea
          value={shipmentsJson}
          onChange={(e) => setShipmentsJson(e.target.value)}
          rows={6}
          placeholder='{"shipments":[...],"ordersToShipments":{...}}'
          className="mt-3 w-full rounded-xl border border-surface-line px-3 py-2 font-mono text-xs"
        />
        <button
          type="button"
          disabled={demoMode || applyingTracking || !shipmentsJson.trim()}
          onClick={() => void onApplyTrackingJson()}
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {applyingTracking ? 'Applying…' : 'Apply tracking statuses'}
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
                      disabled={!!syncingId}
                      onClick={() => void onSync(shop.id)}
                      className="inline-flex items-center gap-1 text-sm font-medium text-slate-700 hover:underline disabled:opacity-60"
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${syncingId === shop.id ? 'animate-spin' : ''}`}
                      />
                      Sync
                    </button>
                  ) : null}
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
