import { ChevronDown } from 'lucide-react';
import { useShops } from '@/context/ShopContext';

export function ShopSwitcher() {
  const { shops, activeShopId, setActiveShopId } = useShops();

  return (
    <label className="inline-flex min-w-[12rem] flex-col gap-1">
      <span className="text-xs font-medium text-slate-500">Viewing shop</span>
      <div className="relative">
        <select
          value={activeShopId}
          onChange={(e) => setActiveShopId(e.target.value)}
          className="w-full appearance-none rounded-xl border border-surface-line bg-white py-2.5 pl-3 pr-9 text-sm font-medium text-slate-800 shadow-sm outline-none ring-brand/30 focus:ring-2"
        >
          <option value="all">All shops</option>
          {shops.map((shop) => (
            <option key={shop.id} value={shop.id}>
              {shop.name}
              {shop.connected ? '' : ' (not connected)'}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      </div>
    </label>
  );
}
