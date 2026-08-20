import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDb } from '@/lib/firebase';
import type { Supplier } from '@/types';
import { createId } from '@/utils/id';

function suppliersCol(uid: string) {
  return collection(getDb(), 'users', uid, 'suppliers');
}

export function subscribeSuppliers(
  uid: string,
  onChange: (suppliers: Supplier[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(suppliersCol(uid), orderBy('createdAt', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      const suppliers = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Supplier, 'id'>),
      }));
      onChange(suppliers);
    },
    (err) => onError?.(err),
  );
}

export async function createSupplier(
  uid: string,
  input: { name: string },
): Promise<Supplier> {
  const now = new Date().toISOString();
  const name = input.name.trim();
  if (!name) throw new Error('Supplier name is required');

  const supplier: Supplier = {
    id: createId('sup'),
    name,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(doc(suppliersCol(uid), supplier.id), supplier);
  return supplier;
}
