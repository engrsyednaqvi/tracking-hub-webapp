import { useState } from 'react';
import { AlertTriangle, Info, Link2, RefreshCw, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useAppErrors } from '@/context/ErrorContext';
import { useShops } from '@/context/ShopContext';
import { useEtsyConnect } from '@/hooks/useEtsyConnect';
import { cn } from '@/lib/cn';

/** Fixed left rail: per-shop Connect keys, Sync, status. */
export function LeftStatusRail() {
  const { demoMode } = useAuth();
  const { notices, dismissNotice, clearErrors, etsyAuthUrl, setEtsyAuthUrl } = useAppErrors();
  const { shops, syncing, syncAll } = useShops();
  const { connectEtsy, connecting } = useEtsyConnect();
  const [keystring, setKeystring] = useState('');
  const [sharedSecret, setSharedSecret] = useState('');

  const needsReconnect = shops.filter(
    (s) => s.reconnectRequired || (!s.connected && s.etsyShopId),
  );
  const hasConnected = shops.some((s) => s.connected && !s.reconnectRequired);

  return (
    <aside
      className="fixed left-3 top-16 z-50 flex w-[min(22rem,calc(100vw-1.5rem))] flex-col gap-2"
      aria-live="polite"
    >
      <div className="space-y-2 rounded-xl border border-surface-line bg-white/95 p-3 shadow-lg backdrop-blur">
        <p className="text-xs font-medium text-slate-700">Etsy Seller app for this connect</p>
        <input
          value={keystring}
          onChange={(e) => setKeystring(e.target.value)}
          placeholder="Keystring"
          autoComplete="off"
          className="w-full rounded-lg border border-surface-line px-2 py-1.5 text-xs"
        />
        <input
          value={sharedSecret}
          onChange={(e) => setSharedSecret(e.target.value)}
          placeholder="Shared secret"
          autoComplete="off"
          type="password"
          className="w-full rounded-lg border border-surface-line px-2 py-1.5 text-xs"
        />
        <button
          type="button"
          disabled={demoMode || connecting}
          onClick={() =>
            void connectEtsy({
              keystring,
              sharedSecret,
            })
          }
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          <Link2 className="h-4 w-4" />
          {connecting ? 'Opening Etsy…' : 'Connect with these keys'}
        </button>
        {needsReconnect.length ? (
          <div className="space-y-1 border-t border-surface-line pt-2">
            <p className="text-[11px] text-slate-500">
              Reconnect with saved keys (no paste needed if keys were stored before):
            </p>
            {needsReconnect.map((shop) => (
              <button
                key={shop.id}
                type="button"
                disabled={demoMode || connecting}
                onClick={() => void connectEtsy({ shopId: shop.id, keystring, sharedSecret })}
                className="block w-full rounded-lg bg-rose-50 px-2 py-1.5 text-left text-xs font-medium text-rose-800 hover:bg-rose-100 disabled:opacity-50"
              >
                Reconnect {shop.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {etsyAuthUrl ? (
        <a
          href={etsyAuthUrl}
          target="_blank"
          rel="noreferrer"
          onClick={() => setEtsyAuthUrl(null)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-teal-300 bg-teal-50 px-3 py-2.5 text-sm font-medium text-teal-900 shadow-lg hover:bg-teal-100"
        >
          Open Etsy login ↗
        </a>
      ) : null}

      <button
        type="button"
        disabled={demoMode || syncing || connecting || !hasConnected}
        onClick={() => void syncAll()}
        className={cn(
          'inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium shadow-lg',
          'bg-brand text-white disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin')} />
        {syncing ? 'Syncing…' : 'Sync orders'}
      </button>
      <p className="px-1 text-[11px] text-slate-500">
        Each shop uses its own Seller app. Auto-sync every 30 min when connected.
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
          <ul className="max-h-[45vh] space-y-2 overflow-y-auto">
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
                      'mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg px-2 py-1.5 text-[11px] leading-relaxed',
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
