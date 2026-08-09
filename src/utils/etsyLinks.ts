/** Open the Etsy seller order page (must be logged into Etsy). */
export function etsyOrderUrl(receiptId: string | undefined): string | null {
  const id = String(receiptId ?? '').trim();
  if (!id) return null;
  return `https://www.etsy.com/your/orders/${encodeURIComponent(id)}`;
}

/**
 * Best-effort print/download entry point for an Etsy-purchased label.
 * Opens the order in Shop Manager — click “Download Shipping Label” there.
 * (Etsy Open API does not expose label PDFs.)
 */
export function etsyShippingLabelUrl(order: {
  etsyReceiptId?: string;
  etsyOrderNumber?: string;
  etsyShippingLabelId?: string;
}): string | null {
  return etsyOrderUrl(order.etsyReceiptId || order.etsyOrderNumber);
}
