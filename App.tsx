//n
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate, useLocation, Routes, Route } from 'react-router-dom';
import { ChatState, ChatNode, GenerationStatus, Message, ModelOption, SendMessageOptions } from './types';
import { ChatView, BranchMetadata } from './components/ChatView';
import { DemoPage } from './components/DemoPage';
import { FirstRunOnboardingModal } from './components/FirstRunOnboardingModal';
import { NodeView } from './components/NodeView';
import { ProfileView } from './components/ProfileView';
import { ToastViewport, ToastItem } from './components/ToastViewport';
import { useTheme } from './src/contexts/ThemeContext';
//import { generateResponse, generateTitle } from './services/geminiService';
import { dbService, SubscriptionInfo, UsageStatus, UserProfile } from './services/dbService';
import { initSupabase, supabase } from './services/supabaseClient';
import { ApiRequestError, generateBranchLabel, generateResponse, generateTitle, ResponseStreamDelta } from './services/openRouterService';
import { DEFAULT_FREE_MODEL_ID, getFirstAvailableModelId, normalizeTier } from './services/modelCatalog';
import { getFallbackModelCatalog } from './services/openRouterModels';
import { cancelProSubscription, openProUpgrade, resumeProSubscription } from './services/billingService';
import { hasSeenFirstRunOnboarding, markFirstRunOnboardingSeen } from './services/onboardingService';
interface Conversation {
  id: string;
  nodes: Record<string, ChatNode>;
  rootNodeId: string | null;
  currentNodeId: string | null;
  title: string;
  timestamp: number;
}

const STORAGE_KEY = 'lumina_conversations_v2'; // Bumped version for logic change

const formatUsd = (value: any) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '$0';
  return `$${num.toFixed(6)}`;
};

const formatCapLine = (label: string, spend: any, limit: any) => {
  const spendNum = Number(spend);
  const limitNum = limit == null ? null : Number(limit);

  if (!Number.isFinite(spendNum)) {
    return `${label}: n/a`;
  }

  if (limitNum == null || !Number.isFinite(limitNum) || limitNum <= 0) {
    return `${label}: ${formatUsd(spendNum)} / ∞`;
  }

  const pct = Math.min(999, Math.max(0, (spendNum / limitNum) * 100));
  const remaining = Math.max(0, limitNum - spendNum);
  return `${label}: ${formatUsd(spendNum)} / ${formatUsd(limitNum)} (${pct.toFixed(1)}%) remaining ${formatUsd(remaining)}`;
};

const logTurnUsage = (
  turnResult: any,
  fallbackUsage?: {
    inputTokens?: number | null;
    outputTokens?: number | null;
    reasoningTokens?: number | null;
  }
) => {
  if (!turnResult && !fallbackUsage) return;
  const usage = turnResult?.usage;
  const caps = turnResult?.caps;
  if (!usage && !fallbackUsage) return;

  const inTok = Number(
    usage?.input_tokens ??
    usage?.inputTokens ??
    fallbackUsage?.inputTokens ??
    0
  );
  const outTok = Number(
    usage?.output_tokens ??
    usage?.outputTokens ??
    fallbackUsage?.outputTokens ??
    0
  );
  const reasoningTok = Number(
    usage?.reasoning_tokens ??
    usage?.reasoningTokens ??
    fallbackUsage?.reasoningTokens ??
    0
  );
  const totalCost = Number(usage?.total_cost ?? 0);

  const capParts: string[] = [];
  if (caps) {
    capParts.push(formatCapLine('4h', caps.four_hour_spend, caps.four_hour_limit));
    capParts.push(formatCapLine('month', caps.monthly_spend, caps.monthly_limit));
  }

  console.log(
    `[USAGE] in=${Number.isFinite(inTok) ? inTok : 0} out=${Number.isFinite(outTok) ? outTok : 0}` +
    ` think=${Number.isFinite(reasoningTok) ? reasoningTok : 0} cost=${formatUsd(totalCost)}` +
    (caps?.plan ? ` plan=${caps.plan}` : '') +
    (capParts.length ? ` | ${capParts.join(' | ')}` : '')
  );
};

const toNullableNumber = (value: any) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const mapCapsToUsageStatus = (caps: any): UsageStatus | null => {
  if (!caps) {
    return null;
  }

  return {
    plan: typeof caps.plan === 'string' && caps.plan.trim() ? normalizeTier(caps.plan) : '',
    fourHourSpend: toNullableNumber(caps.four_hour_spend ?? caps.four_hour?.spend),
    fourHourLimit: toNullableNumber(caps.four_hour_limit ?? caps.four_hour?.limit),
    monthlySpend: toNullableNumber(caps.monthly_spend ?? caps.month?.spend),
    monthlyLimit: toNullableNumber(caps.monthly_limit ?? caps.month?.limit),
  };
};

