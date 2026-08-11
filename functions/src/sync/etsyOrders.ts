import { randomBytes } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import {
  getFirestore,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import {
  fetchAllPaidReceipts,
  fetchListingImageUrl,
  mapReceiptToOrderFields,
  type EtsyShippingStatus,
} from '../etsy/api';
import {
  ensureAccessToken,
  markShopNeedsReconnect,
  type OAuthAppCreds,
} from '../etsy/credentials';
import { errorMessage } from '../errors';
import { fetchUspsTrackingStatus } from '../usps/tracking';

const adminApp = getApps()[0] ?? initializeApp();

function db() {
  return getFirestore(adminApp);
}

function createId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}

export type SyncResult = {
  created: number;
  updated: number;
  shops: number;
  syncDays: number;
  uspsEnriched: number;
  uspsSkipped: number;
  uspsError: string | null;
  shopErrors: string[];
};

export type SyncOptions = {
  uid: string;
  shopDocs: QueryDocumentSnapshot[];
  syncDays: number;
  globalFallback: OAuthAppCreds;
  uspsCreds: { consumerKey: string; consumerSecret: string };
  /** When false, skip USPS enrichment (faster — used by webhooks). */
  enrichUsps?: boolean;
};

/** Sync paid receipts for the given shop documents into the user's orders. */
export async function syncShopDocuments(options: SyncOptions): Promise<SyncResult> {
  const {
    uid,
    syncDays,
    globalFallback,
    uspsCreds,
    enrichUsps = true,
  } = options;

  let shopDocs = options.shopDocs.filter((doc) => doc.get('reconnectRequired') !== true);

  const minCreated = Math.floor(Date.now() / 1000) - syncDays * 24 * 60 * 60;
  const ordersCol = db().collection('users').doc(uid).collection('orders');
  let created = 0;
  let updated = 0;
  let uspsEnriched = 0;
  let uspsSkipped = 0;
  let uspsError: string | null = null;
  const shopErrors: string[] = [];

  for (const shopDoc of shopDocs) {
    const shopLabel = String(shopDoc.get('name') || shopDoc.id);
    try {
      const { accessToken, etsyShopId, keystring, sharedSecret } = await ensureAccessToken(
        uid,
        shopDoc.id,
        globalFallback,
      );
      if (!Number.isFinite(etsyShopId) || etsyShopId <= 0) {
        throw new Error(`Invalid etsyShopId on shop ${shopLabel}`);
      }

      let receipts: Awaited<ReturnType<typeof fetchAllPaidReceipts>>;
      try {
        receipts = await fetchAllPaidReceipts(
          {
            keystring,
            sharedSecret,
            accessToken,
            shopId: etsyShopId,
          },
          minCreated,
        );
      } catch (err) {
        const detail = errorMessage(err);
        if (/\b(401|403)\b/.test(detail) || /invalid.?token|unauthorized/i.test(detail)) {
          const reason = `Etsy API rejected this shop’s access token. Reconnect via Connect Etsy. ${detail}`;
          await markShopNeedsReconnect(uid, shopDoc.id, reason);
          throw new Error(reason);
        }
        throw err;
      }

      const imageCache = new Map<string, string | null>();
      const uspsCache = new Map<string, Awaited<ReturnType<typeof fetchUspsTrackingStatus>>>();

      for (const receipt of receipts) {
        const fields = mapReceiptToOrderFields(receipt);
        if (!fields.etsyReceiptId) continue;

        let status: EtsyShippingStatus = fields.status;
        let etsyStatusRaw = fields.etsyStatusRaw;

        if (
          enrichUsps &&
          fields.trackingNumber &&
          (status === 'pre_transit' || status === 'in_transit' || status === 'delivered')
        ) {
          try {
            const cacheKey = fields.trackingNumber.replace(/\s+/g, '');
            let usps = uspsCache.get(cacheKey);
            if (usps === undefined) {
              usps = await fetchUspsTrackingStatus(
                uspsCreds,
                fields.trackingNumber,
                fields.carrier,
              );
              uspsCache.set(cacheKey, usps);
              await new Promise((r) => setTimeout(r, 200));
            }
            if (usps?.status) {
              status = usps.status;
              etsyStatusRaw = [fields.etsyStatusRaw, usps.raw].filter(Boolean).join(' | ');
              uspsEnriched += 1;
            } else if (usps === null) {
              uspsSkipped += 1;
            }
          } catch (err) {
            uspsError = errorMessage(err, 'USPS tracking lookup failed').slice(0, 240);
            uspsSkipped += 1;
          }
        }

        // Large images per line item (and hero image from first item).
        const etsy = { ...fields.etsy, lineItems: [...fields.etsy.lineItems] };
        for (let i = 0; i < etsy.lineItems.length; i++) {
          const item = etsy.lineItems[i]!;
          if (!item.listingId) continue;
          const cacheKey = `${item.listingId}:${item.listingImageId ?? 0}`;
          if (!imageCache.has(cacheKey)) {
            imageCache.set(
              cacheKey,
              await fetchListingImageUrl(
                { keystring, sharedSecret, accessToken },
                item.listingId,
                item.listingImageId,
              ),
            );
          }
          const url = imageCache.get(cacheKey) ?? '';
          etsy.lineItems[i] = { ...item, imageUrl: url || '' };
        }
        const imageUrl = etsy.lineItems.find((li) => li.imageUrl)?.imageUrl || '';

        const existing = await ordersCol
          .where('etsyReceiptId', '==', fields.etsyReceiptId)
          .limit(1)
          .get();

        const now = new Date().toISOString();
        const shared = {
          etsyOrderNumber: fields.etsyOrderNumber,
          customerName: fields.customerName,
          product: fields.product,
          imageUrl,
          status,
          etsyStatusRaw,
          trackingNumber: fields.trackingNumber,
          carrier: fields.carrier,
          etsy,
          ...(fields.dispatchedAt ? { dispatchedAt: fields.dispatchedAt } : {}),
          ...(fields.shipByAt ? { shipByAt: fields.shipByAt } : {}),
          updatedAt: now,
        };

        if (!existing.empty) {
          const docId = existing.docs[0]!.id;
          const prev = existing.docs[0]!;
          await ordersCol.doc(docId).set(
            {
              ...shared,
              trackingNumber:
                fields.trackingNumber || String(prev.get('trackingNumber') || ''),
              carrier: fields.carrier || String(prev.get('carrier') || ''),
            },
            { merge: true },
          );
          updated += 1;
        } else {
          const id = createId('ord');
          await ordersCol.doc(id).set({
            id,
            shopId: shopDoc.id,
            etsyReceiptId: fields.etsyReceiptId,
            supplierName: '',
            supplierOrderNumber: '',
            createdAt: fields.createdAt,
            ...shared,
          });
          created += 1;
        }
      }

      await shopDoc.ref.set(
        { lastSyncAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { merge: true },
      );
    } catch (err) {
      const msg = errorMessage(err);
      console.error(`[etsySync] shop ${shopLabel}:`, msg);
      shopErrors.push(`${shopLabel}: ${msg}`);
    }
  }

  return {
    created,
    updated,
    shops: shopDocs.length,
    syncDays,
    uspsEnriched,
    uspsSkipped,
    uspsError,
    shopErrors,
  };
}

/** Find connected shop docs for a given Etsy shop id (across all users). */
export async function findShopsByEtsyShopId(
  etsyShopId: string | number,
): Promise<Array<{ uid: string; shopDoc: QueryDocumentSnapshot }>> {
  const idStr = String(etsyShopId);
  const snap = await db()
    .collectionGroup('shops')
    .where('etsyShopId', '==', idStr)
    .limit(20)
    .get();

  const out: Array<{ uid: string; shopDoc: QueryDocumentSnapshot }> = [];
  for (const doc of snap.docs) {
    // users/{uid}/shops/{shopId}
    const uid = doc.ref.parent.parent?.id;
    if (!uid) continue;
    if (doc.get('connected') !== true) continue;
    if (doc.get('reconnectRequired') === true) continue;
    out.push({ uid, shopDoc: doc });
  }
  return out;
}

/** All connected shops across every user (for scheduled sync). */
export async function listAllConnectedShops(): Promise<
  Array<{ uid: string; shopDoc: QueryDocumentSnapshot }>
> {
  const snap = await db().collectionGroup('shops').where('connected', '==', true).get();
  const out: Array<{ uid: string; shopDoc: QueryDocumentSnapshot }> = [];
  for (const doc of snap.docs) {
    const uid = doc.ref.parent.parent?.id;
    if (!uid) continue;
    if (doc.get('reconnectRequired') === true) continue;
    out.push({ uid, shopDoc: doc });
  }
  return out;
}
