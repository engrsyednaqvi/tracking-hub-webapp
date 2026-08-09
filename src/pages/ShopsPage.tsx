import { useState, type FormEvent } from 'react';
import { Plus, Store, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useShops } from '@/context/ShopContext';
import { createShop, deleteShop } from '@/services/shops';

export function ShopsPage() {
  const { user, demoMode } = useAuth();
  const { shops, setActiveShopId, loading, error } = useShops();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (demoMode || !user) {
      setFormError('Connect Firebase and sign in to add shops.');
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Etsy shops</h2>
        <p className="mt-1 text-sm text-slate-600">
          Add each shop you run. Etsy OAuth connect comes next; for now shops are named
          placeholders that own orders.
        </p>
        {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
      </div>

      <form
        onSubmit={onAdd}
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-surface-line bg-white p-4 shadow-sm"
      >
        <label className="min-w-[14rem] flex-1 text-sm">
          <span className="text-slate-600">Shop name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Coastal Home Co"
            className="mt-1 w-full rounded-xl border border-surface-line px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          <Plus className="h-4 w-4" /> Add shop
        </button>
        {formError ? <p className="w-full text-sm text-rose-600">{formError}</p> : null}
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
                  {shop.connected ? 'Connected to Etsy' : 'Not connected — OAuth later'}
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveShopId(shop.id)}
                    className="text-sm font-medium text-brand hover:underline"
                  >
                    View orders
                  </button>
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
        <p className="text-sm text-slate-500">No shops yet — add your first shop above.</p>
      ) : null}
    </div>
  );
}