const App: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isDemoRoute = location.pathname === '/demo';
  const [conversations, setConversations] = useState<any[]>([]);
  const [fullName, setFullName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSwitching, setIsSwitching] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [userTier, setUserTier] = useState<string>('FREE');
  const [usageStatus, setUsageStatus] = useState<UsageStatus | null>(null);
  const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo | null>(null);
  const [upgradeUrl, setUpgradeUrl] = useState<string | null>(null);
  const [billingActionPending, setBillingActionPending] = useState(false);
  const [isStartupOnboardingOpen, setIsStartupOnboardingOpen] = useState(false);
  const [startupOnboardingUserId, setStartupOnboardingUserId] = useState<string | null>(null);
  const [branchLines, setBranchLines] = useState<any[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [branchSourceOrdinal, setBranchSourceOrdinal] = useState<number | null>(null);

  const toggleGroup = (groupName: string) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [groupName]: !prev[groupName]
    }));
  };
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [chatScrollTarget, setChatScrollTarget] = useState<{ nodeId: string; messageOrdinal: number; requestKey: number } | null>(null);

  const [workspace, setWorkspace] = useState<ChatState & { branchingFromId: string | null }>({
    nodes: {},
    rootNodeId: null,
    currentNodeId: null,
    viewMode: 'chat',
    branchingFromId: null,
  });
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const { theme, mode, setTheme, setMode } = useTheme();

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingNodeId, setGeneratingNodeId] = useState<string | null>(null);
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>({ phase: 'idle' });
  const [selectedModel, setSelectedModel] = useState(DEFAULT_FREE_MODEL_ID);
  const [availableModels, setAvailableModels] = useState<ModelOption[]>(() => getFallbackModelCatalog());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 768; // Default to closed on mobile
    }
    return false;
  });
  const generationRef = React.useRef<any>(null);

  const resetGenerationStatus = useCallback(() => {
    setGenerationStatus({ phase: 'idle' });
  }, []);

  const beginGenerationStatus = useCallback((modelId: string, webSearchEnabled: boolean) => {
    setGenerationStatus({
      phase: 'requesting',
      modelId,
      webSearch: webSearchEnabled,
    });
  }, []);

  const markGenerationStreaming = useCallback(() => {
    setGenerationStatus((prev) => prev.phase === 'idle' ? prev : { ...prev, phase: 'streaming' });
  }, []);

  const stopGeneration = useCallback(async () => {
    if (generationRef.current) {
      await generationRef.current.cancel();
      generationRef.current = null;
    }
    setIsGenerating(false);
    setGeneratingNodeId(null);
    resetGenerationStatus();
  }, [resetGenerationStatus]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = self.crypto.randomUUID();
    setToasts((prev) => {
      const next = toast.persist
        ? prev.filter((entry) => !(entry.persist && entry.title === toast.title))
        : prev;
      return [...next, { id, ...toast }];
    });
    if (!toast.persist) {
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((entry) => entry.id !== id));
      }, 5200);
    }
  }, []);

  const applyUsageStatus = useCallback((status: UsageStatus | null) => {
    setUsageStatus(status);
    if (status?.plan) {
      setUserTier(normalizeTier(status.plan));
    }
  }, []);

  const applyUserProfile = useCallback((profile: UserProfile | null) => {
    if (!profile) {
      return;
    }

    setFullName(profile.fullName);
    setEmail(profile.email || null);
    setCreatedAt(profile.createdAt || null);
    setUserTier(normalizeTier(profile.tier || profile.usageStatus?.plan));
    applyUsageStatus(profile.usageStatus);
    setSubscriptionInfo(profile.subscription ?? null);
    setUpgradeUrl(profile.upgradeUrl ?? null);
  }, [applyUsageStatus]);

  const refreshUserProfile = useCallback(async (force = true) => {
    const nextProfile = await dbService.fetchUserProfile({ force });
    applyUserProfile(nextProfile);
    return nextProfile;
  }, [applyUserProfile]);

  const dismissFirstRunOnboarding = useCallback(() => {
    markFirstRunOnboardingSeen(startupOnboardingUserId);
    setIsStartupOnboardingOpen(false);
  }, [startupOnboardingUserId]);

  const refreshUsageStatus = useCallback(async () => {
    const nextUsageStatus = await dbService.fetchUsageStatus();
    if (nextUsageStatus) {
      applyUsageStatus(nextUsageStatus);
    }
    return nextUsageStatus;
  }, [applyUsageStatus]);

  const groupedConversations = useMemo(() => {
    // 1. Define the buckets
    const groups: Record<string, any[]> = {
      'Today': [],
      'Yesterday': [],
      'Previous 7 Days': [],
      'Previous 30 Days': [],
      'Older': []
    };

    const now = new Date();
    // Midnight today
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const msInDay = 86400000;

    const startOfYesterday = startOfToday - msInDay;
    const startOf7DaysAgo = startOfToday - (7 * msInDay);
    const startOf30DaysAgo = startOfToday - (30 * msInDay);

    // 2. Sort conversations into buckets
    conversations.forEach(conv => {
      // Note: If you have 'updated_at', that is usually better to use than 'created_at' 
      // so bumped threads float to the top of "Today".
      const convDate = new Date(conv.created_at).getTime();

      if (convDate >= startOfToday) {
        groups['Today'].push(conv);
      } else if (convDate >= startOfYesterday) {
        groups['Yesterday'].push(conv);
      } else if (convDate >= startOf7DaysAgo) {
        groups['Previous 7 Days'].push(conv);
      } else if (convDate >= startOf30DaysAgo) {
        groups['Previous 30 Days'].push(conv);
      } else {
        groups['Older'].push(conv);
      }
    });

    // 3. Filter out empty groups so we don't render empty headers
    return Object.entries(groups).filter(([_, convs]) => convs.length > 0);
  }, [conversations]);
  // Removed noisy workspace logging (it fired on every streamed delta).

  useEffect(() => {
    if (isDemoRoute) {
      setIsLoading(false);
      return;
    }

    const loadSidebar = async () => {
      try {
        await initSupabase(); // Initialize Supabase with config from backend
        const [data, userProfile] = await Promise.all([
          dbService.fetchConversations(),
          dbService.fetchUserProfile(),
        ]);
        setConversations(data);
        setAvailableModels(getFallbackModelCatalog());
        applyUserProfile(userProfile);
      } catch (err) {
        console.error("Sidebar load failed:", err);
      } finally {
        setIsLoading(false);
      }
    };
    loadSidebar();
  }, [applyUserProfile, isDemoRoute]);

  useEffect(() => {
    if (isDemoRoute) {
      return;
    }

    const checkoutState = new URLSearchParams(location.search).get('checkout');
    if (!checkoutState) {
      return;
    }

    if (checkoutState === 'success') {
      pushToast({
        title: 'Checkout completed',
        description: 'Stripe is syncing your subscription now. If Pro access does not appear within a few seconds, refresh your profile.',
        tone: 'success',
      });

      window.setTimeout(async () => {
        await refreshUserProfile(true);
      }, 2500);
    } else if (checkoutState === 'cancelled') {
      pushToast({
        title: 'Checkout cancelled',
        description: 'No changes were made to your plan.',
        tone: 'info',
      });
    }

    navigate(location.pathname, { replace: true });
  }, [isDemoRoute, location.pathname, location.search, navigate, pushToast, refreshUserProfile]);

  useEffect(() => {
    if (isDemoRoute || isLoading) {
      return;
    }

    let cancelled = false;

    const syncFirstRunOnboarding = async () => {
      try {
        await initSupabase();
        const { data: { user } } = await supabase.auth.getUser();

        if (cancelled) {
          return;
        }

        if (!user) {
          setStartupOnboardingUserId(null);
          setIsStartupOnboardingOpen(false);
          return;
        }

        setStartupOnboardingUserId(user.id);
        setIsStartupOnboardingOpen(!hasSeenFirstRunOnboarding(user.id));
      } catch (error) {
        if (!cancelled) {
          console.warn('Startup onboarding check failed:', error);
        }
      }
    };

    void syncFirstRunOnboarding();

    return () => {
      cancelled = true;
    };
  }, [isDemoRoute, isLoading]);

  useEffect(() => {
    if (!availableModels.length) {
      return;
    }

    if (!availableModels.some((model) => model.id === selectedModel)) {
      setSelectedModel(availableModels[0].id);
      return;
    }

    const selectedModelEntry = availableModels.find((model) => model.id === selectedModel);
    if (!selectedModelEntry) {
      return;
    }

    if (!selectedModelEntry.isPremium || normalizeTier(userTier) !== 'FREE') {
      return;
    }

    const fallbackModel = availableModels.find((model) => !model.isPremium) ?? { id: getFirstAvailableModelId(userTier) };
    setSelectedModel(fallbackModel.id);
  }, [availableModels, selectedModel, userTier]);



  const getFullHistoryPath = useCallback((nodeId: string | null): ChatNode[] => {
    if (!nodeId) return [];
    const path: ChatNode[] = [];
    let currentId: string | null = nodeId;

    while (currentId && workspace.nodes[currentId]) {
      const node = workspace.nodes[currentId];
      path.unshift(node);
      // If this node was created as a "side question" (mini chat),
      // we treat it as the start of a new history chain for playback/display.
      if (node.branchMessageId) {
        break;
      }
      currentId = node.parentId;
    }
    return path;
  }, [workspace.nodes]);

  const mapNodeHistoryForModel = useCallback((path: ChatNode[]) => (
    path.flatMap((node) =>
      [...node.messages]
        .sort((a, b) => a.ordinal - b.ordinal)
        .map((message) => ({
          role: message.role === 'model' ? 'assistant' : 'user',
          content: message.content,
        }))
    )
  ), []);

  const buildSelectionBranchContext = useCallback((branchParentId: string | null, metadata?: BranchMetadata) => {
    if (!branchParentId || metadata?.triggerSource !== 'selection' || !metadata.selectionText?.trim()) {
      return null;
    }

    const sourceNodeId = metadata.sourceNodeId || branchParentId;
    const sourceOrdinal = typeof metadata.sourceMessageOrdinal === 'number' ? metadata.sourceMessageOrdinal : null;
    const parentHistory = getFullHistoryPath(branchParentId);

    const leadingUserPrompts = parentHistory.flatMap((node) => {
      const sortedMessages = [...node.messages].sort((a, b) => a.ordinal - b.ordinal);
      const cutoffOrdinal = node.id === sourceNodeId && sourceOrdinal != null
        ? sourceOrdinal
        : Number.POSITIVE_INFINITY;

      return sortedMessages
        .filter((message) => message.role === 'user' && message.ordinal <= cutoffOrdinal)
        .map((message) => message.content.trim())
        .filter(Boolean);
    });

    const contextSections = [
      'Use only this branch context from the selected text below when answering the next prompt.',
      metadata.headingPath?.length
        ? `Closest markdown heading path:\n${metadata.headingPath.map((heading, index) => `${index + 1}. ${heading}`).join('\n')}`
        : null,
      `Selected excerpt:\n"""${metadata.selectionText.trim()}"""`,
      leadingUserPrompts.length
        ? `User prompts that led here:\n${leadingUserPrompts.map((prompt, index) => `${index + 1}. ${prompt}`).join('\n')}`
        : null,
      'Do not assume any other assistant context outside of this excerpt unless it is explicitly implied by the user prompts above.',
    ].filter(Boolean);

    return [{
      role: 'user' as const,
      content: contextSections.join('\n\n'),
    }];
  }, [getFullHistoryPath]);

  const handleUpgradeToPro = useCallback(async () => {
    try {
      await openProUpgrade();
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 409 && error.data?.code === 'SUBSCRIPTION_EXISTS') {
        await refreshUserProfile(true);
        pushToast({
          title: 'Subscription already active',
          description: error.message,
          tone: 'info',
        });
        return;
      }

      pushToast({
        title: 'Checkout unavailable',
        description: error instanceof Error ? error.message : 'Could not open Stripe checkout right now.',
        tone: 'error',
      });
    }
  }, [pushToast, refreshUserProfile]);

  const handleCancelSubscription = useCallback(async () => {
    if (typeof window !== 'undefined' && !window.confirm('Cancel renewal at the end of your current billing period?')) {
      return;
    }

    setBillingActionPending(true);
    try {
      await cancelProSubscription();
      await refreshUserProfile(true);
      pushToast({
        title: 'Subscription updated',
        description: 'Auto-renew is now off. Your access will continue until the end of the current billing period.',
        tone: 'success',
      });
    } catch (error) {
      pushToast({
        title: 'Could not update subscription',
        description: error instanceof Error ? error.message : 'Stripe could not update the subscription right now.',
        tone: 'error',
      });
    } finally {
      setBillingActionPending(false);
    }
  }, [pushToast, refreshUserProfile]);

  const handleResumeSubscription = useCallback(async () => {
    setBillingActionPending(true);
    try {
      await resumeProSubscription();
      await refreshUserProfile(true);
      pushToast({
        title: 'Subscription resumed',
        description: 'Auto-renew is back on for this subscription.',
        tone: 'success',
      });
    } catch (error) {
      pushToast({
        title: 'Could not resume subscription',
        description: error instanceof Error ? error.message : 'Stripe could not resume the subscription right now.',
        tone: 'error',
      });
    } finally {
      setBillingActionPending(false);
    }
  }, [pushToast, refreshUserProfile]);

  const describeApiError = useCallback((error: unknown) => {
    if (!(error instanceof ApiRequestError)) {
      return {
        title: 'Request failed',
        description: error instanceof Error ? error.message : 'Something went wrong while contacting the model.',
        tone: 'error' as const,
      };
    }

    if (error.status === 402) {
      const status = mapCapsToUsageStatus(error.data);
      if (status) {
        applyUsageStatus(status);
      }

      const isFourHour = error.data?.reason === 'FOUR_HOUR_LIMIT';
      const isMonthly = error.data?.reason === 'MONTHLY_LIMIT';

      return {
        title: isFourHour ? '4-hour quota reached' : isMonthly ? 'Monthly quota reached' : 'Usage limit reached',
        description: isFourHour
          ? 'Try again in 4 hours, or go Pro.'
          : isMonthly
            ? 'Try again when your monthly quota resets, or go Pro.'
            : 'Try again later, or go Pro.',
        tone: 'info' as const,
        persist: true,
        action: { label: 'Go Pro', onClick: handleUpgradeToPro },
      };
    }

    if (error.status === 403 && error.data?.code === 'PLAN_MODEL_LOCKED') {
      const nextTier = normalizeTier(error.data?.current_plan);
      setUserTier(nextTier);
      return {
        title: 'Pro model only',
        description: nextTier === 'FREE'
          ? 'That model is available on Pro. Switch to a free model such as Trinity Large or Gemini 3 Flash, or upgrade your plan.'
          : error.message,
        tone: 'info' as const,
        persist: true,
        action: { label: 'Go Pro', onClick: handleUpgradeToPro },
      };
    }

    if (error.status === 404 && error.data?.code === 'WEB_SEARCH_ROUTE_MISSING') {
      return {
        title: 'Web search unavailable',
        description: error.data?.error || 'The backend needs the newer OpenRouter Responses route before web search can run.',
        tone: 'info' as const,
      };
    }

    return {
      title: `Request failed (${error.status})`,
      description: error.data?.error || error.message,
      tone: 'error' as const,
    };
  }, [applyUsageStatus, handleUpgradeToPro]);

  const activeMessages = useMemo(() => {
    // History is the full set of messages in nodes leading up to current
    const path = getFullHistoryPath(workspace.currentNodeId);
    return path.flatMap(node =>
      [...node.messages].sort((a, b) => a.ordinal - b.ordinal)
    );
  }, [workspace.currentNodeId, getFullHistoryPath]);

  const applyAssistantDelta = useCallback((nodeId: string, messageTimestamp: number, delta: ResponseStreamDelta) => {
    if (!delta.text && !delta.reasoning) {
      return;
    }

    setWorkspace(prev => {
      const node = prev.nodes[nodeId];
      if (!node) return prev;

      const updatedMessages = [...node.messages];
      const lastMsg = updatedMessages[updatedMessages.length - 1];

      if (lastMsg?.role !== 'model' || lastMsg.timestamp !== messageTimestamp) {
        return prev;
      }

      updatedMessages[updatedMessages.length - 1] = {
        ...lastMsg,
        content: `${lastMsg.content ?? ''}${delta.text ?? ''}`,
        thinkingTrace: `${lastMsg.thinkingTrace ?? ''}${delta.reasoning ?? ''}` || undefined
      };

      return {
        ...prev,
        nodes: {
          ...prev.nodes,
          [nodeId]: { ...node, messages: updatedMessages }
        }
      };
    });
  }, []);

  const applyAssistantMetadata = useCallback((nodeId: string, messageTimestamp: number, citations?: Message['citations']) => {
    if (!citations?.length) {
      return;
    }

    setWorkspace(prev => {
      const node = prev.nodes[nodeId];
      if (!node) return prev;

      const updatedMessages = [...node.messages];
      const lastMsg = updatedMessages[updatedMessages.length - 1];

      if (lastMsg?.role !== 'model' || lastMsg.timestamp !== messageTimestamp) {
        return prev;
      }

      updatedMessages[updatedMessages.length - 1] = {
        ...lastMsg,
        citations
      };

      return {
        ...prev,
        nodes: {
          ...prev.nodes,
          [nodeId]: { ...node, messages: updatedMessages }
        }
      };
    });
  }, []);

  const generateHierarchicalLabel = (parentId: string | null, nodes: Record<string, ChatNode>): string => {
    if (!parentId) return "1";
    const parent = nodes[parentId];
    const siblingsCount = parent.childrenIds.length;
    const endsWithLetter = /[a-z]$/.test(parent.hierarchicalID);
    return endsWithLetter ? `${parent.hierarchicalID}.${siblingsCount + 1}` : `${parent.hierarchicalID}.${String.fromCharCode(97 + siblingsCount)}`;
  };

  const generateCoolId = (parentId: string | null, nodes: Record<string, ChatNode>): string => {
    if (!parentId) return "1";
    const parent = nodes[parentId];
    const siblingsCount = parent.childrenIds.length;
    const endsWithLetter = /[a-z]$/.test(parentId);
    return endsWithLetter ? `${parentId}.${siblingsCount + 1}` : `${parentId}.${String.fromCharCode(97 + siblingsCount)}`;
  };

  const handleReportBug = useCallback(async () => {
    let description = prompt("Describe the bug (what happened?):");
    if (!description) return;

    try {
      // Optional: Capture basic browser info
      const debugInfo = JSON.stringify({
        userAgent: navigator.userAgent,
        screen: `${window.innerWidth}x${window.innerHeight}`,
        url: window.location.href,
        node: workspace.currentNodeId // helpful to know where they were
      }, null, 2);

      await dbService.reportBug(description, debugInfo);
      pushToast({
        title: 'Bug report sent',
        description: 'Thanks. I saved the report with your current workspace context.',
        tone: 'success',
      });
    } catch (err) {
      console.error(err);
      pushToast({
        title: 'Bug report failed',
        description: err instanceof Error ? err.message : 'The report could not be submitted right now.',
        tone: 'error',
      });
    }
  }, [pushToast, workspace.currentNodeId]);

  const handleDeleteConversation = useCallback(async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent selecting the conversation when clicking delete

    if (confirm("Delete this conversation? This action cannot be undone.")) {
      try {
        await dbService.deleteConversation(convId);

        // If we're deleting the active conversation, reset workspace
        if (activeConvId === convId) {
          setActiveConvId(null);
          setWorkspace({
            nodes: {},
            rootNodeId: null,
            currentNodeId: null,
            viewMode: 'chat',
            branchingFromId: null,
          });
          setBranchSourceOrdinal(null);
        }

        // Refresh the sidebar
        const updatedConvs = await dbService.fetchConversations();
        setConversations(updatedConvs);
      } catch (err) {
        console.error("Delete failed:", err);
        pushToast({
          title: 'Delete failed',
          description: err instanceof Error ? err.message : 'The conversation could not be deleted.',
          tone: 'error',
        });
      }
    }
  }, [activeConvId, pushToast]);

  const handleSelectConversation = async (id: string | null) => {
    // Auto-collapse sidebar on mobile when selecting a chat
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setSidebarCollapsed(true);
    }

    // Don't reload if we're already on this conversation
    if (id === activeConvId) {
      return;
    }
    setActiveConvId(id);
    setIsSwitching(true);
    setBranchLines([]);
    // If id is null, we are starting a NEW thread. Reset workspace.
    if (!id) {
      setWorkspace({
        nodes: {},
        rootNodeId: null,
        currentNodeId: null,
        viewMode: 'chat',
        branchingFromId: null,
      });
      setBranchSourceOrdinal(null);
      setIsSwitching(false);
      return;
    }

    try {
      const { nodes: nodesMap, branchLines: loadedBranchLines } = await dbService.fetchConversationDetail(id);
      const header = conversations.find(c => c.id === id);

      setWorkspace({
        nodes: nodesMap,
        rootNodeId: header?.root_node_id || null,
        currentNodeId: header?.current_node_id || null,
        viewMode: 'chat',
        branchingFromId: null,
      });
      setBranchSourceOrdinal(null);
      setBranchLines(loadedBranchLines);
    } catch (err) {
      console.error("Hydration failed:", err);
    } finally {
      setIsSwitching(false);
    }
  };

  const handleSendMessage = useCallback(async (text: string, files: File[], branchMetadata?: BranchMetadata, thinking?: boolean, options?: SendMessageOptions) => {
    if (isGenerating || (!text.trim() && files.length === 0)) return;
    setIsGenerating(true);
    let currentConvId = activeConvId;
    const isNewConversation = !currentConvId;
    const timestamp = Date.now();
    const effectiveBranchParentId = options?.branchParentId ?? workspace.branchingFromId;
    const effectiveBranchSourceOrdinal = options?.branchSourceOrdinal ?? branchSourceOrdinal;
    const isBranching = !!effectiveBranchParentId;
    const modelForTurn = options?.modelId ?? selectedModel;
    const contextMode = options?.contextMode ?? (branchMetadata?.triggerSource === 'selection' ? 'selection' : 'inherit');
    const previousWorkspace = workspace;
    const previousBranchLines = branchLines;
    const previousActiveConvId = activeConvId;
    const previousBranchSourceOrdinal = branchSourceOrdinal;
    beginGenerationStatus(modelForTurn, Boolean(options?.webSearch?.enabled));

    // 1. GENERATE IDS ON CLIENT (The "Forever" IDs)
    // We use crypto.randomUUID() to generate a real UUID v4 immediately.
    // If we need a new node, we generate its ID now and keep it forever.
    const clientGeneratedNodeId = self.crypto.randomUUID();

    // Determine the Target Node ID immediately
    const targetNodeId = (isNewConversation || isBranching)
      ? clientGeneratedNodeId
      : workspace.currentNodeId!;

    const capturedParentId = isBranching ? effectiveBranchParentId : null;
    const capturedHLabel = generateHierarchicalLabel(capturedParentId, workspace.nodes);
    setGeneratingNodeId(targetNodeId);

    const currentMessages = (workspace.currentNodeId && workspace.nodes[workspace.currentNodeId])
      ? workspace.nodes[workspace.currentNodeId].messages
      : [];

    const userMsg: Message = {
      role: 'user',
      content: text,
      timestamp: timestamp,
      ordinal: isNewConversation || isBranching ? 0 : currentMessages.length
    };

    // 2. OPTIMISTIC UPDATE (Using the REAL ID)
    if (isNewConversation || isBranching) {
      // no-op: keep console clean

      setWorkspace(prev => {
        const newNodes = {
          ...prev.nodes,
          [targetNodeId]: {
            id: targetNodeId, // <--- We use the final ID right away
            hierarchicalID: capturedHLabel,
            parentId: capturedParentId,
            messages: [{ ...userMsg }],
            title: '...',
            timestamp: timestamp,
            childrenIds: [],
            isBranch: isBranching,
            branchMessageId: branchMetadata?.messageId ?? (isBranching && capturedParentId && effectiveBranchSourceOrdinal != null ? `${capturedParentId}:${effectiveBranchSourceOrdinal}` : null),
            branchBlockIndex: branchMetadata?.blockIndex ?? null,
            branchRelativeYInBlock: branchMetadata?.relativeYInBlock ?? null,
            branchMsgRelativeY: branchMetadata?.msgRelativeY ?? (isBranching ? 0.5 : null),
          }
        };

        // Update parent's childrenIds if branching
        if (capturedParentId && prev.nodes[capturedParentId]) {
          newNodes[capturedParentId] = {
            ...prev.nodes[capturedParentId],
            childrenIds: [...prev.nodes[capturedParentId].childrenIds, targetNodeId]
          };
        }

        return {
          ...prev,
          nodes: newNodes,
          // MAGIC: If branchMetadata exists, keep the OLD currentNodeId!
          currentNodeId: branchMetadata ? prev.currentNodeId : targetNodeId,
          rootNodeId: !capturedParentId ? targetNodeId : prev.rootNodeId,
          branchingFromId: null
        };
      });
      setBranchSourceOrdinal(null);

      // MAGIC: Save the line coordinates so the UI can draw the blue line
      if (branchMetadata) {
        setBranchLines(prev => [...prev, { ...branchMetadata, targetNodeId }]);
      }
    } else {
      // Normal message appending
      setWorkspace(prev => {
        const node = prev.nodes[targetNodeId];
        if (!node) return prev;
        return {
          ...prev,
          nodes: {
            ...prev.nodes,
            [targetNodeId]: { ...node, messages: [...node.messages, userMsg] }
          }
        };
      });
    }

    try {
      // ... (inside handleSendMessage, after step 2 OPTIMISTIC UPDATE) ...

      // 3. GENERATE AI RESPONSE (Stream into the view)
      // Build context
      let aiContext;
      if (contextMode === 'none') {
        aiContext = [];
      } else if (contextMode === 'selection') {
        aiContext = buildSelectionBranchContext(capturedParentId, branchMetadata) ?? [];
      } else if (isNewConversation || isBranching) {
        aiContext = mapNodeHistoryForModel(getFullHistoryPath(capturedParentId));
      } else {
        aiContext = mapNodeHistoryForModel(getFullHistoryPath(targetNodeId));
      }

      // Call Unified OpenRouter Service
      const result = await generateResponse(
        text,
        aiContext as any,
        files,
        modelForTurn,
        thinking,
        {
          webSearch: options?.webSearch
        }
      );

      generationRef.current = result;

      // 4. STREAM HANDLING
      let fullResponse = "";
      let thinkingTrace = "";
      const aiMsgTimestamp = Date.now();
      const aiMsg: Message = {
        role: 'model',
        content: '',
        thinkingTrace: '',
        timestamp: aiMsgTimestamp,
        ordinal: userMsg.ordinal + 1
      };

      // Add empty AI message to UI
      setWorkspace(prev => {
        const node = prev.nodes[targetNodeId];
        if (!node) return prev;
        return {
          ...prev,
          nodes: {
            ...prev.nodes,
            [targetNodeId]: { ...node, messages: [...node.messages, aiMsg] }
          }
        };
      });

      // Process ModelResult Stream
      let hasSeenStreamDelta = false;
      try {
        for await (const delta of result.getDeltaStream()) {
          if (!hasSeenStreamDelta && (delta.text || delta.reasoning)) {
            hasSeenStreamDelta = true;
            markGenerationStreaming();
          }

          if (delta.text) {
            fullResponse += delta.text;
          }

          if (delta.reasoning) {
            thinkingTrace += delta.reasoning;
          }

          if (delta.text || delta.reasoning) {
            applyAssistantDelta(targetNodeId, aiMsgTimestamp, delta);
            await new Promise(r => setTimeout(r, 0));
          }
        }
      } catch (streamErr: any) {
        if (streamErr.name === 'AbortError' || streamErr.message?.includes('abort') || streamErr.message?.toLowerCase().includes('cancel')) {
          // no-op: user canceled
        } else {
          throw streamErr;
        }
      }

      setIsGenerating(false);
      setGeneratingNodeId(null);
      resetGenerationStatus();
      generationRef.current = null;
      const usage = result.getUsage?.();
      const responseMetadata = result.getMetadata?.();
      applyAssistantMetadata(targetNodeId, aiMsgTimestamp, responseMetadata?.citations);

      // ... (Continue to 5. DATABASE SYNC as before) ...

      // 5. DATABASE SYNC (Background)
      // We already have the IDs, we just need to save them.

      if (isNewConversation) {
        // Create conversation wrapper first
        const newConv = await dbService.createConversation("New Discussion");
        currentConvId = newConv.id;
        setActiveConvId(currentConvId);
      }

      if (isNewConversation || isBranching) {
        // SAVE NODE WITH OUR PRE-GENERATED ID
        await dbService.createNode({
          id: targetNodeId,
          conversations_id: currentConvId!,
          parent_id: capturedParentId,
          hierarchical_id: capturedHLabel,
          is_branch: isBranching,
          title: '...',
          // Save branch line positioning so it can be restored on next load
          ...(branchMetadata ? {
            branch_message_id: branchMetadata.messageId,
            branch_block_index: branchMetadata.blockIndex,
            branch_relative_y_in_block: branchMetadata.relativeYInBlock,
            branch_msg_relative_y: branchMetadata.msgRelativeY,
          } : isBranching && capturedParentId && effectiveBranchSourceOrdinal != null ? {
            branch_message_id: `${capturedParentId}:${effectiveBranchSourceOrdinal}`,
            branch_msg_relative_y: 0.5,
          } : isBranching ? {
            // Generic branch button: anchor from the parent node center in NodeView.
            branch_msg_relative_y: 0.5,
          } : {})
        });
      }

      // Save Messages + usage accounting
      const turnResult = await dbService.saveCompletedTurn({
        nodes_id: targetNodeId,
        model: modelForTurn,
        input_tokens: usage?.inputTokens ?? 0,
        output_tokens: usage?.outputTokens ?? 0,
        user_message: {
          content: text,
          ordinal: userMsg.ordinal
        },
        model_message: {
          content: fullResponse,
          thinkingTrace,
          citations: responseMetadata?.citations,
          ordinal: aiMsg.ordinal
        }
      });

      if (import.meta.env.DEV) {
        logTurnUsage(turnResult, usage);
      }

      const latestUsageStatus = mapCapsToUsageStatus(turnResult?.caps);
      if (latestUsageStatus) {
        applyUsageStatus(latestUsageStatus);
      }

      // Update Pointers
      // Update Pointers
      if (isNewConversation) {
        await dbService.updateConversationState(currentConvId!, {
          root_node_id: targetNodeId,
          current_node_id: targetNodeId
        });
      } else if (isBranching && !branchMetadata) {
        await dbService.updateConversationState(currentConvId!, {
          current_node_id: targetNodeId
        });
      } else {
        // Regular message — bump updated_at so conversation floats to top of sidebar  await dbService.updateConversationState(currentConvId!, {});
      }

      // 6. FINAL SYNC (Just to update sidebar/titles, NO NODE SWAPPING)
      const sidebarData = await dbService.fetchConversations();
      setConversations(sidebarData);

      // no-op: keep console clean

      if (isNewConversation || isBranching) {
        const labelPromise = isNewConversation
          ? generateTitle(text, fullResponse, modelForTurn)
          : generateBranchLabel(text, fullResponse, modelForTurn);

        labelPromise.then(async (llmTitle) => {
          try {
            // no-op: keep console clean

            // A. Update Database
            await dbService.updateNodeTitle(targetNodeId, llmTitle);

            if (isNewConversation) {
              // Update conversation title in DB
              await dbService.updateConversationState(currentConvId!, { title: llmTitle });
            }

            // B. UPDATE LOCAL WORKSPACE (The Safe Way)
            // We update ONLY the title field of the specific node.
            // We do NOT re-fetch the whole node list, preventing the "stale data" wipeout.
            setWorkspace(prev => {
              const node = prev.nodes[targetNodeId];
              if (!node) return prev; // Safety check
              return {
                ...prev,
                nodes: {
                  ...prev.nodes,
                  [targetNodeId]: {
                    ...node,
                    title: llmTitle
                  }
                }
              };
            });

            // C. Update Sidebar (Background Sync)
            // This is safe to re-fetch because it doesn't affect the active view
            const updatedSidebar = await dbService.fetchConversations();
            setConversations(updatedSidebar);

          } catch (titleErr) {
            console.warn("Title generation failed silently:", titleErr);
            // We don't alert here because the message was sent successfully
          }
        });
      }

    } catch (err: any) {
      console.error("Message Failure:", err);
      setWorkspace(previousWorkspace);
      setBranchLines(previousBranchLines);
      setActiveConvId(previousActiveConvId);
      setBranchSourceOrdinal(previousBranchSourceOrdinal);
      setIsGenerating(false);
      setGeneratingNodeId(null);
      resetGenerationStatus();
      generationRef.current = null;
      pushToast(describeApiError(err));
      if (err instanceof ApiRequestError && err.status === 402) {
        void refreshUsageStatus();
      }
    }
  }, [
    activeConvId,
    applyAssistantDelta,
    applyAssistantMetadata,
    applyUsageStatus,
    beginGenerationStatus,
    branchLines,
    branchSourceOrdinal,
    buildSelectionBranchContext,
    describeApiError,
    getFullHistoryPath,
    isGenerating,
    markGenerationStreaming,
    mapNodeHistoryForModel,
    pushToast,
    resetGenerationStatus,
    refreshUsageStatus,
    selectedModel,
    workspace,
  ]);


  const handleSendMessageToNode = useCallback(async (nodeId: string, text: string, files: File[], thinking?: boolean, options?: SendMessageOptions) => {
    // Temporarily switch currentNodeId to the branch node, send, then restore
    // We do this by saving branchingFromId state and re-using handleSendMessage logic
    // but targeting a specific existing node
    if (isGenerating || !text.trim()) return;
    setIsGenerating(true);
    setGeneratingNodeId(nodeId);

    const targetNodeId = nodeId;
    const node = workspace.nodes[nodeId];
    if (!node) { setIsGenerating(false); setGeneratingNodeId(null); return; }
    const previousMessages = [...node.messages];

    const currentMessages = node.messages;
    const timestamp = Date.now();
    const userMsg: Message = {
      role: 'user',
      content: text,
      timestamp,
      ordinal: currentMessages.length,
    };

    // Optimistically add user message
    setWorkspace(prev => {
      const n = prev.nodes[targetNodeId];
      if (!n) return prev;
      return { ...prev, nodes: { ...prev.nodes, [targetNodeId]: { ...n, messages: [...n.messages, userMsg] } } };
    });

    try {
      // Build context for this node's full history path
      const modelForTurn = options?.modelId ?? selectedModel;
      beginGenerationStatus(modelForTurn, Boolean(options?.webSearch?.enabled));
      const contextMode = options?.contextMode ?? 'inherit';
      const historyPath = getFullHistoryPath(targetNodeId);
      const aiContext = contextMode === 'none'
        ? []
        : mapNodeHistoryForModel(historyPath);

      const result = await generateResponse(
        text,
        aiContext as any,
        files,
        modelForTurn,
        thinking,
        {
          webSearch: options?.webSearch
        }
      );

      generationRef.current = result;

      let fullResponse = '';
      let thinkingTrace = '';
      const aiMsgTimestamp = Date.now();
      const aiMsg: Message = { role: 'model', content: '', thinkingTrace: '', timestamp: aiMsgTimestamp, ordinal: userMsg.ordinal + 1 };

      setWorkspace(prev => {
        const n = prev.nodes[targetNodeId];
        if (!n) return prev;
        return { ...prev, nodes: { ...prev.nodes, [targetNodeId]: { ...n, messages: [...n.messages, aiMsg] } } };
      });

      let hasSeenStreamDelta = false;
      try {
        for await (const delta of result.getDeltaStream()) {
          if (!hasSeenStreamDelta && (delta.text || delta.reasoning)) {
            hasSeenStreamDelta = true;
            markGenerationStreaming();
          }

          if (delta.text) {
            fullResponse += delta.text;
          }

          if (delta.reasoning) {
            thinkingTrace += delta.reasoning;
          }

          if (delta.text || delta.reasoning) {
            applyAssistantDelta(targetNodeId, aiMsgTimestamp, delta);
            await new Promise(r => setTimeout(r, 0));
          }
        }
      } catch (streamErr: any) {
        if (streamErr.name === 'AbortError' || streamErr.message?.includes('abort') || streamErr.message?.toLowerCase().includes('cancel')) {
          // no-op: user canceled
        } else {
          throw streamErr;
        }
      }

      setIsGenerating(false);
      setGeneratingNodeId(null);
      resetGenerationStatus();
      generationRef.current = null;
      const usage = result.getUsage?.();
      const responseMetadata = result.getMetadata?.();
      applyAssistantMetadata(targetNodeId, aiMsgTimestamp, responseMetadata?.citations);

      // Save messages + usage accounting to DB
      const turnResult = await dbService.saveCompletedTurn({
        nodes_id: targetNodeId,
        model: modelForTurn,
        input_tokens: usage?.inputTokens ?? 0,
        output_tokens: usage?.outputTokens ?? 0,
        user_message: {
          content: text,
          ordinal: userMsg.ordinal
        },
        model_message: {
          content: fullResponse,
          thinkingTrace,
          citations: responseMetadata?.citations,
          ordinal: aiMsg.ordinal
        }
      });

      if (import.meta.env.DEV) {
        logTurnUsage(turnResult, usage);
      }

      const latestUsageStatus = mapCapsToUsageStatus(turnResult?.caps);
      if (latestUsageStatus) {
        applyUsageStatus(latestUsageStatus);
      }

      // no-op: keep console clean
    } catch (err: any) {
      console.error('Mini chat send failed:', err);
      setWorkspace(prev => {
        const currentNode = prev.nodes[targetNodeId];
        if (!currentNode) {
          return prev;
        }

        return {
          ...prev,
          nodes: {
            ...prev.nodes,
            [targetNodeId]: {
              ...currentNode,
              messages: previousMessages,
            }
          }
        };
      });
      setIsGenerating(false);
      setGeneratingNodeId(null);
      resetGenerationStatus();
      generationRef.current = null;
      pushToast(describeApiError(err));
      if (err instanceof ApiRequestError && err.status === 402) {
        void refreshUsageStatus();
      }
    }
  }, [
    applyAssistantDelta,
    applyAssistantMetadata,
    applyUsageStatus,
    beginGenerationStatus,
    describeApiError,
    getFullHistoryPath,
    isGenerating,
    markGenerationStreaming,
    mapNodeHistoryForModel,
    pushToast,
    resetGenerationStatus,
    refreshUsageStatus,
    selectedModel,
    workspace.nodes,
  ]);

  const handleClearAll = () => {
    if (confirm("Purge all topological data from local storage?")) {
      setConversations([]);
      setActiveConvId(null);
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const currentTitle = useMemo(() => {
    const node = workspace.currentNodeId ? workspace.nodes[workspace.currentNodeId] : null;
    return node?.title && node.title !== '...' ? node.title : "Klados-AI Session";
  }, [workspace.nodes, workspace.currentNodeId]);

  const handleNodeSelect = useCallback((id: string, messageOrdinal?: number) => {
    setChatScrollTarget(
      typeof messageOrdinal === 'number'
        ? { nodeId: id, messageOrdinal, requestKey: Date.now() }
        : null
    );
    setBranchSourceOrdinal(null);
    setWorkspace(prev => ({ ...prev, currentNodeId: id, branchingFromId: null, viewMode: 'chat' }));
  }, []);

  const handleNodeBranch = useCallback((id: string, messageOrdinal?: number) => {
    setChatScrollTarget(null);
    setBranchSourceOrdinal(typeof messageOrdinal === 'number' ? messageOrdinal : null);
    setWorkspace(p => ({ ...p, branchingFromId: id, currentNodeId: id, viewMode: 'chat' }));
  }, []);

  const branchSourceTitle = useMemo(() => {
    const branchNode = workspace.branchingFromId ? workspace.nodes[workspace.branchingFromId] : null;
    return branchNode?.title && branchNode.title !== '...' ? branchNode.title : null;
  }, [workspace.branchingFromId, workspace.nodes]);


  return (
    <div className="flex h-screen w-screen bg-[var(--app-bg)] text-[var(--app-text)] overflow-hidden font-inter selection:bg-[var(--accent-color)]/20 selection:text-[var(--app-text)]">
      <Routes>
        <Route path="/demo" element={<DemoPage />} />
        <Route path="/profile" element={
          <ProfileView
            fullName={fullName}
            email={email}
            createdAt={createdAt}
            tier={userTier}
            usageStatus={usageStatus}
            subscription={subscriptionInfo}
            upgradeUrl={upgradeUrl}
            onBack={() => navigate('/')}
            onReportBug={handleReportBug}
            onUpgrade={handleUpgradeToPro}
            onCancelSubscription={handleCancelSubscription}
            onResumeSubscription={handleResumeSubscription}
            billingActionPending={billingActionPending}
          />
        } />
        <Route path="/" element={
          <div className="flex h-full w-full overflow-hidden">
            {sidebarCollapsed && (
              <div className="fixed top-0 left-6 h-16 flex items-center z-[300]">
                <button
                  onClick={() => setSidebarCollapsed(false)}
                  className="p-2.5 bg-[var(--card-bg)] border border-[var(--border-color)] text-[var(--app-text)] rounded-xl shadow-xl hover:scale-105 active:scale-95 transition-all group overflow-hidden sidebar-button-entrance"
                  title="Expand sidebar"
                >
                  <div className="absolute inset-0 bg-[var(--accent-color)]/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <svg className="w-5 h-5 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h7" />
                  </svg>
                </button>
              </div>
            )}

            <aside
              className={`
                relative flex flex-col bg-[var(--sidebar-bg)] border-r border-[var(--sidebar-border)] transition-[width,opacity] duration-[450ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] z-[200] overflow-hidden
                ${sidebarCollapsed ? 'w-0 opacity-0 pointer-events-none' : 'w-72 opacity-100'}
              `}
            >
              <div className="w-72 flex flex-col h-full shrink-0">
                {/* LOGO + COLLAPSE TOGGLE */}
                <div className="flex items-center h-16 px-6 justify-between border-b border-[var(--sidebar-border)] mb-0">
                  <div className="flex items-center gap-4">
                    <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center shadow-sm shrink-0 overflow-hidden border border-[var(--border-color)]">
                      <img src="/logo.png" alt="Klados Logo" className="w-full h-full object-contain" />
                    </div>
                    <div>
                      <h1 className="text-[13px] font-bold tracking-tight uppercase text-[var(--app-text)]">Klados-AI</h1>
                      <p className="text-[8px] font-bold tracking-[0.2em] uppercase text-[var(--app-text-muted)]">Beta Version</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSidebarCollapsed(true)}
                    className="p-2 rounded-lg hover:bg-[var(--card-hover)] text-[var(--app-text-muted)] hover:text-[var(--app-text)] transition-all shrink-0"
                    title="Collapse sidebar"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                    </svg>
                  </button>
                </div>

                {!sidebarCollapsed && (
                  <>
                    <div className="p-6">
                      <button
                        onClick={() => handleSelectConversation(null)}
                        className="w-full flex items-center justify-center gap-3 py-3 bg-[var(--card-bg)] border border-[var(--border-color)] hover:border-[var(--accent-color)] hover:bg-[var(--card-hover)] rounded-xl transition-all group active:scale-95 shadow-sm"
                      >
                        <div className="p-1 bg-[var(--accent-color)]/10 rounded-md">
                          <svg className="w-4 h-4 text-[var(--accent-color)] group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                          </svg>
                        </div>
                        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--app-text)]">New Chat</span>
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar [mask-image:linear-gradient(to_bottom,black_96%,transparent_100%)] px-3 pb-4">
                      {groupedConversations.length === 0 && (
                        <div className="px-3 py-20 text-center opacity-10">
                          <svg className="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                          <p className="text-[10px] font-bold uppercase tracking-widest">No active protocols</p>
                        </div>
                      )}

                      <div className="space-y-6">
                        {groupedConversations.map(([groupName, groupConvs]) => {
                          const isCollapsed = collapsedGroups[groupName];

                          return (
                            <div key={groupName} className="space-y-1.5">
                              <button
                                onClick={() => toggleGroup(groupName)}
                                className="w-full flex items-center justify-between px-3 py-1 group/header hover:bg-[var(--card-hover)] rounded-lg transition-colors active:scale-[0.98]"
                              >
                                <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--app-text-muted)] group-hover/header:text-[var(--app-text)] transition-colors">
                                  {groupName}
                                </h4>
                                <svg
                                  className={`w-3.5 h-3.5 text-[var(--app-text-muted)] transition-transform duration-200 ${isCollapsed ? '-rotate-90' : 'rotate-0'}`}
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>

                              {!isCollapsed && (
                                <div className="space-y-1.5">
                                  {groupConvs.map((conv) => (
                                    <div
                                      key={conv.id}
                                      className={`relative group/conv rounded-xl transition-all border ${activeConvId === conv.id ? 'bg-[var(--card-hover)] border-[var(--border-color)] text-[var(--app-text)]' : 'bg-transparent border-transparent text-[var(--app-text-muted)] hover:bg-[var(--card-hover)]/50 hover:text-[var(--app-text)]'}`}
                                    >
                                      <button
                                        onClick={() => handleSelectConversation(conv.id)}
                                        className="w-full text-left px-4 py-2.5 rounded-xl transition-all"
                                      >
                                        <h3 className="text-sm font-medium truncate pr-10 leading-tight">{conv.title}</h3>
                                      </button>

                                      <button
                                        onClick={(e) => handleDeleteConversation(conv.id, e)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 opacity-0 group-hover/conv:opacity-100 hover:bg-red-600 text-white bg-[var(--app-text)] rounded-lg transition-all"
                                        title="Delete conversation"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="p-4 border-t border-[var(--sidebar-border)] bg-[var(--sidebar-bg)]">
                      <button
                        onClick={() => navigate('/profile')}
                        className="w-full flex items-center p-2.5 gap-3 bg-[var(--card-bg)] border border-[var(--border-color)] hover:border-[var(--accent-color)] hover:bg-[var(--card-hover)] rounded-xl transition-all active:scale-[0.98] shadow-sm group"
                      >
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold shrink-0 shadow-inner">
                          {fullName?.charAt(0) || 'U'}
                        </div>

                        <div className="flex flex-col items-start overflow-hidden text-[var(--app-text)]">
                          <span className="text-sm font-medium truncate ">
                            {fullName || "User Profile"}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--app-text-muted)]">
                              {normalizeTier(userTier) === 'PRO' ? 'Pro Plan' : 'Free Plan'}
                            </span>
                          </div>
                        </div>

                        <svg
                          className="ml-auto w-4 h-4 text-[var(--app-text-muted)] group-hover:text-[var(--app-text)] transition-colors"
                          fill="none" viewBox="0 0 24 24" stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </aside>

            {/* Main Workspace */}
            <div className="flex-1 flex flex-col relative overflow-hidden bg-[var(--app-bg)]">
              <header
                className={`
                  z-[100] h-16 bg-[var(--header-bg)] backdrop-blur-md flex items-center justify-between absolute top-0 left-0 right-0 border-b border-[var(--header-border)] transition-[padding-left] duration-[450ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]
                  ${sidebarCollapsed ? 'pl-24 pr-10' : 'px-10'}
                `}
              >
                <div className="flex items-center gap-6 overflow-hidden">
                  <h2 className="text-sm font-semibold tracking-tight text-[var(--app-text)] truncate max-w-[180px] sm:max-w-[300px] md:max-w-md lg:max-w-lg">
                    {currentTitle}
                  </h2>
                  {workspace.currentNodeId && (
                    <div className="flex items-center gap-2 px-2.5 py-0.5 bg-[var(--sidebar-bg)] border border-[var(--border-color)] rounded-full">
                      <span className="text-[9px] font-bold text-[var(--app-text-muted)] uppercase tracking-wider">Branch</span>
                      <span className="text-[10px] font-mono text-[var(--accent-color)]">
                        {workspace.nodes[workspace.currentNodeId]?.hierarchicalID}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <div className="relative">
                    <button
                      onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
                      className="p-2 text-[var(--app-text-muted)] hover:text-[var(--accent-color)] transition-colors rounded-xl hover:bg-[var(--card-hover)]"
                      title="Appearance"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 5a7 7 0 100 14 7 7 0 000-14z" />
                      </svg>
                    </button>

                    {isThemeMenuOpen && (
                      <div className="absolute top-[calc(100%+12px)] right-0 w-48 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl shadow-2xl p-2 z-[110] animate-in fade-in slide-in-from-top-2">
                        <div className="px-3 py-2 text-[10px] font-bold text-[var(--app-text-muted)] uppercase tracking-widest border-b border-[var(--border-color)] mb-2">
                          Appearance
                        </div>

                        <div className="space-y-1 mb-3">
                          <button
                            onClick={() => { setTheme('chatgpt'); setIsThemeMenuOpen(false); }}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${theme === 'chatgpt' ? 'bg-[var(--accent-color)] text-white' : 'text-[var(--app-text)] hover:bg-[var(--card-hover)]'}`}
                          >
                            ChatGPT Theme
                            {theme === 'chatgpt' && <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                          </button>
                          <button
                            onClick={() => { setTheme('claude'); setIsThemeMenuOpen(false); }}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${theme === 'claude' ? 'bg-[var(--accent-color)] text-white' : 'text-[var(--app-text)] hover:bg-[var(--card-hover)]'}`}
                          >
                            Claude Theme
                            {theme === 'claude' && <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                          </button>
                        </div>

                        <div className="flex gap-1 p-1 bg-[var(--sidebar-bg)] rounded-xl">
                          <button
                            onClick={() => { setMode('light'); setIsThemeMenuOpen(false); }}
                            className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${mode === 'light' ? 'bg-[var(--card-bg)] text-[var(--accent-color)] shadow-sm' : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'}`}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 5a7 7 0 100 14 7 7 0 000-14z" /></svg>
                            Light
                          </button>
                          <button
                            onClick={() => { setMode('dark'); setIsThemeMenuOpen(false); }}
                            className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${mode === 'dark' ? 'bg-[var(--card-bg)] text-[var(--accent-color)] shadow-sm' : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'}`}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                            Dark
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  {(workspace.rootNodeId || workspace.currentNodeId) && (
                    <button
                      onClick={() => setWorkspace(p => ({ ...p, viewMode: p.viewMode === 'chat' ? 'node' : 'chat' }))}
                      className={`flex items-center gap-3 px-5 py-2 rounded-xl transition-all duration-300 border ${workspace.viewMode === 'chat'
                        ? 'bg-[var(--card-bg)] border-[var(--border-color)] text-[var(--app-text)] hover:border-[var(--accent-color)] shadow-sm'
                        : 'bg-[var(--accent-color)] border-[var(--accent-color)] text-white shadow-sm'
                        }`}
                    >
                      <span className="text-[10px] font-bold uppercase tracking-widest">
                        {workspace.viewMode === 'chat' ? 'Map Overview' : 'Back to Chat'}
                      </span>
                    </button>
                  )}
                </div>
              </header>

              <main className="flex-1 relative overflow-hidden">
                {isSwitching && (
                  <div className="absolute inset-0 z-[150] bg-[var(--app-bg)]/40 backdrop-blur-xl flex flex-col items-center justify-center">
                    <div className="w-16 h-16 rounded-full border-t-2 border-[var(--accent-color)] animate-spin" />
                  </div>
                )}
                <div className={`absolute inset-0 transition-all duration-300 ${workspace.viewMode === 'chat' ? 'blur-3xl grayscale opacity-10 pointer-events-none' : 'opacity-100'}`}>
                  <NodeView
                    nodes={workspace.nodes}
                    rootNodeId={workspace.rootNodeId}
                    currentNodeId={workspace.currentNodeId}
                    viewMode={workspace.viewMode}
                    onSelectNode={handleNodeSelect}
                    onBranchNode={handleNodeBranch}
                  />
                </div>

                <div className={`relative z-50 w-full h-full transition-all duration-500 ${workspace.viewMode === 'chat' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12 pointer-events-none'}`}>
                  <ChatView
                    history={getFullHistoryPath(workspace.currentNodeId)}
                    onSendMessage={handleSendMessage}
                    onSendMessageToNode={handleSendMessageToNode}
                    onSelectNode={handleNodeSelect}
                    branchLines={branchLines}
                    nodes={workspace.nodes}
                    onBranch={handleNodeBranch}
                    isGenerating={isGenerating}
                    generatingNodeId={generatingNodeId}
                    generationStatus={generationStatus}
                    isBranching={!!workspace.branchingFromId}
                    currentNodeId={workspace.currentNodeId}
                    currentTitle={currentTitle}
                    selectedModel={selectedModel}
                    availableModels={availableModels}
                    onModelSelect={setSelectedModel}
                    onStopGeneration={stopGeneration}
                    scrollTarget={chatScrollTarget}
                    userTier={userTier}
                    branchSourceTitle={branchSourceTitle}
                    onUpgradeRequest={handleUpgradeToPro}
                    toasts={workspace.viewMode === 'chat' ? toasts : undefined}
                    onDismissToast={dismissToast}
                    onCancelBranch={() => {
                      setBranchSourceOrdinal(null);
                      setWorkspace(prev => ({ ...prev, branchingFromId: null }));
                    }}
                  />
                </div>
              </main>
            </div>
          </div>
        } />
      </Routes>
      <FirstRunOnboardingModal
        isOpen={isStartupOnboardingOpen}
        fullName={fullName}
        onClose={dismissFirstRunOnboarding}
      />
      {workspace.viewMode !== 'chat' ? (
        <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      ) : null}
    </div>
  );
};

export default App;
