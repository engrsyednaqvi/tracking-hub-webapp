import type { EtsyShippingStatus } from './api';

/** Tracking block from GET /api/v3/ajax/shop/{id}/shipments/by-order */
export interface MissionControlTracking {
  majorTrackingState?: string | null;
  isDelivered?: boolean;
  isInTransit?: boolean;
  isOutForDelivery?: boolean;
  isShipped?: boolean;
  code?: string | null;
}

export interface MissionControlShipment {
  shipmentId?: string | number;
  carrierName?: string | null;
  tracking?: MissionControlTracking | null;
}

export interface ShipmentsByOrderResponse {
  shipments?: MissionControlShipment[];
  ordersToShipments?: Record<string, Array<string | number>>;
}

/**
 * Map Etsy Mission Control tracking → dashboard status.
 * Source of truth: majorTrackingState (e.g. "Pre-transit", "In transit").
 */
export function statusFromMissionControlTracking(
  tracking: MissionControlTracking | null | undefined,
): EtsyShippingStatus | null {
  if (!tracking) return null;

  if (tracking.isDelivered) return 'delivered';

  const major = String(tracking.majorTrackingState ?? '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .trim();

  if (major.includes('cancel')) return 'cancelled';
  if (major.includes('deliver')) return 'delivered';
  if (major.includes('out for delivery') || major === 'in transit' || major.includes('in transit')) {
    return 'in_transit';
  }
  if (major.includes('pre transit') || major === 'pretransit' || major.includes('label created')) {
    return 'pre_transit';
  }
  if (major.includes('no tracking')) return 'no_tracking';

  // Flag fallback when majorTrackingState is missing/unknown.
  if (tracking.isOutForDelivery || tracking.isInTransit) return 'in_transit';
  if (tracking.isShipped) return 'pre_transit';
  if (tracking.code) return 'pre_transit';

  return null;
}

/** Build receiptId → status from a shipments/by-order JSON payload. */
export function statusesFromShipmentsByOrder(
  payload: ShipmentsByOrderResponse,
): Map<string, { status: EtsyShippingStatus; trackingNumber: string; carrier: string; raw: string }> {
  const shipments = payload.shipments ?? [];
  const byShipmentId = new Map<string, MissionControlShipment>();
  for (const s of shipments) {
    if (s.shipmentId != null) byShipmentId.set(String(s.shipmentId), s);
  }

  const out = new Map<
    string,
    { status: EtsyShippingStatus; trackingNumber: string; carrier: string; raw: string }
  >();

  for (const [orderId, shipmentIds] of Object.entries(payload.ordersToShipments ?? {})) {
    const firstId = shipmentIds?.[0];
    const shipment = firstId != null ? byShipmentId.get(String(firstId)) : undefined;
    const tracking = shipment?.tracking;
    const status = statusFromMissionControlTracking(tracking);
    if (!status) continue;
    out.set(orderId, {
      status,
      trackingNumber: String(tracking?.code ?? '').trim(),
      carrier: String(shipment?.carrierName ?? '').trim(),
      raw: [
        tracking?.majorTrackingState && `major:${tracking.majorTrackingState}`,
        tracking?.isShipped && 'isShipped',
        tracking?.isInTransit && 'isInTransit',
        tracking?.isDelivered && 'isDelivered',
        tracking?.isOutForDelivery && 'isOutForDelivery',
      ]
        .filter(Boolean)
        .join(' | '),
    });
  }

  return out;
}
