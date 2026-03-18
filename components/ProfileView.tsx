import React from 'react';
import { supabase } from '../services/supabaseClient';
import type { SubscriptionInfo, UsageStatus } from '../services/dbService';
import { normalizeTier } from '../services/modelCatalog';

export const handleLogout = async () => {
    if (confirm("Are you sure you want to log out?")) {
        await supabase.auth.signOut();
    }
};

interface ProfileViewProps {
    fullName: string | null;
    email: string | null;
    createdAt: string | null;
    tier?: string | null;
    usageStatus?: UsageStatus | null;
    subscription?: SubscriptionInfo | null;
    upgradeUrl?: string | null;
    onBack: () => void;
    onReportBug: () => void;
    onUpgrade: () => void | Promise<void>;
    onCancelSubscription: () => void | Promise<void>;
    onResumeSubscription: () => void | Promise<void>;
    billingActionPending?: boolean;
}

const formatUsd = (value: number | null | undefined) => {
    if (value == null || !Number.isFinite(value)) {
        return 'n/a';
    }

    return `$${value.toFixed(4)}`;
};

const buildUsageLine = (spend: number | null | undefined, limit: number | null | undefined) => {
    if (spend == null || !Number.isFinite(spend)) {
        return 'Usage unavailable';
    }

    if (limit == null || !Number.isFinite(limit) || limit <= 0) {
        return `${formatUsd(spend)} used`;
    }

    const percent = Math.min(100, Math.max(0, (spend / limit) * 100));
    return `${formatUsd(spend)} / ${formatUsd(limit)} (${percent.toFixed(0)}%)`;
};

