import React from 'react';

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  tone?: 'success' | 'error' | 'info';
  persist?: boolean;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void | Promise<void>;
  };
}

const TONE_STYLES: Record<NonNullable<ToastItem['tone']>, { accent: string; icon: React.ReactNode; chip: string; }> = {
  success: {
    accent: 'from-emerald-500/20 via-emerald-500/5 to-transparent border-emerald-300/60',
    chip: 'bg-emerald-500/10 text-emerald-700 border-emerald-200/70',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
  error: {
    accent: 'from-rose-500/20 via-rose-500/5 to-transparent border-rose-300/70',
    chip: 'bg-rose-500/10 text-rose-700 border-rose-200/70',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v4m0 4h.01M10.29 3.86l-8.24 14.28A1 1 0 003.17 20h16.66a1 1 0 00.87-1.5L12.46 3.86a1 1 0 00-1.73 0z" />
      </svg>
    ),
  },
  info: {
    accent: 'from-sky-500/20 via-sky-500/5 to-transparent border-sky-300/70',
    chip: 'bg-sky-500/10 text-sky-700 border-sky-200/70',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
};

interface ToastViewportProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export const ToastViewport: React.FC<ToastViewportProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) {
    return null;
  }

  const openExternal = (href: string) => {
    if (typeof window === 'undefined') return;
    if (href.startsWith('/')) {
      window.location.assign(href);
      return;
    }
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="pointer-events-none fixed right-5 top-5 z-[400] flex w-full max-w-sm flex-col gap-3">
      {toasts.map((toast) => {
        const tone = toast.tone ?? 'info';
        const styles = TONE_STYLES[tone];

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto relative overflow-hidden rounded-2xl border bg-white/92 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.16)] backdrop-blur-xl animate-in slide-in-from-right-5 fade-in duration-300 ${styles.accent}`}
          >
            <div className="absolute inset-0 bg-gradient-to-br opacity-90" />
            <div className="relative flex items-start gap-3">
              <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${styles.chip}`}>
                {styles.icon}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold tracking-tight text-zinc-900">{toast.title}</p>
                {toast.description ? (
                  <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-zinc-600">
                    {toast.description}
                  </p>
                ) : null}
                {toast.action?.label && (toast.action?.href || toast.action?.onClick) ? (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (toast.action?.onClick) {
                          void toast.action.onClick();
                          return;
                        }

                        if (toast.action?.href) {
                          openExternal(toast.action.href);
                        }
                      }}
                      className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white/80 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-700 shadow-sm transition-colors hover:bg-white hover:text-zinc-900"
                    >
                      {toast.action.label}
                    </button>
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                className="rounded-xl p-1.5 text-zinc-400 transition-colors hover:bg-zinc-900/5 hover:text-zinc-700"
                title="Dismiss"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
