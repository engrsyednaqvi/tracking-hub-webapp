import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ExternalLink,
  Package,
  Trash2,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useShops } from '@/context/ShopContext';
import { SupplierSelect, SupplierTrackingInput } from '@/components/orders/SupplierFields';
import { deleteOrder } from '@/services/orders';
import { formatOrderDate } from '@/utils/date';
import {
  countForFilter,
  ORDER_FILTERS,
  orderMatchesFilter,
  statusHelp,
  statusLabel,
  statusSortRank,
  statusTone,
  type OrderFilterId,
} from '@/utils/status';
import { buildTrackingUrl } from '@/utils/trackingUrl';
import { cn } from '@/lib/cn';
import type { Order } from '@/types';

type SortKey = 'date' | 'status' | 'dispatched';
type SortDir = 'asc' | 'desc';

/** Actual dispatch date, else Etsy ship-by deadline for unshipped orders. */
function dispatchColumnTime(order: Order): number {
  const iso = order.dispatchedAt || order.shipByAt;
  return iso ? new Date(iso).getTime() || 0 : 0;
}

export function OrdersTable({
  statusFilter,
  onStatusFilterChange,
}: {
  statusFilter: OrderFilterId;
  onStatusFilterChange: (id: OrderFilterId) => void;
}) {
  const { user, demoMode } = useAuth();
  const { filteredOrders, shops, loading } = useShops();
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const visible = useMemo(() => {
    const rows = filteredOrders.filter((o) => orderMatchesFilter(o, statusFilter));
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortKey === 'date') {
        const ta = new Date(a.createdAt).getTime() || 0;
        const tb = new Date(b.createdAt).getTime() || 0;
        if (ta !== tb) return (ta - tb) * dir;
        return (statusSortRank(a.status) - statusSortRank(b.status)) * dir;
      }
      if (sortKey === 'dispatched') {
        const ta = dispatchColumnTime(a);
        const tb = dispatchColumnTime(b);
        if (!ta && !tb) return 0;
        if (!ta) return 1;
        if (!tb) return -1;
        if (ta !== tb) return (ta - tb) * dir;
        return (new Date(b.createdAt).getTime() || 0) - (new Date(a.createdAt).getTime() || 0);
      }
      const sa = statusSortRank(a.status);
      const sb = statusSortRank(b.status);
      if (sa !== sb) return (sa - sb) * dir;
      const ta = new Date(a.createdAt).getTime() || 0;
      const tb = new Date(b.createdAt).getTime() || 0;
      return tb - ta;
    });
  }, [filteredOrders, statusFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(key === 'status' ? 'asc' : 'desc');
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading orders…</p>;
  }

  const shopName = (id: string) => shops.find((s) => s.id === id)?.name ?? 'Shop';
  const canDelete = !demoMode && !!user;

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

      {!visible.length ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-14 text-center">
          <p className="text-sm font-medium text-slate-800">No orders in this filter</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
            Try another filter, or sync Etsy again from Shops.
          </p>
        </div>
      ) : (
        <>
          {/* Mobile / tablet: stacked cards so every field stays readable */}
          <div className="space-y-3 xl:hidden">
            {visible.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                shopLabel={shopName(order.shopId)}
                canDelete={canDelete}
                onDelete={() => user && void deleteOrder(user.uid, order.id)}
              />
            ))}
          </div>

          {/* Desktop: wide table with column floors + horizontal scroll if needed */}
          <div className="hidden overflow-x-auto rounded-2xl border border-surface-line bg-white shadow-sm xl:block">
            <table className="w-full min-w-[78rem] table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[16%]" />
                <col className="w-[7%]" />
                <col className="w-[7%]" />
                <col className="w-[9%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[12%]" />
                <col className="w-[8%]" />
                <col className="w-[3%]" />
              </colgroup>
              <thead className="border-b border-surface-line bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Item</th>
                  <th className="px-3 py-2.5 font-medium">Order</th>
                  <th className="px-3 py-2.5 font-medium">
                    <SortButton
                      label="Date"
                      active={sortKey === 'date'}
                      dir={sortDir}
                      onClick={() => toggleSort('date')}
                    />
                  </th>
                  <th className="px-3 py-2.5 font-medium">Customer</th>
                  <th className="px-3 py-2.5 font-medium">
                    <SortButton
                      label="Etsy"
                      active={sortKey === 'status'}
                      dir={sortDir}
                      onClick={() => toggleSort('status')}
                    />
                  </th>
                  <th className="px-3 py-2.5 font-medium">USPS</th>
                  <th className="px-3 py-2.5 font-medium">Tracking</th>
                  <th className="px-3 py-2.5 font-medium">Supplier</th>
                  <th className="px-3 py-2.5 font-medium">Supplier track</th>
                  <th className="px-3 py-2.5 font-medium">
                    <SortButton
                      label="Ship by"
                      active={sortKey === 'dispatched'}
                      dir={sortDir}
                      onClick={() => toggleSort('dispatched')}
                    />
                  </th>
                  <th className="px-2 py-2.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                {visible.map((order) => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    shopLabel={shopName(order.shopId)}
                    canDelete={canDelete}
                    onDelete={() => user && void deleteOrder(user.uid, order.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function SortButton({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 uppercase tracking-wide transition-colors',
        active ? 'text-brand' : 'text-slate-500 hover:text-slate-800',
      )}
    >
      {label}
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function StatusBadge({
  status,
  title,
}: {
  status: Order['status'] | NonNullable<Order['uspsStatus']>;
  title?: string;
}) {
  return (
    <span
      title={title || statusHelp(status)}
      className={cn(
        'inline-flex max-w-full truncate rounded-md px-2 py-0.5 text-xs font-medium',
        statusTone(status),
      )}
    >
      {statusLabel(status)}
    </span>
  );
}

function UspsCell({ order }: { order: Order }) {
  if (order.uspsStatus) {
    return (
      <StatusBadge
        status={order.uspsStatus}
        title={order.uspsSummary || order.uspsStatusRaw || statusHelp(order.uspsStatus)}
      />
    );
  }
  const fallback = order.uspsSummary || order.uspsStatusRaw;
  if (fallback) {
    return (
      <span className="block truncate text-xs text-slate-500" title={order.uspsStatusRaw || fallback}>
        {fallback}
      </span>
    );
  }
  return <span className="text-slate-400">—</span>;
}

function TrackingCell({ order }: { order: Order }) {
  const trackUrl = buildTrackingUrl(order.trackingNumber, order.carrier);
  return (
    <div className="min-w-0">
      {trackUrl ? (
        <a
          href={trackUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex max-w-full items-center gap-1 font-medium text-brand hover:underline"
          title={order.trackingNumber}
        >
          <span className="truncate">{order.trackingNumber || 'Track'}</span>
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
        </a>
      ) : (
        <span className="text-slate-400">—</span>
      )}
      {order.carrier ? (
        <p className="truncate text-xs text-slate-400" title={order.carrier}>
          {order.carrier}
        </p>
      ) : null}
    </div>
  );
}

function ShipByCell({ order }: { order: Order }) {
  if (order.dispatchedAt) {
    return <span title="Dispatched">{formatOrderDate(order.dispatchedAt)}</span>;
  }
  if (order.shipByAt) {
    return (
      <span title="Ship by (not yet dispatched)">
        <span className="block">{formatOrderDate(order.shipByAt)}</span>
        <span className="text-xs text-slate-400">Ship by</span>
      </span>
    );
  }
  return <span className="text-slate-400">—</span>;
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
  return (
    <tr className="border-b border-surface-line/70 last:border-0 hover:bg-slate-50/80">
      <td className="px-3 py-2.5 align-top">
        <Link to={`/orders/${order.id}`} className="flex min-w-0 items-start gap-2.5">
          {order.imageUrl ? (
            <img
              src={order.imageUrl}
              alt=""
              className="h-11 w-11 shrink-0 rounded-lg object-cover ring-1 ring-surface-line"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
              <Package className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0">
            <p className="line-clamp-2 font-medium leading-snug text-slate-900 hover:text-brand">
              {order.product || 'Listing'}
            </p>
            <p className="truncate text-xs text-slate-400">{shopLabel}</p>
          </div>
        </Link>
      </td>
      <td className="px-3 py-2.5 align-top font-medium text-slate-900">
        <Link
          to={`/orders/${order.id}`}
          className="block truncate hover:text-brand hover:underline"
          title={order.etsyOrderNumber}
        >
          {order.etsyOrderNumber || '—'}
        </Link>
      </td>
      <td className="px-3 py-2.5 align-top whitespace-nowrap text-slate-600">
        {formatOrderDate(order.createdAt)}
      </td>
      <td className="px-3 py-2.5 align-top text-slate-600">
        <span className="line-clamp-2" title={order.customerName}>
          {order.customerName || '—'}
        </span>
      </td>
      <td className="px-3 py-2.5 align-top">
        <StatusBadge status={order.status} />
      </td>
      <td className="px-3 py-2.5 align-top">
        <UspsCell order={order} />
      </td>
      <td className="px-3 py-2.5 align-top">
        <TrackingCell order={order} />
      </td>
      <td className="px-3 py-2.5 align-top">
        <SupplierSelect order={order} className="min-w-0 max-w-full" />
      </td>
      <td className="px-3 py-2.5 align-top">
        <SupplierTrackingInput order={order} className="min-w-0 max-w-full" />
      </td>
      <td className="px-3 py-2.5 align-top whitespace-nowrap text-slate-600">
        <ShipByCell order={order} />
      </td>
      <td className="px-2 py-2.5 align-top text-right">
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-1 text-sm text-slate-800">{children}</div>
    </div>
  );
}

function OrderCard({
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
  return (
    <article className="rounded-2xl border border-surface-line bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <Link to={`/orders/${order.id}`} className="shrink-0">
          {order.imageUrl ? (
            <img
              src={order.imageUrl}
              alt=""
              className="h-16 w-16 rounded-xl object-cover ring-1 ring-surface-line"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="inline-flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
              <Package className="h-6 w-6" />
            </span>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <Link to={`/orders/${order.id}`} className="block">
            <p className="font-semibold leading-snug text-slate-900 hover:text-brand">
              {order.product || 'Listing'}
            </p>
          </Link>
          <p className="mt-0.5 text-xs text-slate-500">
            {shopLabel} · #{order.etsyOrderNumber || '—'} · {formatOrderDate(order.createdAt)}
          </p>
          <p className="mt-1 text-sm text-slate-700">{order.customerName || '—'}</p>
        </div>
        {canDelete ? (
          <button
            type="button"
            title="Delete order"
            onClick={onDelete}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Etsy status">
          <StatusBadge status={order.status} />
        </Field>
        <Field label="USPS">
          <UspsCell order={order} />
        </Field>
        <Field label="Ship by">
          <ShipByCell order={order} />
        </Field>
        <Field label="Tracking">
          <TrackingCell order={order} />
        </Field>
        <Field label="Supplier">
          <SupplierSelect order={order} className="min-w-0" />
        </Field>
        <Field label="Supplier tracking">
          <SupplierTrackingInput order={order} className="min-w-0" />
        </Field>
      </div>
    </article>
  );
}
