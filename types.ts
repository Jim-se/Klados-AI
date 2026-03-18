
export interface MessageCitation {
  type: 'url_citation';
  url: string;
  startIndex?: number;
  endIndex?: number;
  title?: string;
  text?: string;
}

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  description: string;
  isPremium: boolean;
  isFree?: boolean;
  thinkingOnly?: boolean;
  supportsThinkingTrace?: boolean;
  supportsWebSearch?: boolean;
  webSearchModelId?: string | null;
  smartLoading?: boolean;
  contextLength?: number | null;
  isOnlineVariant?: boolean;
}

export type WebSearchConfig = {
  enabled?: boolean;
  maxResults?: number;
  engine?: 'native' | 'exa' | 'firecrawl' | 'parallel';
};

export type GenerationPhase = 'idle' | 'requesting' | 'streaming';

export type GenerationStatus = {
  phase: GenerationPhase;
  modelId?: string | null;
  webSearch?: boolean;
};

/**
 * Represents a single message in a conversation.
 */
export interface Message {
  id?: string;
  role: 'user' | 'model';
  content: string;
  thinkingTrace?: string;
  citations?: MessageCitation[];
  timestamp: number;
  ioTokens?: number;
  cost?: number;
  model?: string;
  provider?: string;
  /**
   * Position within the node (0 = first, 1 = second, etc.)
   * This is critical for database sorting.
   */
  ordinal: number;
}

/**
 * Represents a "Turn" or "Branch Point" in the conversation tree.
 */
export interface ChatNode {
  id: string;
  hierarchicalID: string;       // The "Cool ID" (1.a.1)
  parentId: string | null;
  messages: Message[];
  title: string;     // AI summary
  timestamp: number;
  childrenIds: string[];
  isBranch: boolean;
  branchMessageId?: string | null;
  branchBlockIndex?: number | null;
  branchRelativeYInBlock?: number | null;
  /**
   * Anchor point within the parent message (0..1), used to place branch edges.
   * Older rows may contain pixel values; those are treated as "unknown" and fall back to center.
   */
  branchMsgRelativeY?: number | null;
}

export interface ChatState {
  nodes: Record<string, ChatNode>;
  rootNodeId: string | null;
  currentNodeId: string | null;
  viewMode: 'chat' | 'node';
}

export type SendMessageOptions = {
  modelId?: string;
  contextMode?: 'inherit' | 'none' | 'selection';
  branchParentId?: string | null;
  branchSourceOrdinal?: number | null;
  webSearch?: WebSearchConfig;
};
