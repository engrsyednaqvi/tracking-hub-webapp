import { RefreshCw } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useShops } from '@/context/ShopContext';
import { cn } from '@/lib/cn';

/** Header Sync control — available on every page. */
export function GlobalSyncButton() {
  const { demoMode } = useAuth();
  const { shops, syncing, syncAll, syncMessage } = useShops();
  const hasConnected = shops.some((s) => s.connected && !s.reconnectRequired);

  return (
    <div className="flex flex-col items-stretch gap-1 sm:items-end">
      <button
        type="button"
        disabled={demoMode || syncing || !hasConnected}
        onClick={() => void syncAll()}
        title="Sync all connected shops (also auto-runs every 30 minutes while this tab is open)"
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium',
          'bg-brand text-white disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin')} />
        {syncing ? 'Syncing…' : 'Sync orders'}
      </button>
      <p className="max-w-[16rem] text-right text-[11px] leading-snug text-slate-500 line-clamp-2">
        {syncMessage || 'Auto-sync every 30 min while tab is open'}
      </p>
    </div>
  );
}
