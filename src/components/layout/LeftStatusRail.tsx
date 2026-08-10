import { AlertTriangle, Info, Link2, RefreshCw, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useAppErrors } from '@/context/ErrorContext';
import { useShops } from '@/context/ShopContext';
import { useEtsyConnect } from '@/hooks/useEtsyConnect';
import { cn } from '@/lib/cn';

/** Fixed left rail: Reconnect / Sync + all status/error text. */
export function LeftStatusRail() {
  const { demoMode } = useAuth();
  const { notices, dismissNotice, clearErrors } = useAppErrors();
  const { shops, syncing, syncAll } = useShops();
  const { connectEtsy, connecting } = useEtsyConnect();

  const needsReconnect = shops.filter(
    (s) => s.reconnectRequired || (!s.connected && s.etsyShopId),
  );
  const hasConnected = shops.some((s) => s.connected && !s.reconnectRequired);

  return (
    <aside
      className="fixed left-3 top-16 z-50 flex w-[min(22rem,calc(100vw-1.5rem))] flex-col gap-2"
      aria-live="polite"
    >
      {needsReconnect.length ? (
        <button
          type="button"
          disabled={demoMode || connecting}
          onClick={() => void connectEtsy()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-700 px-3 py-2.5 text-sm font-medium text-white shadow-lg disabled:opacity-50"
        >
          <Link2 className="h-4 w-4" />
          {connecting ? 'Redirecting to Etsy…' : 'Reconnect Etsy (login)'}
        </button>
      ) : null}

      <button
        type="button"
        disabled={demoMode || syncing || connecting || !hasConnected}
        onClick={() => void syncAll()}
        title={
          hasConnected
            ? 'Sync connected shops (every 30 min while this tab is open)'
            : needsReconnect.length
              ? 'Reconnect Etsy first — Sync is disabled until tokens are valid'
              : 'Connect an Etsy shop first'
        }
        className={cn(
          'inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium shadow-lg',
          'bg-brand text-white disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin')} />
        {syncing ? 'Syncing…' : 'Sync orders'}
      </button>
      <p className="px-1 text-[11px] text-slate-500">
        {needsReconnect.length
          ? `Reconnect required for: ${needsReconnect.map((s) => s.name).join(', ')}`
          : 'Auto-sync every 30 min while tab is open'}
      </p>

      {notices.length ? (
        <>
          <div className="flex items-center justify-between rounded-t-xl bg-slate-800 px-3 py-1.5 text-xs font-medium text-white">
            <span>Status ({notices.length})</span>
            <button
              type="button"
              onClick={clearErrors}
              className="rounded px-1.5 py-0.5 hover:bg-slate-700"
            >
              Clear
            </button>
          </div>
          <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
            {notices.map((entry) => {
              const isError = entry.kind === 'error';
              return (
                <li
                  key={entry.id}
                  className={cn(
                    'rounded-xl border bg-white/95 p-3 shadow-lg backdrop-blur',
                    isError ? 'border-rose-200' : 'border-teal-200',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={cn(
                        'inline-flex items-center gap-1.5 text-sm font-semibold',
                        isError ? 'text-rose-900' : 'text-teal-900',
                      )}
                    >
                      {isError ? (
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <Info className="h-3.5 w-3.5 shrink-0" />
                      )}
                      {entry.title}
                    </p>
                    <button
                      type="button"
                      title="Dismiss"
                      onClick={() => dismissNotice(entry.id)}
                      className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {new Date(entry.at).toLocaleString()}
                  </p>
                  <pre
                    className={cn(
                      'mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg px-2 py-1.5 text-[11px] leading-relaxed',
                      isError ? 'bg-rose-50 text-rose-950' : 'bg-teal-50 text-teal-950',
                    )}
                  >
                    {entry.detail}
                  </pre>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </aside>
  );
}
