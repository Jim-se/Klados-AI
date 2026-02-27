import { supabase } from './supabaseClient';
import { ChatNode, Message } from '../types';
import { BranchMetadata } from '../components/ChatView';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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

export const dbService = {
  async fetchConversations() {
    const response = await fetch(`${API_BASE_URL}/api/db/conversations`, {
      headers: await getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch conversations');
    return response.json();
  },

  async fetchUserProfile(): Promise<{ fullName: string | null; email: string | undefined; createdAt: string | undefined } | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // We can still use supabase.from('users') if we have RLS setup correctly,
    // but to be "Ultra Secure", let's assume we want to proxy this too if it contains sensitive data.
    // However, user profile is simple, so we keep the direct logic if safe.
    // For this refactor, let's keep it simple and just return the user mapping.

    // Check if we want to proxy this too... let's do it for consistency.
    try {
      const res = await supabase.from('users').select('full_name').eq('id', user.id).single();
      return {
        fullName: res.data?.full_name || null,
        email: user.email,
        createdAt: user.created_at
      };
    } catch (e) {
      return { fullName: null, email: user.email, createdAt: user.created_at };
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
          .map((m: any) => ({
            id: m.id,
            role: m.role as 'user' | 'model',
            content: m.content,
            timestamp: new Date(m.created_at).getTime(),
            ordinal: m.ordinal
          })),
        childrenIds: nodesData
          .filter((child: any) => child.parent_id === n.id)
          .map((child: any) => child.id),
        branchMessageId: n.branch_message_id
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
    const response = await fetch(`${API_BASE_URL}/api/db/messages`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error('Failed to create message');
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