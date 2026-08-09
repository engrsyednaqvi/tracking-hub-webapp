/** Open the Etsy seller order page (must be logged into Etsy). */
export function etsyOrderUrl(receiptId: string | undefined): string | null {
  const id = String(receiptId ?? '').trim();
  if (!id) return null;
  return `https://www.etsy.com/your/orders/${encodeURIComponent(id)}`;
}

/**
 * Entry point for printing an Etsy-purchased shipping label.
 *
 * Verified: Open API has no label PDF endpoint. Direct
 * `/shipping-labels/{id}/download` URLs 404 without a seller session, and even
 * with session they are not part of the public API. The reliable path is the
 * seller order page → “Download Shipping Label” (PDF).
 */
export function etsyShippingLabelUrl(order: {
  etsyReceiptId?: string;
  etsyOrderNumber?: string;
  etsyShippingLabelId?: string;
}): string | null {
  return etsyOrderUrl(order.etsyReceiptId || order.etsyOrderNumber);
}
