import type { Order, OrderStatus } from '@/types';

const LABELS: Record<OrderStatus, string> = {
  no_tracking: 'No tracking',
  pre_transit: 'Pre-transit',
  in_transit: 'In transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  waiting: 'No tracking',
  processing: 'Pre-transit',
  out_for_delivery: 'In transit',
  exception: 'Exception',
  returned: 'Returned',
  failed_delivery: 'Failed delivery',
  lost: 'Lost',
};

const TONES: Record<OrderStatus, string> = {
  no_tracking: 'bg-slate-100 text-slate-700',
  pre_transit: 'bg-sky-100 text-sky-800',
  in_transit: 'bg-teal-100 text-teal-800',
  delivered: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-rose-100 text-rose-800',
  waiting: 'bg-slate-100 text-slate-700',
  processing: 'bg-sky-100 text-sky-800',
  out_for_delivery: 'bg-teal-100 text-teal-800',
  exception: 'bg-rose-100 text-rose-800',
  returned: 'bg-violet-100 text-violet-800',
  failed_delivery: 'bg-rose-100 text-rose-800',
  lost: 'bg-rose-100 text-rose-900',
};

/** Sort order matching Etsy shipping progress. */
const STATUS_RANK: Record<string, number> = {
  cancelled: 0,
  no_tracking: 1,
  waiting: 1,
  pre_transit: 2,
  processing: 2,
  in_transit: 3,
  out_for_delivery: 3,
  delivered: 4,
  exception: 5,
  returned: 5,
  failed_delivery: 5,
  lost: 5,
};

/** Dashboard filter chips — match Etsy shipping statuses. */
export const ORDER_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'no_tracking', label: 'No tracking' },
  { id: 'pre_transit', label: 'Pre-transit' },
  { id: 'in_transit', label: 'In transit' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'cancelled', label: 'Cancelled' },
] as const;

export type OrderFilterId = (typeof ORDER_FILTERS)[number]['id'];

export function statusLabel(status: OrderStatus): string {
  return LABELS[status] ?? status;
}

export function statusTone(status: OrderStatus): string {
  return TONES[status] ?? 'bg-slate-100 text-slate-700';
}

export function statusHelp(status: OrderStatus): string {
  switch (status) {
    case 'no_tracking':
    case 'waiting':
      return 'Etsy: No tracking';
    case 'pre_transit':
    case 'processing':
      return 'Etsy: Pre-transit';
    case 'in_transit':
    case 'out_for_delivery':
      return 'Etsy: In transit';
    case 'delivered':
      return 'Etsy: Delivered';
    case 'cancelled':
      return 'Etsy: Cancelled';
    default:
      return '';
  }
}

export function statusSortRank(status: OrderStatus): number {
  return STATUS_RANK[status] ?? 99;
}

/** Normalize legacy statuses into Etsy buckets for filtering. */
export function etsyBucket(status: OrderStatus): OrderFilterId | 'other' {
  if (status === 'no_tracking' || status === 'waiting') return 'no_tracking';
  if (status === 'pre_transit' || status === 'processing') return 'pre_transit';
  if (status === 'in_transit' || status === 'out_for_delivery') return 'in_transit';
  if (status === 'delivered') return 'delivered';
  if (status === 'cancelled') return 'cancelled';
  return 'other';
}

export function orderMatchesFilter(order: Order, filter: OrderFilterId): boolean {
  if (filter === 'all') return true;
  return etsyBucket(order.status) === filter;
}

export function countForFilter(orders: Order[], filter: OrderFilterId): number {
  return orders.filter((o) => orderMatchesFilter(o, filter)).length;
}
