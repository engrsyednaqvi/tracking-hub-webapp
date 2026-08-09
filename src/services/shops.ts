import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDb } from '@/lib/firebase';
import type { Shop } from '@/types';
import { createId } from '@/utils/id';

function shopsCol(uid: string) {
  return collection(getDb(), 'users', uid, 'shops');
}

export function subscribeShops(
  uid: string,
  onChange: (shops: Shop[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(shopsCol(uid), orderBy('createdAt', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      const shops = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Shop, 'id'>) }));
      onChange(shops);
    },
    (err) => onError?.(err),
  );
}

export async function createShop(
  uid: string,
  input: { name: string },
): Promise<Shop> {
  const now = new Date().toISOString();
  const shop: Shop = {
    id: createId('shop'),
    name: input.name.trim(),
    platform: 'etsy',
    connected: false,
    etsyShopId: null,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(doc(shopsCol(uid), shop.id), shop);
  return shop;
}

export async function deleteShop(uid: string, shopId: string): Promise<void> {
  await deleteDoc(doc(shopsCol(uid), shopId));
}
