import { Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useShops } from '@/context/ShopContext';
import { deleteOrder } from '@/services/orders';
import { statusLabel, statusTone } from '@/utils/status';
import { cn } from '@/lib/cn';

export function OrdersTable() {
  const { user, demoMode } = useAuth();
  const { filteredOrders, shops, loading } = useShops();

  if (loading) {
    return <p className="text-sm text-slate-500">Loading orders…</p>;
  }

  if (!filteredOrders.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-14 text-center">
        <p className="text-sm font-medium text-slate-800">No orders yet</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
          Add orders manually for now. Etsy sync will land once OAuth + Cloud Functions are wired.
        </p>
      </div>
    );
  }

  const shopName = (id: string) => shops.find((s) => s.id === id)?.name ?? 'Shop';

  return (
    <div className="overflow-x-auto rounded-2xl border border-surface-line bg-white shadow-sm">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-surface-line bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2.5 font-medium">Order</th>
            <th className="px-3 py-2.5 font-medium">Shop</th>
            <th className="px-3 py-2.5 font-medium">Customer</th>
            <th className="px-3 py-2.5 font-medium">Status</th>
            <th className="px-3 py-2.5 font-medium">Tracking</th>
            <th className="px-3 py-2.5 font-medium" />
          </tr>
        </thead>
        <tbody>
          {filteredOrders.map((order) => (
            <tr key={order.id} className="border-b border-surface-line/70 last:border-0">
              <td className="px-3 py-2.5 font-medium text-slate-900">
                {order.etsyOrderNumber || '—'}
                {order.product ? (
                  <p className="text-xs font-normal text-slate-500">{order.product}</p>
                ) : null}
              </td>
              <td className="px-3 py-2.5 text-slate-600">{shopName(order.shopId)}</td>
              <td className="px-3 py-2.5 text-slate-600">{order.customerName || '—'}</td>
              <td className="px-3 py-2.5">
                <span
                  className={cn(
                    'inline-flex rounded-md px-2 py-0.5 text-xs font-medium',
                    statusTone(order.status),
                  )}
                >
                  {statusLabel(order.status)}
                </span>
              </td>
              <td className="px-3 py-2.5 text-slate-600">
                {order.trackingNumber || '—'}
                {order.carrier ? (
                  <p className="text-xs text-slate-400">{order.carrier}</p>
                ) : null}
              </td>
              <td className="px-3 py-2.5 text-right">
                {!demoMode && user ? (
                  <button
                    type="button"
                    title="Delete order"
                    onClick={() => void deleteOrder(user.uid, order.id)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
