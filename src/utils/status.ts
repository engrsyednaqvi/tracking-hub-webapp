import type { Order, OrderStatus } from '@/types';

const LABELS: Record<OrderStatus, string> = {
  waiting: 'Unprocessed',
  processing: 'Pre-transit',
  in_transit: 'In transit',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  exception: 'Exception',
  returned: 'Returned',
  failed_delivery: 'Failed delivery',
  lost: 'Lost',
};

const TONES: Record<OrderStatus, string> = {
  waiting: 'bg-slate-100 text-slate-700',
  processing: 'bg-sky-100 text-sky-800',
  in_transit: 'bg-teal-100 text-teal-800',
  out_for_delivery: 'bg-amber-100 text-amber-900',
  delivered: 'bg-emerald-100 text-emerald-800',
  exception: 'bg-rose-100 text-rose-800',
  returned: 'bg-violet-100 text-violet-800',
  failed_delivery: 'bg-rose-100 text-rose-800',
  lost: 'bg-rose-100 text-rose-900',
};

/** Dashboard filter chips (bucketed). */
export const ORDER_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unprocessed', label: 'Unprocessed' },
  { id: 'pre_transit', label: 'Pre-transit' },
  { id: 'in_transit', label: 'In transit' },
  { id: 'delivered', label: 'Delivered' },
] as const;

export type OrderFilterId = (typeof ORDER_FILTERS)[number]['id'];

export function statusLabel(status: OrderStatus): string {
  return LABELS[status] ?? status;
}

export function statusTone(status: OrderStatus): string {
  return TONES[status] ?? 'bg-slate-100 text-slate-700';
}

/** Waiting / Unprocessed = paid on Etsy, not marked shipped yet. */
export function statusHelp(status: OrderStatus): string {
  switch (status) {
    case 'waiting':
      return 'Paid on Etsy, not marked shipped yet (no tracking / still to process).';
    case 'processing':
      return 'Label created or pre-transit — carrier has not shown movement yet.';
    case 'in_transit':
      return 'Marked shipped on Etsy / moving with the carrier.';
    case 'out_for_delivery':
      return 'Out for delivery today.';
    case 'delivered':
      return 'Completed / delivered.';
    default:
      return '';
  }
}

export function orderMatchesFilter(order: Order, filter: OrderFilterId): boolean {
  if (filter === 'all') return true;
  if (filter === 'unprocessed') return order.status === 'waiting';
  if (filter === 'pre_transit') {
    // Shipped on Etsy but no useful tracking yet, or explicit pre-transit status.
    return (
      order.status === 'processing' ||
      (order.status === 'in_transit' && !order.trackingNumber.trim())
    );
  }
  if (filter === 'in_transit') {
    return (
      order.status === 'out_for_delivery' ||
      (order.status === 'in_transit' && Boolean(order.trackingNumber.trim()))
    );
  }
  if (filter === 'delivered') return order.status === 'delivered';
  return true;
}

export function countForFilter(orders: Order[], filter: OrderFilterId): number {
  return orders.filter((o) => orderMatchesFilter(o, filter)).length;
}
