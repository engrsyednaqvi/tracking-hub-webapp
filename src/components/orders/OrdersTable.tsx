import { ExternalLink, Package, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useShops } from '@/context/ShopContext';
import { deleteOrder } from '@/services/orders';
import { formatOrderDate } from '@/utils/date';
import {
  countForFilter,
  ORDER_FILTERS,
  orderMatchesFilter,
  statusHelp,
  statusLabel,
  statusTone,
  type OrderFilterId,
} from '@/utils/status';
import { buildTrackingUrl } from '@/utils/trackingUrl';
import { cn } from '@/lib/cn';
import type { Order } from '@/types';

export function OrdersTable({
  statusFilter,
  onStatusFilterChange,
}: {
  statusFilter: OrderFilterId;
  onStatusFilterChange: (id: OrderFilterId) => void;
}) {
  const { user, demoMode } = useAuth();
  const { filteredOrders, shops, loading } = useShops();

  const visible = filteredOrders.filter((o) => orderMatchesFilter(o, statusFilter));

  if (loading) {
    return <p className="text-sm text-slate-500">Loading orders…</p>;
  }

  const shopName = (id: string) => shops.find((s) => s.id === id)?.name ?? 'Shop';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {ORDER_FILTERS.map((f) => {
          const count = countForFilter(filteredOrders, f.id);
          const active = statusFilter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onStatusFilterChange(f.id)}
              className={cn(
                'rounded-xl px-3 py-1.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-brand text-white'
                  : 'border border-surface-line bg-white text-slate-700 hover:bg-slate-50',
              )}
            >
              {f.label}
              <span className={cn('ml-1.5 tabular-nums', active ? 'text-white/80' : 'text-slate-400')}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-slate-500">
        Statuses match Etsy shipping:{' '}
        <span className="font-medium text-slate-600">No tracking</span>, Pre-transit, In transit,
        Delivered, Cancelled. Hover a badge for details.
      </p>

      {!visible.length ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-14 text-center">
          <p className="text-sm font-medium text-slate-800">No orders in this filter</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
            Try another filter, or sync Etsy again from Shops.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-surface-line bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-surface-line bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5 font-medium">Item</th>
                <th className="px-3 py-2.5 font-medium">Order</th>
                <th className="px-3 py-2.5 font-medium">Date</th>
                <th className="px-3 py-2.5 font-medium">Customer</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Tracking</th>
                <th className="px-3 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody>
              {visible.map((order) => (
                <OrderRow
                  key={order.id}
                  order={order}
                  shopLabel={shopName(order.shopId)}
                  canDelete={!demoMode && !!user}
                  onDelete={() => user && void deleteOrder(user.uid, order.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OrderRow({
  order,
  shopLabel,
  canDelete,
  onDelete,
}: {
  order: Order;
  shopLabel: string;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const trackUrl = buildTrackingUrl(order.trackingNumber, order.carrier);
  const help = statusHelp(order.status);

  return (
    <tr className="border-b border-surface-line/70 last:border-0">
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-3">
          {order.imageUrl ? (
            <img
              src={order.imageUrl}
              alt=""
              className="h-12 w-12 shrink-0 rounded-lg object-cover ring-1 ring-surface-line"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
              <Package className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0">
            <p className="line-clamp-2 font-medium text-slate-900">
              {order.product || 'Listing'}
            </p>
            <p className="text-xs text-slate-400">{shopLabel}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5 font-medium text-slate-900">
        {order.etsyOrderNumber || '—'}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">
        {formatOrderDate(order.createdAt)}
      </td>
      <td className="px-3 py-2.5 text-slate-600">{order.customerName || '—'}</td>
      <td className="px-3 py-2.5">
        <span
          title={
            order.etsyStatusRaw
              ? `${help}${help ? '\n' : ''}Etsy: ${order.etsyStatusRaw}`
              : help
          }
          className={cn(
            'inline-flex rounded-md px-2 py-0.5 text-xs font-medium',
            statusTone(order.status),
          )}
        >
          {statusLabel(order.status)}
        </span>
      </td>
      <td className="px-3 py-2.5 text-slate-600">
        {trackUrl ? (
          <a
            href={trackUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
          >
            {order.trackingNumber || 'Track'}
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          </a>
        ) : (
          <span>—</span>
        )}
        {order.carrier ? <p className="text-xs text-slate-400">{order.carrier}</p> : null}
      </td>
      <td className="px-3 py-2.5 text-right">
        {canDelete ? (
          <button
            type="button"
            title="Delete order"
            onClick={onDelete}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </td>
    </tr>
  );
}
