import { randomBytes } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import {
  FieldValue,
  getFirestore,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import {
  buildAuthorizeUrl,
  exchangeAuthorizationCode,
  fetchAllPaidReceipts,
  fetchListingImageUrl,
  fetchPrimaryShop,
  mapReceiptToOrderFields,
  refreshAccessToken,
  userIdFromAccessToken,
} from './etsy/api';
import {
  statusesFromShipmentsByOrder,
  type ShipmentsByOrderResponse,
} from './etsy/missionControl';
import { createCodeChallenge, createCodeVerifier, createOAuthState } from './etsy/pkce';

// Gen2 can load modules more than once — always bind a default app.
const adminApp = getApps()[0] ?? initializeApp();

const etsyKeystring = defineSecret('ETSY_KEYSTRING');
const etsySharedSecret = defineSecret('ETSY_SHARED_SECRET');
const webappOrigin = defineString('WEBAPP_ORIGIN', {
  default: 'https://engrsyednaqvi.github.io/tracking-hub-webapp',
});

const REDIRECT_URI =
  'https://us-central1-tracking-hub-webapp-29401.cloudfunctions.net/etsyOAuthCallback';

function db() {
  return getFirestore(adminApp);
}

function createId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}

/** Start Etsy OAuth — returns authorize URL for the browser. */
export const etsyOAuthStart = onCall(
  { secrets: [etsyKeystring, etsySharedSecret], cors: true },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in first.');
    }

    const keystring = etsyKeystring.value();
    const codeVerifier = createCodeVerifier();
    const codeChallenge = createCodeChallenge(codeVerifier);
    const state = createOAuthState();

    await db()
      .collection('oauthSessions')
      .doc(state)
      .set({
        uid: request.auth.uid,
        codeVerifier,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: Date.now() + 10 * 60 * 1000,
      });

    const authUrl = buildAuthorizeUrl({
      keystring,
      redirectUri: REDIRECT_URI,
      state,
      codeChallenge,
    });

    return { authUrl, redirectUri: REDIRECT_URI };
  },
);

