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
import type { Order, OrderStatus } from '@/types';
import { createId } from '@/utils/id';

function ordersCol(uid: string) {
  return collection(getDb(), 'users', uid, 'orders');
}

export function subscribeOrders(
  uid: string,
  onChange: (orders: Order[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(ordersCol(uid), orderBy('updatedAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const orders = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Order, 'id'>) }));
      onChange(orders);
    },
    (err) => onError?.(err),
  );
}

export async function createOrder(
  uid: string,
  input: {
    shopId: string;
    etsyOrderNumber: string;
    customerName?: string;
    product?: string;
    supplierName?: string;
    supplierOrderNumber?: string;
    trackingNumber?: string;
    carrier?: string;
    status?: OrderStatus;
  },
): Promise<Order> {
  const now = new Date().toISOString();
  const order: Order = {
    id: createId('ord'),
    shopId: input.shopId,
    etsyOrderNumber: input.etsyOrderNumber.trim(),
    customerName: (input.customerName ?? '').trim(),
    product: (input.product ?? '').trim(),
    status: input.status ?? 'no_tracking',
    supplierName: (input.supplierName ?? '').trim(),
    supplierOrderNumber: (input.supplierOrderNumber ?? '').trim(),
    trackingNumber: (input.trackingNumber ?? '').trim(),
    carrier: (input.carrier ?? '').trim(),
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(doc(ordersCol(uid), order.id), order);
  return order;
}

export async function deleteOrder(uid: string, orderId: string): Promise<void> {
  await deleteDoc(doc(ordersCol(uid), orderId));
}
