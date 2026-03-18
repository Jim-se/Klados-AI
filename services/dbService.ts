import { supabase } from './supabaseClient';
import { ChatNode, Message } from '../types';
import { BranchMetadata } from '../components/ChatView';
import { API_BASE_URL } from './frontendConfig';
import { decodeMessageContent, encodeMessageContent } from './messageContent';
import { normalizeTier } from './modelCatalog';

export interface UsageStatus {
  plan: string;
  fourHourSpend: number | null;
  fourHourLimit: number | null;
  monthlySpend: number | null;
  monthlyLimit: number | null;
}

export interface SubscriptionInfo {
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  cancelAt: string | null;
}

export interface UserProfile {
  fullName: string | null;
  email: string | null;
  createdAt: string | undefined;
  tier: string;
  usageStatus: UsageStatus | null;
  upgradeUrl: string | null;
  subscription: SubscriptionInfo | null;
}

let hasLoggedMissingUsageStatusRpc = false;
let profileEndpointUnavailable = false;
let hasLoggedMissingProfileEndpoint = false;
let inFlightUserProfilePromise: Promise<UserProfile | null> | null = null;
let cachedUserProfile: UserProfile | null = null;
let cachedUserProfileUserId: string | null = null;

/**
 * Helper to get the current user's session token for backend proxy calls
 */
