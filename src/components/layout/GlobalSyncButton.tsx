import { RefreshCw } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useShops } from '@/context/ShopContext';
import { cn } from '@/lib/cn';
import { formatOrderDateTime } from '@/utils/date';

/** Header Sync control — available on every page. */
export function GlobalSyncButton() {
  const { demoMode } = useAuth();
  const { shops, syncing, syncAll, syncMessage, lastSyncedAt } = useShops();
  const hasConnected = shops.some((s) => s.connected && !s.reconnectRequired);

  const primaryStatus = lastSyncedAt
    ? `Last sync: ${formatOrderDateTime(lastSyncedAt)}`
    : syncMessage || 'Never synced';

  const secondaryStatus = lastSyncedAt
    ? syncMessage || 'Auto-sync every 30 min while tab is open'
    : null;

  return (
    <div className="flex min-w-0 flex-col items-stretch gap-1 sm:items-end">
      <button
        type="button"
        disabled={demoMode || syncing || !hasConnected}
        onClick={() => void syncAll()}
        title="Sync all connected shops (also auto-runs every 30 minutes while this tab is open)"
        className={cn(
          'inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium sm:w-auto',
          'bg-brand text-white disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <RefreshCw className={cn('h-4 w-4 shrink-0', syncing && 'animate-spin')} />
        {syncing ? 'Syncing…' : 'Sync orders'}
      </button>
      <div className="max-w-[16rem] space-y-0.5 text-left text-[11px] leading-snug text-slate-500 sm:text-right">
        <p>{primaryStatus}</p>
        {secondaryStatus ? (
          <p className={cn('line-clamp-2', !syncMessage && 'text-slate-400')}>{secondaryStatus}</p>
        ) : null}
      </div>
    </div>
  );
}