const formatDisplayDate = (value: string | null | undefined) => {
    if (!value) {
        return 'n/a';
    }

    return new Date(value).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

const formatSubscriptionStatus = (status: string | null | undefined) => {
    if (!status) {
        return 'No active subscription';
    }

    return status
        .split('_')
        .filter(Boolean)
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(' ');
};

export const ProfileView: React.FC<ProfileViewProps> = ({
    fullName,
    email,
    createdAt,
    tier,
    usageStatus,
    subscription,
    upgradeUrl,
    onBack,
    onReportBug,
    onUpgrade,
    onCancelSubscription,
    onResumeSubscription,
    billingActionPending = false,
}) => {
    const normalizedTier = normalizeTier(tier || usageStatus?.plan);
    const showUsageBudgets = false;
    const cancelScheduled = Boolean(subscription?.cancelAtPeriodEnd);
    const subscriptionEndDate = subscription?.cancelAt || subscription?.currentPeriodEnd || null;

    return (
        <div className="w-full h-screen bg-[var(--app-bg)] flex items-center justify-center transition-colors duration-300">
            <div className="w-full max-w-2xl px-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <button
                    onClick={onBack}
                    className="mb-8 flex items-center gap-2 text-[var(--app-text-muted)] hover:text-[var(--app-text)] transition-colors group"
                >
                    <div className="p-2 rounded-xl group-hover:bg-[var(--card-hover)] transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </div>
                    <span className="text-sm font-bold uppercase tracking-widest">Back to Workspace</span>
                </button>

                <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[32px] p-10 space-y-10 shadow-2xl">
                    {/* Header */}
                    <div className="flex items-center gap-8">
                        <div className="h-28 w-28 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-4xl shadow-lg ring-4 ring-[var(--accent-color)]/10">
                            {fullName?.charAt(0) || 'U'}
                        </div>
                        <div>
                            <h1 className="text-4xl font-black text-[var(--app-text)] tracking-tight">{fullName || 'User'}</h1>
                            <p className="text-[var(--app-text-muted)] mt-1 font-bold uppercase tracking-[0.2em] text-xs"></p>
                        </div>
                    </div>

                    {/* Profile Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-[var(--sidebar-bg)] rounded-2xl p-6 border border-[var(--border-color)]">
                            <label className="text-[10px] font-black uppercase tracking-[2px] text-[var(--app-text-muted)] block mb-2 opacity-50">
                                Email
                            </label>
                            <p className="text-[var(--app-text)] font-semibold truncate">{email || 'No email provided'}</p>
                        </div>

                        <div className="bg-[var(--sidebar-bg)] rounded-2xl p-6 border border-[var(--border-color)]">
                            <label className="text-[10px] font-black uppercase tracking-[2px] text-[var(--app-text-muted)] block mb-2 opacity-50">
                                Current Tier
                            </label>
                            <p className="text-[var(--accent-color)] font-bold flex items-center gap-2">
                                {normalizedTier === 'PRO' ? 'Pro Access' : 'Free Access'}
                                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-color)] animate-pulse" />
                            </p>
                        </div>

                        {showUsageBudgets ? (
                            <>
                                <div className="bg-[var(--sidebar-bg)] rounded-2xl p-6 border border-[var(--border-color)]">
                                    <label className="text-[10px] font-black uppercase tracking-[2px] text-[var(--app-text-muted)] block mb-2 opacity-50">
                                        4-Hour Budget
                                    </label>
                                    <p className="text-[var(--app-text)] font-semibold">
                                        {buildUsageLine(usageStatus?.fourHourSpend, usageStatus?.fourHourLimit)}
                                    </p>
                                </div>

                                <div className="bg-[var(--sidebar-bg)] rounded-2xl p-6 border border-[var(--border-color)]">
                                    <label className="text-[10px] font-black uppercase tracking-[2px] text-[var(--app-text-muted)] block mb-2 opacity-50">
                                        Monthly Budget
                                    </label>
                                    <p className="text-[var(--app-text)] font-semibold">
                                        {buildUsageLine(usageStatus?.monthlySpend, usageStatus?.monthlyLimit)}
                                    </p>
                                </div>
                            </>
                        ) : null}

                        <div className="bg-[var(--sidebar-bg)] rounded-2xl p-6 border border-[var(--border-color)] md:col-span-2">
                            <label className="text-[10px] font-black uppercase tracking-[2px] text-[var(--app-text-muted)] block mb-2 opacity-50">
                                Date Created
                            </label>
                            <p className="text-[var(--app-text)] font-semibold">
                                {formatDisplayDate(createdAt)}
                            </p>
                        </div>

                        <div className="bg-[var(--sidebar-bg)] rounded-2xl p-6 border border-[var(--border-color)] md:col-span-2">
                            <label className="text-[10px] font-black uppercase tracking-[2px] text-[var(--app-text-muted)] block mb-2 opacity-50">
                                Subscription
                            </label>
                            <p className="text-[var(--app-text)] font-semibold">
                                {normalizedTier === 'PRO' && cancelScheduled && subscriptionEndDate
                                    ? `Cancellation scheduled. Access ends ${formatDisplayDate(subscriptionEndDate)}.`
                                    : normalizedTier === 'PRO' && subscription?.currentPeriodEnd
                                        ? `Active through ${formatDisplayDate(subscription.currentPeriodEnd)}.`
                                        : formatSubscriptionStatus(subscription?.status)}
                            </p>
                            <p className="mt-2 text-sm text-[var(--app-text-muted)]">
                                {normalizedTier === 'PRO' && cancelScheduled
                                    ? 'Auto-renew is off. You can keep the subscription active before the end date.'
                                    : normalizedTier === 'PRO'
                                        ? 'You can cancel renewal from this page without contacting support.'
                                        : upgradeUrl
                                            ? 'No paid subscription is active on this account.'
                                            : 'No paid subscription details are available yet.'}
                            </p>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="space-y-4 pt-6 border-t border-[var(--border-color)]">
                        {normalizedTier === 'FREE' ? (
                            <div className="flex">
                                <button
                                    type="button"
                                    onClick={() => void onUpgrade()}
                                    disabled={billingActionPending}
                                    className="w-full py-4 px-6 bg-[var(--accent-color)] hover:opacity-95 text-white font-bold rounded-2xl transition-all border border-[var(--accent-color)]/40 active:scale-[0.98]"
                                >
                                    Go Pro
                                </button>
                            </div>
                        ) : null}
                        {normalizedTier === 'PRO' ? (
                            <div className="flex">
                                <button
                                    type="button"
                                    onClick={() => void (cancelScheduled ? onResumeSubscription() : onCancelSubscription())}
                                    disabled={billingActionPending}
                                    className={`w-full py-4 px-6 font-bold rounded-2xl transition-all border active:scale-[0.98] ${cancelScheduled
                                        ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 border-emerald-500/20'
                                        : 'bg-[var(--card-bg)] hover:bg-red-500/10 text-red-500 border-red-500/20'
                                        }`}
                                >
                                    {billingActionPending
                                        ? 'Updating Subscription...'
                                        : cancelScheduled
                                            ? 'Keep Subscription'
                                            : 'Cancel Auto-Renew'}
                                </button>
                            </div>
                        ) : null}
                        <div className="flex">
                            <button onClick={handleLogout}
                                className="w-full py-4 px-6 bg-[var(--card-bg)] hover:bg-red-500/10 text-red-500 font-bold rounded-2xl transition-all border border-red-500/20 active:scale-[0.98]">
                                Log Out
                            </button>
                        </div>

                        <button
                            onClick={onReportBug}
                            className="w-full py-4 text-[10px] font-black uppercase tracking-[3px] text-[var(--app-text-muted)] hover:text-red-500 transition-colors flex items-center justify-center gap-3 border border-dashed border-[var(--border-color)] rounded-2xl hover:border-red-500/50"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            Report System Failure / Feedback
                        </button>
                    </div>
                </div>

                <p className="mt-8 text-center text-[10px] font-bold uppercase tracking-[0.3em] text-[var(--app-text-muted)] opacity-20">
                    Lumina Brancher v1.0.4-alpha
                </p>
            </div>
        </div>
    );
};
