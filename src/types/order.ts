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

export type EtsyMoney = {
  amount: number;
  divisor: number;
  currencyCode: string;
  formatted: string;
};

export type EtsyVariation = {
  propertyId: number | null;
  valueId: number | null;
  formattedName: string;
  formattedValue: string;
};

export type EtsyLineItem = {
  transactionId: string;
  title: string;
  description: string;
  quantity: number;
  listingId: number | null;
  productId: number | null;
  sku: string;
  isDigital: boolean;
  fileData: string;
  price: EtsyMoney | null;
  shippingCost: EtsyMoney | null;
  variations: EtsyVariation[];
  productData: EtsyVariation[];
  shippedAt: string | null;
  paidAt: string | null;
  createdAt: string | null;
  expectedShipDate: string | null;
  shippingMethod: string;
  shippingUpgrade: string;
  shippingProfileId: string;
  minProcessingDays: number | null;
  maxProcessingDays: number | null;
  buyerCoupon: number | null;
  shopCoupon: number | null;
  listingImageId: number | null;
  imageUrl: string;
};

export type EtsyShipment = {
  receiptShippingId: string;
  trackingCode: string;
  carrierName: string;
  notificationAt: string | null;
  mailingDate: string | null;
};

/** Full Open API receipt snapshot persisted during sync. */
export type OrderEtsyDetails = {
  receiptId: string;
  receiptType: string;
  status: string;
  isPaid: boolean;
  isShipped: boolean;
  isDelivered: boolean;
  isCanceled: boolean;
  isGift: boolean;
  giftMessage: string;
  giftSender: string;
  sellerUserId: string;
  sellerEmail: string;
  buyerUserId: string;
  buyerEmail: string;
  paymentMethod: string;
  paymentEmail: string;
  messageFromBuyer: string;
  messageFromSeller: string;
  messageFromPayment: string;
  name: string;
  firstLine: string;
  secondLine: string;
  city: string;
  state: string;
  zip: string;
  countryIso: string;
  formattedAddress: string;
  createdAt: string | null;
  updatedAt: string | null;
  subtotal: EtsyMoney | null;
  totalPrice: EtsyMoney | null;
  totalShippingCost: EtsyMoney | null;
  totalTaxCost: EtsyMoney | null;
  totalVatCost: EtsyMoney | null;
  discountAmt: EtsyMoney | null;
  giftWrapPrice: EtsyMoney | null;
  grandtotal: EtsyMoney | null;
  lineItems: EtsyLineItem[];
  shipments: EtsyShipment[];
  refunds: Array<Record<string, unknown>>;
  raw: Record<string, unknown>;
};

export interface Order {
  id: string;
  shopId: string;
  etsyOrderNumber: string;
  etsyReceiptId?: string;
  customerName: string;
  product: string;
  /** Large listing image from Etsy when available. */
  imageUrl?: string;
  status: OrderStatus;
  /** Raw status string from Etsy when present. */
  etsyStatusRaw?: string;
  /** Normalized USPS tracking status (separate from Etsy status). */
  uspsStatus?: OrderStatus | null;
  /** Human-readable USPS status summary from the Tracking API. */
  uspsSummary?: string;
  /** Raw USPS status category / summary blob for debugging. */
  uspsStatusRaw?: string;
  /** ISO time of the last successful USPS tracking lookup. */
  uspsCheckedAt?: string;
  /** Rich receipt payload from Open API (after sync). */
  etsy?: OrderEtsyDetails;
  /** Selected supplier doc id when chosen from the user's suppliers list. */
  supplierId?: string;
  /** Denormalized supplier display name (stable if the supplier is renamed/deleted). */
  supplierName: string;
  supplierOrderNumber: string;
  /** Manual supplier / warehouse tracking number (not Etsy outbound). */
  supplierTrackingNumber: string;
  trackingNumber: string;
  carrier: string;
  /** Etsy postage label id when purchased via Etsy Shipping. */
  etsyShippingLabelId?: string;
  etsyShipmentId?: string;
  /** Latest ship/dispatch time from Etsy (shipped_timestamp / shipment notification). */
  dispatchedAt?: string;
  /** Etsy expected ship-by deadline (for orders not yet dispatched). */
  shipByAt?: string;
  createdAt: string;
  updatedAt: string;
}

export const DEMO_ORDERS: Order[] = [];
