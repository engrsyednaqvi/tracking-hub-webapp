import { Plus, Store } from 'lucide-react';
import { useShops } from '@/context/ShopContext';

export function ShopsPage() {
  const { shops, setActiveShopId } = useShops();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Etsy shops</h2>
          <p className="mt-1 text-sm text-slate-600">
            Connect multiple shops here. Toggle which shop you are viewing from the header.
          </p>
        </div>
        <button
          type="button"
          disabled
          title="Etsy OAuth comes next with Firebase"
          className="inline-flex items-center gap-2 rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white opacity-60"
        >
          <Plus className="h-4 w-4" /> Connect shop
        </button>
      </div>

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
                  {shop.connected ? 'Connected' : 'Placeholder — not connected yet'}
                </p>
                <button
                  type="button"
                  onClick={() => setActiveShopId(shop.id)}
                  className="mt-3 text-sm font-medium text-brand hover:underline"
                >
                  View orders
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
