export interface Supplier {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

/** Suggested names when the user adds their first suppliers. */
export const SUGGESTED_SUPPLIER_NAMES = [
  'Temu',
  'Amazon',
  'Warehouse',
  '925express',
  'Etsy',
] as const;

export const DEMO_SUPPLIERS: Supplier[] = SUGGESTED_SUPPLIER_NAMES.map((name, i) => ({
  id: `supplier-demo-${i}`,
  name,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}));