const getAuthHeaders = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session?.access_token}`
  };
};

const normalizeSubscriptionInfo = (profile: any): SubscriptionInfo | null => {
  const status = typeof profile?.stripe_subscription_status === 'string' && profile.stripe_subscription_status.trim()
    ? profile.stripe_subscription_status.trim()
    : null;
  const currentPeriodEnd = typeof profile?.stripe_current_period_end === 'string' && profile.stripe_current_period_end.trim()
    ? profile.stripe_current_period_end.trim()
    : null;
  const cancelAt = typeof profile?.stripe_cancel_at === 'string' && profile.stripe_cancel_at.trim()
    ? profile.stripe_cancel_at.trim()
    : null;
  const cancelAtPeriodEnd = Boolean(profile?.stripe_cancel_at_period_end);

  if (!status && !currentPeriodEnd && !cancelAt && !cancelAtPeriodEnd) {
    return null;
  }

  return {
    status,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    cancelAt,
  };
};

const buildFallbackUserProfile = (user: any, usageStatus: UsageStatus | null): UserProfile => ({
  fullName: user.user_metadata?.full_name || null,
  email: user.email ?? null,
  createdAt: user.created_at,
  tier: normalizeTier(usageStatus?.plan) || 'FREE',
  usageStatus,
  upgradeUrl: null,
  subscription: null,
});

export const dbService = {
  async fetchConversations() {
    const response = await fetch(`${API_BASE_URL}/api/db/conversations`, {
      headers: await getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch conversations');
    return response.json();
  },

  async fetchUsageStatus(): Promise<UsageStatus | null> {
    try {
      const { data, error } = await supabase.rpc('usage_get_status').single();

      if (error) {
        const isMissingRpc =
          typeof error.message === 'string' &&
          error.message.includes('Could not find the function public.usage_get_status');

        if (!isMissingRpc) {
          console.warn('[DB] Usage status fetch encountered error:', error.message);
        } else if (!hasLoggedMissingUsageStatusRpc) {
          console.info('[DB] usage_get_status RPC is not installed yet; continuing without cap data.');
          hasLoggedMissingUsageStatusRpc = true;
        }
        return null;
      }

      return {
        plan: normalizeTier(data?.plan),
        fourHourSpend: data?.four_hour_spend == null ? null : Number(data.four_hour_spend),
        fourHourLimit: data?.four_hour_limit == null ? null : Number(data.four_hour_limit),
        monthlySpend: data?.monthly_spend == null ? null : Number(data.monthly_spend),
        monthlyLimit: data?.monthly_limit == null ? null : Number(data.monthly_limit),
      };
    } catch (e: any) {
      console.error('[DB] Usage status hydration failed:', e.message);
      return null;
    }
  },

  invalidateUserProfileCache() {
    cachedUserProfile = null;
    cachedUserProfileUserId = null;
    inFlightUserProfilePromise = null;
  },

  async fetchUserProfile(options: { force?: boolean } = {}): Promise<UserProfile | null> {
    const force = Boolean(options.force);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      this.invalidateUserProfileCache();
      return null;
    }

    if (cachedUserProfileUserId && cachedUserProfileUserId !== user.id) {
      this.invalidateUserProfileCache();
    }

    if (!force && cachedUserProfile && cachedUserProfileUserId === user.id) {
      return cachedUserProfile;
    }

    if (!force && inFlightUserProfilePromise) {
      return inFlightUserProfilePromise;
    }

    inFlightUserProfilePromise = (async () => {
      if (profileEndpointUnavailable) {
        return buildFallbackUserProfile(user, await this.fetchUsageStatus());
      }

      try {
        const [usageStatus, profileRes] = await Promise.all([
          this.fetchUsageStatus(),
          fetch(`${API_BASE_URL}/api/user/profile`, {
            headers: await getAuthHeaders(),
          }),
        ]);

        if (!profileRes.ok) {
          if (profileRes.status === 404) {
            profileEndpointUnavailable = true;
            if (!hasLoggedMissingProfileEndpoint) {
              console.info('[DB] /api/user/profile endpoint is missing; using Supabase user metadata.');
              hasLoggedMissingProfileEndpoint = true;
            }

            return buildFallbackUserProfile(user, usageStatus);
          }

          throw new Error(`Failed to fetch profile (${profileRes.status})`);
        }

        const profile = await profileRes.json();

        return {
          fullName: profile?.full_name ?? user.user_metadata?.full_name ?? null,
          email: profile?.email ?? user.email ?? null,
          createdAt: profile?.created_at ?? user.created_at,
          tier: normalizeTier(profile?.tier || usageStatus?.plan),
          usageStatus,
          upgradeUrl: typeof profile?.upgrade_url === 'string' && profile.upgrade_url.trim() ? profile.upgrade_url.trim() : null,
          subscription: normalizeSubscriptionInfo(profile),
        };
      } catch (e: any) {
        console.warn('[DB] Profile hydration failed:', e.message);
        return buildFallbackUserProfile(user, await this.fetchUsageStatus());
      }
    })();

    try {
      cachedUserProfile = await inFlightUserProfilePromise;
      cachedUserProfileUserId = user.id;
      return cachedUserProfile;
    } finally {
      inFlightUserProfilePromise = null;
    }
  },

  async fetchConversationDetail(conversationId: string): Promise<{
    nodes: Record<string, ChatNode>;
    branchLines: BranchMetadata[];
  }> {
    const response = await fetch(`${API_BASE_URL}/api/db/conversations/${conversationId}`, {
      headers: await getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch conversation detail');

    const { nodes: nodesData, messages: msgsData } = await response.json();

    const nodes: Record<string, ChatNode> = {};
    nodesData.forEach((n: any) => {
      nodes[n.id] = {
        id: n.id,
        hierarchicalID: n.hierarchical_id,
        parentId: n.parent_id,
        title: n.title || '...',
        timestamp: new Date(n.created_at).getTime(),
        isBranch: n.is_branch,
        messages: msgsData
          .filter((m: any) => m.nodes_id === n.id)
          .map((m: any) => {
            const decodedContent = decodeMessageContent(m.content);
            const parsedCost = m.cost == null ? undefined : Number(m.cost);
            const parsedIoTokens = m.i_o_tokens == null ? undefined : Number(m.i_o_tokens);
            return {
              id: m.id,
              role: m.role as 'user' | 'model',
              content: decodedContent.content,
              thinkingTrace: decodedContent.thinkingTrace,
              citations: decodedContent.citations,
              timestamp: new Date(m.created_at).getTime(),
              ordinal: m.ordinal,
              ioTokens: Number.isFinite(parsedIoTokens) ? parsedIoTokens : undefined,
              cost: Number.isFinite(parsedCost) ? parsedCost : undefined,
              model: typeof m.model === 'string' ? m.model : undefined,
              provider: typeof m.provider === 'string' ? m.provider : undefined
            };
          }),
        childrenIds: nodesData
          .filter((child: any) => child.parent_id === n.id)
          .map((child: any) => child.id),
        branchMessageId: n.branch_message_id,
        branchBlockIndex: n.branch_block_index ?? null,
        branchRelativeYInBlock: n.branch_relative_y_in_block ?? null,
        branchMsgRelativeY: n.branch_msg_relative_y ?? null,
      };
    });

    const branchLines: BranchMetadata[] = nodesData
      .filter((n: any) =>
        n.is_branch &&
        n.branch_message_id !== null &&
        n.branch_block_index !== null &&
        n.branch_relative_y_in_block !== null &&
        n.branch_msg_relative_y !== null
      )
      .map((n: any) => ({
        messageId: n.branch_message_id as string,
        blockId: `block-${n.branch_block_index}-restored`,
        blockIndex: n.branch_block_index as number,
        relativeYInBlock: n.branch_relative_y_in_block as number,
        textSnippet: '',
        msgRelativeY: n.branch_msg_relative_y as number,
        targetNodeId: n.id,
      }));

    return { nodes, branchLines };
  },

  async createConversation(title: string) {
    // Standard Supabase Auth is required for the user handle
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const response = await fetch(`${API_BASE_URL}/api/db/conversations`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ title, user_id: user.id })
    });
    // For now, let's simplify and assume the endpoint exists or we add it
    // Wait, I missed adding the POST conversations endpoint. Let me fix the server first.
    return response.json();
  },

  async createNode(payload: any) {
    const response = await fetch(`${API_BASE_URL}/api/db/nodes`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error('Failed to create node');
    return response.json();
  },

  async createMessage(payload: any) {
    const { thinkingTrace, citations, ...restPayload } = payload;
    const encodedPayload = {
      ...restPayload,
      content: encodeMessageContent({
        content: payload.content ?? '',
        thinkingTrace,
        citations
      })
    };

    const response = await fetch(`${API_BASE_URL}/api/db/messages`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify(encodedPayload)
    });
    if (!response.ok) throw new Error('Failed to create message');
    return response.json();
  },

  async saveCompletedTurn(payload: {
    nodes_id: string;
    model: string;
    input_tokens?: number;
    output_tokens?: number;
    user_message: {
      content: string;
      ordinal: number;
    };
    model_message: {
      content: string;
      thinkingTrace?: string;
      citations?: Message['citations'];
      ordinal: number;
    };
  }) {
    const response = await fetch(`${API_BASE_URL}/api/db/messages/complete-turn`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({
        nodes_id: payload.nodes_id,
        model: payload.model,
        input_tokens: payload.input_tokens ?? 0,
        output_tokens: payload.output_tokens ?? 0,
        user_message: {
          ordinal: payload.user_message.ordinal,
          content: encodeMessageContent({
            content: payload.user_message.content ?? ''
          })
        },
        model_message: {
          ordinal: payload.model_message.ordinal,
          content: encodeMessageContent({
            content: payload.model_message.content ?? '',
            thinkingTrace: payload.model_message.thinkingTrace,
            citations: payload.model_message.citations
          })
        }
      })
    });

    if (!response.ok) throw new Error('Failed to save completed turn');
    return response.json();
  },

  async updateConversationState(id: string, updates: any) {
    const response = await fetch(`${API_BASE_URL}/api/db/conversations/${id}`, {
      method: 'PATCH',
      headers: await getAuthHeaders(),
      body: JSON.stringify(updates)
    });
    if (!response.ok) throw new Error('Failed to update conversation');
    return response.json();
  },

  async updateNodeTitle(id: string, title: string) {
    const response = await fetch(`${API_BASE_URL}/api/db/nodes/${id}`, {
      method: 'PATCH',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ title })
    });
    if (!response.ok) throw new Error('Failed to update node title');
    return response.json();
  },

  async reportBug(description: string, logs: string = "") {
    const response = await fetch(`${API_BASE_URL}/api/db/bugs`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ description, logs })
    });
    if (!response.ok) throw new Error('Failed to report bug');
    return response.json();
  },

  async deleteConversation(id: string) {
    const response = await fetch(`${API_BASE_URL}/api/db/conversations/${id}`, {
      method: 'DELETE',
      headers: await getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to delete conversation');
  }
};
