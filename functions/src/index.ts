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
  fetchAllShopsForUser,
  fetchListingImageUrl,
  mapReceiptToOrderFields,
  refreshAccessToken,
  userIdFromAccessToken,
  type EtsyShippingStatus,
} from './etsy/api';
import {
  statusesFromShipmentsByOrder,
  type ShipmentsByOrderResponse,
} from './etsy/missionControl';
import { createCodeChallenge, createCodeVerifier, createOAuthState } from './etsy/pkce';
import { errorMessage, rethrowAsHttpsError } from './errors';
import { fetchUspsTrackingStatus } from './usps/tracking';

// Gen2 can load modules more than once — always bind a default app.
const adminApp = getApps()[0] ?? initializeApp();

const etsyKeystring = defineSecret('ETSY_KEYSTRING');
const etsySharedSecret = defineSecret('ETSY_SHARED_SECRET');
const uspsConsumerKey = defineSecret('USPS_CONSUMER_KEY');
const uspsConsumerSecret = defineSecret('USPS_CONSUMER_SECRET');
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

    const keystring = etsyKeystring.value().trim();
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

      const keystring = etsyKeystring.value().trim();
      const sharedSecret = etsySharedSecret.value().trim();
      const token = await exchangeAuthorizationCode({
        keystring,
        sharedSecret,
        code,
        codeVerifier: session.codeVerifier,
        redirectUri: REDIRECT_URI,
      });

      const etsyUserId = userIdFromAccessToken(token.access_token);
      const shops = await fetchAllShopsForUser({
        keystring,
        sharedSecret,
        accessToken: token.access_token,
        userId: etsyUserId,
      });

      const now = new Date().toISOString();
      const expiresAt = Date.now() + Math.max(60, token.expires_in - 60) * 1000;
      const shopsCol = db().collection('users').doc(session.uid).collection('shops');
      const connectedNames: string[] = [];

      for (const shop of shops) {
        const existing = await shopsCol
          .where('etsyShopId', '==', String(shop.shopId))
          .limit(1)
          .get();

        let shopDocId: string;
        if (!existing.empty) {
          shopDocId = existing.docs[0]!.id;
          await shopsCol.doc(shopDocId).set(
            {
              name: shop.shopName,
              platform: 'etsy',
              connected: true,
              reconnectRequired: false,
              reconnectReason: FieldValue.delete(),
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
            reconnectRequired: false,
            etsyShopId: String(shop.shopId),
            etsyUserId: shop.userId ?? etsyUserId,
            createdAt: now,
            updatedAt: now,
          });
        }

        // Same OAuth token can authorize every shop on this Etsy account.
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
            /** Bound to current Firebase ETSY_KEYSTRING — refresh fails if app keys change. */
            etsyClientId: keystring,
            updatedAt: now,
          });

        connectedNames.push(shop.shopName);
      }

      const label =
        connectedNames.length === 1
          ? connectedNames[0]!
          : `${connectedNames.length} shops (${connectedNames.join(', ')})`;

      res.redirect(
        `${origin}/shops?etsy=connected&shop=${encodeURIComponent(label)}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Etsy connect failed';
      fail(message);
    }
  },
);

async function markShopNeedsReconnect(
  uid: string,
  shopDocId: string,
  reason: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db().collection('users').doc(uid).collection('shops').doc(shopDocId).set(
    {
      connected: false,
      reconnectRequired: true,
      reconnectReason: reason.slice(0, 400),
      updatedAt: now,
    },
    { merge: true },
  );
  await db()
    .collection('users')
    .doc(uid)
    .collection('etsyCredentials')
    .doc(shopDocId)
    .set(
      {
        accessToken: '',
        refreshToken: '',
        expiresAt: 0,
        updatedAt: now,
      },
      { merge: true },
    );
}

function isInvalidEtsyGrant(err: unknown): boolean {
  const msg = errorMessage(err).toLowerCase();
  return (
    msg.includes('invalid_grant') ||
    msg.includes('client_id is invalid') ||
    msg.includes('invalid_client')
  );
}

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
    etsyClientId?: string;
  };

  // Tokens are bound to the Etsy app (keystring) that issued them.
  if (cred.etsyClientId && cred.etsyClientId !== keystring) {
    const reason =
      'Etsy API app key changed. Reconnect this shop with Connect Etsy so tokens match the new app.';
    await markShopNeedsReconnect(uid, shopDocId, reason);
    throw new HttpsError('failed-precondition', reason);
  }

  if (cred.accessToken && cred.expiresAt > Date.now() + 60_000) {
    return { accessToken: cred.accessToken, etsyShopId: Number(cred.etsyShopId) };
  }

  if (!cred.refreshToken) {
    const reason = 'Etsy refresh token missing — reconnect this shop (Connect Etsy).';
    await markShopNeedsReconnect(uid, shopDocId, reason);
    throw new HttpsError('failed-precondition', reason);
  }

  let token: Awaited<ReturnType<typeof refreshAccessToken>>;
  try {
    token = await refreshAccessToken({
      keystring,
      sharedSecret,
      refreshToken: cred.refreshToken,
    });
  } catch (err) {
    const detail = errorMessage(err);
    const reason = isInvalidEtsyGrant(err)
      ? `Etsy rejected this shop’s tokens (usually after changing the Etsy developer app). Reconnect via Connect Etsy. ${detail}`
      : `Etsy token refresh failed — reconnect this shop. ${detail}`;
    await markShopNeedsReconnect(uid, shopDocId, reason);
    throw new HttpsError('failed-precondition', reason);
  }

  const expiresAt = Date.now() + Math.max(60, token.expires_in - 60) * 1000;
  await credRef.set(
    {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt,
      etsyClientId: keystring,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
  return { accessToken: token.access_token, etsyShopId: Number(cred.etsyShopId) };
}

/** Sync paid receipts for one shop (or all connected shops). */
export const etsySync = onCall(
  {
    secrets: [etsyKeystring, etsySharedSecret, uspsConsumerKey, uspsConsumerSecret],
    cors: true,
    timeoutSeconds: 300,
  },
  async (request) => {
    try {
      if (!request.auth?.uid) {
        throw new HttpsError('unauthenticated', 'Sign in first.');
      }
      const uid = request.auth.uid;
      const shopId = typeof request.data?.shopId === 'string' ? request.data.shopId : null;
      const syncDays = Math.min(
        365,
        Math.max(1, Number(request.data?.syncDays ?? 30) || 30),
      );
      const keystring = etsyKeystring.value().trim();
      const sharedSecret = etsySharedSecret.value().trim();
      const uspsCreds = {
        consumerKey: uspsConsumerKey.value().trim(),
        consumerSecret: uspsConsumerSecret.value().trim(),
      };

      if (!keystring || !sharedSecret) {
        throw new HttpsError(
          'failed-precondition',
          'Etsy API secrets are missing on the server.',
        );
      }

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

      // Never sync shops waiting for a fresh OAuth (stale tokens after app key change).
      shopDocs = shopDocs.filter((doc) => doc.get('reconnectRequired') !== true);

      if (!shopDocs.length) {
        throw new HttpsError(
          'failed-precondition',
          'No connected Etsy shops to sync. If a shop says reconnect, use Reconnect Etsy (login) first — Sync cannot fix invalid tokens.',
        );
      }

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
          const { accessToken, etsyShopId } = await ensureAccessToken(
            uid,
            shopDoc.id,
            keystring,
            sharedSecret,
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
              throw new HttpsError('failed-precondition', reason);
            }
            throw err;
          }

          const imageCache = new Map<number, string | null>();
          const uspsCache = new Map<string, Awaited<ReturnType<typeof fetchUspsTrackingStatus>>>();

          for (const receipt of receipts) {
            const fields = mapReceiptToOrderFields(receipt);
            if (!fields.etsyReceiptId) continue;

            let status: EtsyShippingStatus = fields.status;
            let etsyStatusRaw = fields.etsyStatusRaw;

            // Refine Pre-transit / In transit / Delivered via USPS when possible.
            if (
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
                  // Gentle pacing for USPS ~60/hour default quota.
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
              await ordersCol.doc(docId).set(
                {
                  etsyOrderNumber: fields.etsyOrderNumber,
                  customerName: fields.customerName,
                  product: fields.product,
                  status,
                  etsyStatusRaw,
                  trackingNumber: fields.trackingNumber || prev.get('trackingNumber') || '',
                  carrier: fields.carrier || prev.get('carrier') || '',
                  ...(fields.dispatchedAt ? { dispatchedAt: fields.dispatchedAt } : {}),
                  ...(fields.shipByAt ? { shipByAt: fields.shipByAt } : {}),
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
                status,
                etsyStatusRaw,
                supplierName: '',
                supplierOrderNumber: '',
                trackingNumber: fields.trackingNumber,
                carrier: fields.carrier,
                ...(fields.dispatchedAt ? { dispatchedAt: fields.dispatchedAt } : {}),
                ...(fields.shipByAt ? { shipByAt: fields.shipByAt } : {}),
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
        } catch (err) {
          const msg = errorMessage(err);
          console.error(`[etsySync] shop ${shopLabel}:`, msg);
          shopErrors.push(`${shopLabel}: ${msg}`);
        }
      }

      if (shopErrors.length && created === 0 && updated === 0) {
        throw new HttpsError('failed-precondition', shopErrors.join('\n'), {
          shopErrors,
          fullMessage: shopErrors.join('\n'),
        });
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
    } catch (err) {
      rethrowAsHttpsError(err, 'Etsy sync failed');
    }
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
