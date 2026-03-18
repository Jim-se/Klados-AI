import type { ModelOption } from '../types';

export const DEFAULT_FREE_MODEL_ID = 'arcee-ai/trinity-large-preview:free';

export const MODEL_OPTIONS: ModelOption[] = [
  { id: 'arcee-ai/trinity-large-preview:free', name: 'Trinity Large (Free)', provider: 'arcee', description: 'Advanced preview model from Arcee AI', isPremium: false, smartLoading: false },
  { id: 'openai/gpt-5.3', name: 'GPT 5.3', provider: 'openai', description: 'Next-generation reasoning model with unprecedented scale', isPremium: true, supportsThinkingTrace: true, smartLoading: true },
  { id: 'openai/gpt-5.2', name: 'GPT 5.2', provider: 'openai', description: 'Highly efficient, ultra-intelligent foundation model', isPremium: true, supportsThinkingTrace: true, smartLoading: true },
  { id: 'google/gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', provider: 'google', description: 'Multimodal flagship with advanced logical planning', isPremium: true, smartLoading: true },
  { id: 'google/gemini-3-flash-preview', name: 'Gemini 3 Flash', provider: 'google', description: 'Ultrafast response with broad knowledge base', isPremium: false, smartLoading: false },
  { id: 'anthropic/claude-4.6-sonnet', name: 'Claude Sonnet 4.6', provider: 'anthropic', description: 'State-of-the-art coding and creative assistance', isPremium: true, smartLoading: true },
  { id: 'anthropic/claude-4.6-opus', name: 'Claude Opus 4.6', provider: 'anthropic', description: 'Maximum intelligence for complex scientific tasks', isPremium: true, smartLoading: true },
  { id: 'moonshot/kimi-k2.5-thinking', name: 'Kimi K2.5 Thinking', provider: 'moonshot', description: 'Extended chain-of-thought processing', isPremium: true, thinkingOnly: true, supportsThinkingTrace: true, smartLoading: true },
  { id: 'zhipu/glm-5', name: 'GLM 5', provider: 'zhipu', description: 'Advanced bilingual language model', isPremium: true, smartLoading: true },
];

export const normalizeTier = (value?: string | null) => {
  const normalized = value?.trim().toUpperCase();
  return normalized || 'FREE';
};

export const isFreeTier = (value?: string | null) => normalizeTier(value) === 'FREE';

export const isModelLockedForTier = (model: ModelOption, tier?: string | null) => (
  model.isPremium && isFreeTier(tier)
);

export const isModelIdAvailableForTier = (modelId: string, tier?: string | null) => {
  const model = MODEL_OPTIONS.find((entry) => entry.id === modelId);
  if (!model) {
    return true;
  }

  return !isModelLockedForTier(model, tier);
};

export const getFirstAvailableModelId = (tier?: string | null) => (
  MODEL_OPTIONS.find((model) => !isModelLockedForTier(model, tier))?.id ?? DEFAULT_FREE_MODEL_ID
);
