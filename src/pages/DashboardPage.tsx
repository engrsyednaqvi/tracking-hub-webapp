import { Package, Truck, TriangleAlert } from 'lucide-react';
import { useShops } from '@/context/ShopContext';

const stats = [
  { label: 'Orders', value: '—', icon: Package, hint: 'Connect shops to sync' },
  { label: 'In transit', value: '—', icon: Truck, hint: 'Live tracking later' },
  { label: 'Needs attention', value: '—', icon: TriangleAlert, hint: 'Exceptions & OFD' },
];

export function DashboardPage() {
  const { activeShopId, activeShop, shops } = useShops();
  const scope =
    activeShopId === 'all'
      ? `All shops (${shops.length})`
      : activeShop?.name ?? 'Shop';

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-surface-line bg-white/90 p-6 shadow-sm backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">Dashboard</p>
        <h2 className="mt-1 text-xl font-semibold text-slate-900">Orders for {scope}</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          This is the web foundation. Next: Firebase auth, Etsy OAuth per shop, and the same
          order table you use in the Chrome extension — filtered by the shop switcher above.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {stats.map(({ label, value, icon: Icon, hint }) => (
          <div
            key={label}
            className="rounded-2xl border border-surface-line bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">{label}</span>
              <Icon className="h-4 w-4 text-brand" />
            </div>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
            <p className="mt-1 text-xs text-slate-500">{hint}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-16 text-center">
        <p className="text-sm font-medium text-slate-800">No orders yet</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
          Add Etsy shops under <span className="font-medium text-slate-700">Shops</span>, then
          sync. Phone apps and the Chrome extension will talk to this same backend later.
        </p>
      </section>
    </div>
  );
}
