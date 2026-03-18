import React from 'react';
import type { ToastItem } from './ToastViewport';

const TONE_STYLES: Record<NonNullable<ToastItem['tone']>, { accent: string; icon: React.ReactNode; chip: string; }> = {
  success: {
    accent: 'from-emerald-500/18 via-emerald-500/6 to-transparent border-emerald-300/60',
    chip: 'bg-emerald-500/10 text-emerald-700 border-emerald-200/70',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
  error: {
    accent: 'from-rose-500/18 via-rose-500/6 to-transparent border-rose-300/70',
    chip: 'bg-rose-500/10 text-rose-700 border-rose-200/70',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v4m0 4h.01M10.29 3.86l-8.24 14.28A1 1 0 003.17 20h16.66a1 1 0 00.87-1.5L12.46 3.86a1 1 0 00-1.73 0z" />
      </svg>
    ),
  },
  info: {
    accent: 'from-sky-500/18 via-sky-500/6 to-transparent border-sky-300/70',
    chip: 'bg-sky-500/10 text-sky-700 border-sky-200/70',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
};

interface InlineToastStackProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export const InlineToastStack: React.FC<InlineToastStackProps> = ({ toasts, onDismiss }) => {
  if (!toasts.length) {
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
    <div className="mb-3 flex flex-col gap-2">
      {toasts.map((toast) => {
        const tone = toast.tone ?? 'info';
        const styles = TONE_STYLES[tone];

        return (
          <div
            key={toast.id}
            className={`relative overflow-hidden rounded-2xl border bg-[var(--card-bg)]/92 p-3 shadow-[0_18px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl animate-in slide-in-from-bottom-2 fade-in duration-200 ${styles.accent}`}
          >
            <div className="absolute inset-0 bg-gradient-to-br opacity-80" />
            <div className="relative flex items-start gap-3">
              <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${styles.chip}`}>
                {styles.icon}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold tracking-tight text-[var(--app-text)]">{toast.title}</p>
                {toast.description ? (
                  <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-[var(--app-text-muted)]">
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
                      className="inline-flex items-center justify-center rounded-xl border border-[var(--border-color)] bg-[var(--sidebar-bg)] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--app-text)] shadow-sm transition-colors hover:bg-[var(--card-hover)]"
                    >
                      {toast.action.label}
                    </button>
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                className="rounded-xl p-1.5 text-[var(--app-text-muted)] transition-colors hover:bg-zinc-900/5 hover:text-[var(--app-text)]"
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
