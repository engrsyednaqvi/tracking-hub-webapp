/** Etsy-aligned shipping statuses shown in the seller dashboard. */
export const ORDER_STATUSES = [
  'no_tracking',
  'pre_transit',
  'in_transit',
  'delivered',
  'cancelled',
  // Kept for older docs / manual entries
  'waiting',
  'processing',
  'out_for_delivery',
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
  etsyReceiptId?: string;
  customerName: string;
  product: string;
  /** Listing thumbnail from Etsy when available. */
  imageUrl?: string;
  status: OrderStatus;
  /** Raw status string from Etsy when present. */
  etsyStatusRaw?: string;
  supplierName: string;
  supplierOrderNumber: string;
  trackingNumber: string;
  carrier: string;
  /** Etsy postage label id when purchased via Etsy Shipping. */
  etsyShippingLabelId?: string;
  etsyShipmentId?: string;
  createdAt: string;
  updatedAt: string;
}

export const DEMO_ORDERS: Order[] = [];
