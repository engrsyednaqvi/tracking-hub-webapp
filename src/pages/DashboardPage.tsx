import { useState } from 'react';
import { Package, Plus, Truck, TriangleAlert } from 'lucide-react';
import { AddOrderForm } from '@/components/orders/AddOrderForm';
import { OrdersTable } from '@/components/orders/OrdersTable';
import { useAuth } from '@/context/AuthContext';
import { useShops } from '@/context/ShopContext';

export function DashboardPage() {
  const { demoMode } = useAuth();
  const { activeShopId, activeShop, shops, filteredOrders, error } = useShops();
  const [showAdd, setShowAdd] = useState(false);

  const scope =
    activeShopId === 'all'
      ? `All shops (${shops.length})`
      : activeShop?.name ?? 'Shop';

  const inTransit = filteredOrders.filter((o) =>
    ['in_transit', 'out_for_delivery', 'processing'].includes(o.status),
  ).length;
  const attention = filteredOrders.filter((o) =>
    ['exception', 'failed_delivery', 'lost', 'returned'].includes(o.status),
  ).length;

  const stats = [
    { label: 'Orders', value: String(filteredOrders.length), icon: Package },
    { label: 'In transit', value: String(inTransit), icon: Truck },
    { label: 'Needs attention', value: String(attention), icon: TriangleAlert },
  ];

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-surface-line bg-white/90 p-6 shadow-sm backdrop-blur">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">Dashboard</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">Orders for {scope}</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            {demoMode
              ? 'Demo mode — add Firebase config to enable sign-in and cloud sync.'
              : 'Orders are stored in Firestore under your account. Shop switcher filters this list.'}
          </p>
          {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="inline-flex items-center gap-2 rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white"
        >
          <Plus className="h-4 w-4" />
          {showAdd ? 'Close' : 'Add order'}
        </button>
      </section>

      {showAdd ? (
        <section className="rounded-2xl border border-surface-line bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">New order</h3>
          <AddOrderForm onDone={() => setShowAdd(false)} />
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-3">
        {stats.map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="rounded-2xl border border-surface-line bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">{label}</span>
              <Icon className="h-4 w-4 text-brand" />
            </div>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
          </div>
        ))}
      </section>

      <OrdersTable />
    </div>
  );
}
