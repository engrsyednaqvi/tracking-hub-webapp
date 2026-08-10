import { RefreshCw } from 'lucide-react';
import { useShops } from '@/context/ShopContext';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/cn';

export function GlobalSyncButton() {
  const { demoMode } = useAuth();
  const { shops, syncing, syncAll, syncMessage } = useShops();
  const hasConnected = shops.some((s) => s.connected);

  return (
    <div className="flex flex-col items-stretch gap-1 sm:items-end">
      <button
        type="button"
        disabled={demoMode || syncing || !hasConnected}
        onClick={() => void syncAll()}
        title={
          hasConnected
            ? 'Sync all connected Etsy shops (also auto-runs every 30 minutes while this tab is open)'
            : 'Connect an Etsy shop first'
        }
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium',
          'bg-brand text-white disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin')} />
        {syncing ? 'Syncing…' : 'Sync orders'}
      </button>
      {syncMessage ? (
        <p className="max-w-xs text-right text-[11px] leading-snug text-slate-500 line-clamp-3">
          {syncMessage}
        </p>
      ) : (
        <p className="text-[11px] text-slate-400">Auto-sync every 30 min</p>
      )}
    </div>
  );
}
