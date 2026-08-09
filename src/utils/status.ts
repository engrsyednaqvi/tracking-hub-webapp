import type { OrderStatus } from '@/types';

const LABELS: Record<OrderStatus, string> = {
  waiting: 'Waiting',
  processing: 'Processing',
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

export function statusLabel(status: OrderStatus): string {
  return LABELS[status] ?? status;
}

export function statusTone(status: OrderStatus): string {
  return TONES[status] ?? 'bg-slate-100 text-slate-700';
}
