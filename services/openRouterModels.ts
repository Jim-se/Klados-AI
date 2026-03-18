import { ModelOption } from '../types';
import { getApiBaseCandidates } from './frontendConfig';
import { supabase } from './supabaseClient';

export const DEFAULT_OPENROUTER_MODELS: ModelOption[] = [
  {
    id: 'arcee-ai/trinity-large-preview:free',
    name: 'Trinity Large (Free)',
    provider: 'arcee',
    description: 'Advanced preview model from Arcee AI.',
    isPremium: false,
    isFree: true,
    supportsWebSearch: false,
    webSearchModelId: null,
    smartLoading: false,
  },
  {
    id: 'openai/gpt-5.3',
    name: 'GPT 5.3',
    provider: 'openai',
    description: 'Next-generation reasoning model with strong tool support.',
    isPremium: true,
    supportsThinkingTrace: true,
    supportsWebSearch: true,
    webSearchModelId: 'openai/gpt-5.3',
    smartLoading: true,
  },
  {
    id: 'openai/gpt-5.2',
    name: 'GPT 5.2',
    provider: 'openai',
    description: 'Efficient high-end model for fast, capable responses.',
    isPremium: true,
    supportsThinkingTrace: true,
    supportsWebSearch: true,
    webSearchModelId: 'openai/gpt-5.2',
    smartLoading: true,
  },
  {
    id: 'google/gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro',
    provider: 'google',
    description: 'Multimodal flagship with advanced planning and broad context.',
    isPremium: true,
    supportsWebSearch: true,
    webSearchModelId: 'google/gemini-3.1-pro-preview',
    smartLoading: true,
  },
  {
    id: 'google/gemini-3-flash-preview',
    name: 'Gemini 3 Flash',
    provider: 'google',
    description: 'Fast multimodal model for lightweight chats and lookups.',
    isPremium: false,
    supportsWebSearch: true,
    webSearchModelId: 'google/gemini-3-flash-preview',
    smartLoading: false,
  },
  {
    id: 'anthropic/claude-4.6-sonnet',
    name: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    description: 'Balanced coding and reasoning model with strong writing quality.',
    isPremium: true,
    supportsWebSearch: true,
    webSearchModelId: 'anthropic/claude-4.6-sonnet',
    smartLoading: true,
  },
  {
    id: 'anthropic/claude-4.6-opus',
    name: 'Claude Opus 4.6',
    provider: 'anthropic',
    description: 'Maximum-intelligence Anthropic model for heavier work.',
    isPremium: true,
    supportsWebSearch: true,
    webSearchModelId: 'anthropic/claude-4.6-opus',
    smartLoading: true,
  },
  {
    id: 'moonshot/kimi-k2.5-thinking',
    name: 'Kimi K2.5 Thinking',
    provider: 'moonshot',
    description: 'Extended chain-of-thought processing for longer reasoning tasks.',
    isPremium: true,
    thinkingOnly: true,
    supportsThinkingTrace: true,
    supportsWebSearch: false,
    webSearchModelId: null,
    smartLoading: true,
  },
  {
    id: 'zhipu/glm-5',
    name: 'GLM 5',
    provider: 'zhipu',
    description: 'Advanced bilingual language model.',
    isPremium: true,
    supportsWebSearch: false,
    webSearchModelId: null,
    smartLoading: true,
  },
];

let openRouterCatalogUnavailable = false;
let hasLoggedMissingOpenRouterCatalog = false;
let openRouterModelsPromise: Promise<ModelOption[]> | null = null;