/** Etsy redirects here after consent. */
export const etsyOAuthCallback = onRequest(
  { secrets: [etsyKeystring, etsySharedSecret], cors: false },
  async (req, res) => {
    const origin = webappOrigin.value().replace(/\/$/, '');
    const fail = (message: string) => {
      res.redirect(`${origin}/shops?etsy=error&message=${encodeURIComponent(message)}`);
    };

    try {
      const code = String(req.query.code ?? '');
      const state = String(req.query.state ?? '');
      const error = String(req.query.error ?? '');
      if (error) {
        fail(String(req.query.error_description || error));
        return;
      }
      if (!code || !state) {
        fail('Missing OAuth code or state.');
        return;
      }

      const sessionRef = db().collection('oauthSessions').doc(state);
      const sessionSnap = await sessionRef.get();
      if (!sessionSnap.exists) {
        fail('OAuth session expired. Start Connect again.');
        return;
      }
      const session = sessionSnap.data() as {
        uid: string;
        codeVerifier: string;
        expiresAt: number;
      };
      await sessionRef.delete();
      if (session.expiresAt < Date.now()) {
        fail('OAuth session expired. Start Connect again.');
        return;
      }

      const keystring = etsyKeystring.value();
      const sharedSecret = etsySharedSecret.value();
      const token = await exchangeAuthorizationCode({
        keystring,
        sharedSecret,
        code,
        codeVerifier: session.codeVerifier,
        redirectUri: REDIRECT_URI,
      });

      const etsyUserId = userIdFromAccessToken(token.access_token);
      const shop = await fetchPrimaryShop({
        keystring,
        sharedSecret,
        accessToken: token.access_token,
        userId: etsyUserId,
      });

      const now = new Date().toISOString();
      const expiresAt = Date.now() + Math.max(60, token.expires_in - 60) * 1000;
      const shopsCol = db().collection('users').doc(session.uid).collection('shops');
      const existing = await shopsCol.where('etsyShopId', '==', String(shop.shopId)).limit(1).get();

      let shopDocId: string;
      if (!existing.empty) {
        shopDocId = existing.docs[0]!.id;
        await shopsCol.doc(shopDocId).set(
          {
            name: shop.shopName,
            platform: 'etsy',
            connected: true,
            etsyShopId: String(shop.shopId),
            etsyUserId: shop.userId ?? etsyUserId,
            updatedAt: now,
          },
          { merge: true },
        );
      } else {
        shopDocId = createId('shop');
        await shopsCol.doc(shopDocId).set({
          id: shopDocId,
          name: shop.shopName,
          platform: 'etsy',
          connected: true,
          etsyShopId: String(shop.shopId),
          etsyUserId: shop.userId ?? etsyUserId,
          createdAt: now,
          updatedAt: now,
        });
      }

      await db()
        .collection('users')
        .doc(session.uid)
        .collection('etsyCredentials')
        .doc(shopDocId)
        .set({
          shopDocId,
          etsyShopId: shop.shopId,
          accessToken: token.access_token,
          refreshToken: token.refresh_token,
          expiresAt,
          etsyUserId: shop.userId ?? etsyUserId,
          updatedAt: now,
        });

      res.redirect(
        `${origin}/shops?etsy=connected&shop=${encodeURIComponent(shop.shopName)}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Etsy connect failed';
      fail(message);
    }
  },
);

async function ensureAccessToken(
  uid: string,
  shopDocId: string,
  keystring: string,
  sharedSecret: string,
): Promise<{ accessToken: string; etsyShopId: number }> {
  const credRef = db()
    .collection('users')
    .doc(uid)
    .collection('etsyCredentials')
    .doc(shopDocId);
  const snap = await credRef.get();
  if (!snap.exists) {
    throw new HttpsError('failed-precondition', 'Shop is not connected to Etsy.');
  }
  const cred = snap.data() as {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    etsyShopId: number;
  };

  if (cred.accessToken && cred.expiresAt > Date.now() + 60_000) {
    return { accessToken: cred.accessToken, etsyShopId: Number(cred.etsyShopId) };
  }

  const token = await refreshAccessToken({
    keystring,
    sharedSecret,
    refreshToken: cred.refreshToken,
  });
  const expiresAt = Date.now() + Math.max(60, token.expires_in - 60) * 1000;
  await credRef.set(
    {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
  return { accessToken: token.access_token, etsyShopId: Number(cred.etsyShopId) };
}

/** Sync paid receipts for one shop (or all connected shops). */
export const etsySync = onCall(
  { secrets: [etsyKeystring, etsySharedSecret], cors: true, timeoutSeconds: 300 },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in first.');
    }
    const uid = request.auth.uid;
    const shopId = typeof request.data?.shopId === 'string' ? request.data.shopId : null;
    const syncDays = Math.min(
      365,
      Math.max(1, Number(request.data?.syncDays ?? 30) || 30),
    );
    const keystring = etsyKeystring.value();
    const sharedSecret = etsySharedSecret.value();

    const shopsCol = db().collection('users').doc(uid).collection('shops');
    let shopDocs: QueryDocumentSnapshot[];
    if (shopId) {
      const one = await shopsCol.doc(shopId).get();
      if (!one.exists) throw new HttpsError('not-found', 'Shop not found.');
      shopDocs = [one as QueryDocumentSnapshot];
    } else {
      const all = await shopsCol.where('connected', '==', true).get();
      shopDocs = all.docs;
    }

    if (!shopDocs.length) {
      throw new HttpsError('failed-precondition', 'No connected Etsy shops to sync.');
    }

    const minCreated = Math.floor(Date.now() / 1000) - syncDays * 24 * 60 * 60;
    const ordersCol = db().collection('users').doc(uid).collection('orders');
    let created = 0;
    let updated = 0;

    for (const shopDoc of shopDocs) {
      const { accessToken, etsyShopId } = await ensureAccessToken(
        uid,
        shopDoc.id,
        keystring,
        sharedSecret,
      );
      const receipts = await fetchAllPaidReceipts(
        {
          keystring,
          sharedSecret,
          accessToken,
          shopId: etsyShopId,
        },
        minCreated,
      );

      const imageCache = new Map<number, string | null>();

      for (const receipt of receipts) {
        const fields = mapReceiptToOrderFields(receipt);
        if (!fields.etsyReceiptId) continue;

        let imageUrl: string | null = null;
        if (fields.listingId) {
          if (!imageCache.has(fields.listingId)) {
            imageCache.set(
              fields.listingId,
              await fetchListingImageUrl(
                { keystring, sharedSecret, accessToken },
                fields.listingId,
              ),
            );
          }
          imageUrl = imageCache.get(fields.listingId) ?? null;
        }

        const existing = await ordersCol
          .where('etsyReceiptId', '==', fields.etsyReceiptId)
          .limit(1)
          .get();

        const now = new Date().toISOString();
        if (!existing.empty) {
          const docId = existing.docs[0]!.id;
          const prev = existing.docs[0]!;
          const prevStatus = String(prev.get('status') ?? '');
          // Open API cannot see Pre-transit vs In transit — keep Mission Control
          // enrichment when the receipt is still in that ambiguous bucket.
          const status =
            fields.needsMissionControl &&
            (prevStatus === 'pre_transit' || prevStatus === 'in_transit')
              ? prevStatus
              : fields.status;
          const etsyStatusRaw =
            status !== fields.status
              ? `${fields.etsyStatusRaw} | preserved:${status}`
              : fields.etsyStatusRaw;
          await ordersCol.doc(docId).set(
            {
              etsyOrderNumber: fields.etsyOrderNumber,
              customerName: fields.customerName,
              product: fields.product,
              status,
              etsyStatusRaw,
              needsMissionControl: fields.needsMissionControl,
              trackingNumber: fields.trackingNumber || prev.get('trackingNumber') || '',
              carrier: fields.carrier || prev.get('carrier') || '',
              ...(imageUrl && !prev.get('imageUrl') ? { imageUrl } : {}),
              updatedAt: now,
            },
            { merge: true },
          );
          updated += 1;
        } else {
          const id = createId('ord');
          await ordersCol.doc(id).set({
            id,
            shopId: shopDoc.id,
            etsyOrderNumber: fields.etsyOrderNumber,
            etsyReceiptId: fields.etsyReceiptId,
            customerName: fields.customerName,
            product: fields.product,
            imageUrl: imageUrl ?? '',
            status: fields.status,
            etsyStatusRaw: fields.etsyStatusRaw,
            needsMissionControl: fields.needsMissionControl,
            supplierName: '',
            supplierOrderNumber: '',
            trackingNumber: fields.trackingNumber,
            carrier: fields.carrier,
            createdAt: fields.createdAt,
            updatedAt: now,
          });
          created += 1;
        }
      }

      await shopDoc.ref.set(
        { lastSyncAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { merge: true },
      );
    }

    return { created, updated, shops: shopDocs.length, syncDays };
  },
);

/**
 * Apply Mission Control /shipments/by-order JSON (majorTrackingState) onto orders.
 * Paste the Network response from Etsy seller hub — OAuth cannot call that endpoint.
 */
export const etsyApplyShipmentsByOrder = onCall({ cors: true }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in first.');
  }
  const uid = request.auth.uid;
  const payload = request.data?.payload as ShipmentsByOrderResponse | undefined;
  if (!payload || typeof payload !== 'object') {
    throw new HttpsError(
      'invalid-argument',
      'Send { payload } from Etsy /shipments/by-order JSON.',
    );
  }

  const mapped = statusesFromShipmentsByOrder(payload);
  if (!mapped.size) {
    throw new HttpsError(
      'invalid-argument',
      'No order tracking statuses found in that payload.',
    );
  }

  const ordersCol = db().collection('users').doc(uid).collection('orders');
  let updated = 0;
  const now = new Date().toISOString();

  for (const [receiptId, info] of mapped) {
    const existing = await ordersCol.where('etsyReceiptId', '==', receiptId).limit(1).get();
    if (existing.empty) continue;
    const doc = existing.docs[0]!;
    await doc.ref.set(
      {
        status: info.status,
        etsyStatusRaw: `mission_control | ${info.raw}`,
        needsMissionControl: false,
        ...(info.trackingNumber ? { trackingNumber: info.trackingNumber } : {}),
        ...(info.carrier ? { carrier: info.carrier } : {}),
        ...(info.shippingLabelId ? { etsyShippingLabelId: info.shippingLabelId } : {}),
        ...(info.shipmentId ? { etsyShipmentId: info.shipmentId } : {}),
        updatedAt: now,
      },
      { merge: true },
    );
    updated += 1;
  }

  return { updated, matched: mapped.size };
});
