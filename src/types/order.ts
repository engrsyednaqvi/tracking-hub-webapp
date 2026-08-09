/** Aligned with the Chrome extension status list. */
export const ORDER_STATUSES = [
  'waiting',
  'processing',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'exception',
  'returned',
  'failed_delivery',
  'lost',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface Order {
  id: string;
  shopId: string;
  etsyOrderNumber: string;
  customerName: string;
  product: string;
  status: OrderStatus;
  supplierName: string;
  supplierOrderNumber: string;
  trackingNumber: string;
  carrier: string;
  createdAt: string;
  updatedAt: string;
}

export const DEMO_ORDERS: Order[] = [];