const getAuthHeaders = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session?.access_token}`,
  };
};

const normalizeProvider = (provider: string | null | undefined) => {
  if (!provider) {
    return 'other';
  }

  return provider.toLowerCase();
};

const sortModels = (models: ModelOption[]) => {
  return [...models].sort((left, right) => {
    if (left.supportsWebSearch !== right.supportsWebSearch) {
      return left.supportsWebSearch ? -1 : 1;
    }

    if (left.isFree !== right.isFree) {
      return left.isFree ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });
};

export const fetchOpenRouterModels = async (): Promise<ModelOption[]> => {
  if (openRouterCatalogUnavailable) {
    return getFallbackModelCatalog();
  }

  if (openRouterModelsPromise) {
    return openRouterModelsPromise;
  }

  openRouterModelsPromise = (async () => {
  const headers = await getAuthHeaders();
  const baseCandidates = getApiBaseCandidates();
  let lastError: Error | null = null;

  for (let index = 0; index < baseCandidates.length; index += 1) {
    const baseUrl = baseCandidates[index];

    try {
      const response = await fetch(`${baseUrl}/api/openrouter/models`, { headers });

      if (!response.ok) {
        if (response.status === 404) {
          // Older backends will not expose the catalog endpoint yet.
          if (index < baseCandidates.length - 1) {
            continue;
          }
          openRouterCatalogUnavailable = true;
          if (!hasLoggedMissingOpenRouterCatalog) {
            console.info('[Models] /api/openrouter/models endpoint is missing; using fallback catalog.');
            hasLoggedMissingOpenRouterCatalog = true;
          }
          return getFallbackModelCatalog();
        }

        throw new Error(`Failed to fetch OpenRouter models (${response.status})`);
      }

      const data = await response.json();
      const models = Array.isArray(data?.models) ? data.models : [];

      return sortModels(
        models.map((model: any) => ({
          id: typeof model.id === 'string' ? model.id : '',
          name: typeof model.name === 'string' ? model.name : model.id,
          provider: normalizeProvider(model.provider),
          description: typeof model.description === 'string' ? model.description : 'No description available.',
          isPremium: !Boolean(model.isFree),
          isFree: Boolean(model.isFree),
          thinkingOnly: Boolean(model.thinkingOnly),
          supportsThinkingTrace: Boolean(model.supportsThinkingTrace),
          supportsWebSearch: Boolean(model.supportsWebSearch),
          webSearchModelId: typeof model.webSearchModelId === 'string' ? model.webSearchModelId : null,
          smartLoading: Boolean(model.smartLoading),
          contextLength: typeof model.contextLength === 'number' ? model.contextLength : null,
          isOnlineVariant: Boolean(model.isOnlineVariant),
        })).filter((model: ModelOption) => Boolean(model.id))
      );
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (index < baseCandidates.length - 1) {
        continue;
      }
    }
  }

  throw lastError ?? new Error('Failed to fetch OpenRouter models');
  })();

  try {
    return await openRouterModelsPromise;
  } catch (error) {
    openRouterModelsPromise = null;
    throw error;
  }
};

export const getFallbackModelCatalog = () => sortModels(DEFAULT_OPENROUTER_MODELS);

export const getWebSearchReadyModelCount = (models: ModelOption[]) => {
  return models.filter((model) => model.supportsWebSearch).length;
};

export const getResolvedWebSearchModel = (
  selectedModelId: string,
  models: ModelOption[]
) => {
  const selectedModel = models.find((model) => model.id === selectedModelId);
  if (!selectedModel) {
    return null;
  }

  if (selectedModel.webSearchModelId) {
    return models.find((model) => model.id === selectedModel.webSearchModelId) ?? selectedModel;
  }

  return null;
};

export const getPreferredWebSearchModel = (
  models: ModelOption[],
  options?: {
    preferredModelIds?: string[];
  }
) => {
  const preferredIds = options?.preferredModelIds ?? [];

  return (
    preferredIds
      .map((modelId) => models.find((model) => model.id === modelId && model.supportsWebSearch))
      .find((model): model is ModelOption => Boolean(model)) ??
    models.find((model) => model.isFree && model.supportsWebSearch) ??
    models.find((model) => model.supportsWebSearch) ??
    models[0] ??
    null
  );
};
