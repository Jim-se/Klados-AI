// Client is now handled by the backend proxy

// --- Helper Functions ---

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const isImageFile = (file: File): boolean => {
  return file.type.startsWith('image/');
};

// --- Main Service Functions ---

import { API_BASE_URL, getApiBaseCandidates } from './frontendConfig';
import { supabase } from './supabaseClient';
import { MessageCitation, WebSearchConfig } from '../types';

export interface ResponseStreamDelta {
  text?: string;
  reasoning?: string;
}

export interface ResponseUsage {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
}

export class ApiRequestError extends Error {
  status: number;
  data: any;
  rawText: string;

  constructor(status: number, message: string, data?: any, rawText: string = '') {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.data = data;
    this.rawText = rawText;
  }
}

export interface ResponseStreamMetadata {
  citations?: MessageCitation[];
  model?: string;
}

const toSafeTokenCount = (value: any): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.round(parsed);
};

const collectTextFragments = (value: any): string[] => {
  if (!value) return [];

  if (typeof value === 'string') {
    return value ? [value] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectTextFragments);
  }

  if (typeof value === 'object') {
    if (typeof value.text === 'string') {
      return value.text ? [value.text] : [];
    }

    if (typeof value.content === 'string') {
      return value.content ? [value.content] : [];
    }

    if (Array.isArray(value.content)) {
      return value.content.flatMap(collectTextFragments);
    }

    if (value.summary) {
      return collectTextFragments(value.summary);
    }

    if (value.part) {
      return collectTextFragments(value.part);
    }
  }

  return [];
};

const normalizeUrlCitation = (annotation: any, text: string): MessageCitation | null => {
  if (!annotation || typeof annotation !== 'object') {
    return null;
  }

  if (annotation.type !== 'url_citation' || typeof annotation.url !== 'string') {
    return null;
  }

  const startIndex = Number(annotation.start_index ?? annotation.startIndex);
  const endIndex = Number(annotation.end_index ?? annotation.endIndex);
  const hasValidRange =
    Number.isFinite(startIndex) &&
    Number.isFinite(endIndex) &&
    startIndex >= 0 &&
    endIndex > startIndex;

  return {
    type: 'url_citation',
    url: annotation.url,
    startIndex: hasValidRange ? startIndex : undefined,
    endIndex: hasValidRange ? endIndex : undefined,
    title: typeof annotation.title === 'string' ? annotation.title : undefined,
    text: hasValidRange ? text.slice(startIndex, endIndex) : undefined,
  };
};

const extractResponseMetadata = (payload: any): ResponseStreamMetadata | null => {
  const response = payload?.response;
  if (!response || typeof response !== 'object') {
    return null;
  }

  const outputItems = Array.isArray(response.output) ? response.output : [];
  const messageOutput = outputItems.find((item: any) => item?.type === 'message');
  const contentItems = Array.isArray(messageOutput?.content) ? messageOutput.content : [];
  const textContent = contentItems.find((item: any) => item?.type === 'output_text');
  const text = typeof textContent?.text === 'string' ? textContent.text : '';
  const citations = Array.isArray(textContent?.annotations)
    ? textContent.annotations
      .map((annotation: any) => normalizeUrlCitation(annotation, text))
      .filter((annotation: MessageCitation | null): annotation is MessageCitation => Boolean(annotation))
    : [];

  return {
    citations: citations.length > 0 ? citations : undefined,
    model: typeof response.model === 'string' ? response.model : undefined,
  };
};

const extractResponseDeltas = (
  payload: any,
  options?: {
    allowReasoning?: boolean;
  }
): ResponseStreamDelta[] => {
  const deltas: ResponseStreamDelta[] = [];
  const allowReasoning = Boolean(options?.allowReasoning);

  if (payload?.type === 'response.output_text.delta' && typeof payload.delta === 'string') {
    deltas.push({ text: payload.delta });
  }

  if (
    allowReasoning &&
    (payload?.type === 'response.reasoning_text.delta' ||
      payload?.type === 'response.reasoning_summary_text.delta') &&
    typeof payload.delta === 'string'
  ) {
    deltas.push({ reasoning: payload.delta });
  }

  const choice = payload?.choices?.[0];
  const choiceDelta = choice?.delta ?? choice?.message ?? payload?.delta;

  if (choiceDelta) {
    collectTextFragments(choiceDelta.content).forEach((text) => deltas.push({ text }));

    if (allowReasoning) {
      collectTextFragments(choiceDelta.reasoning).forEach((reasoning) => deltas.push({ reasoning }));
      collectTextFragments(choiceDelta.reasoning_content).forEach((reasoning) => deltas.push({ reasoning }));
      collectTextFragments(choiceDelta.reasoningDetails).forEach((reasoning) => deltas.push({ reasoning }));
      collectTextFragments(choiceDelta.reasoning_details).forEach((reasoning) => deltas.push({ reasoning }));
    }
  }

  return deltas;
};

const extractResponseUsage = (payload: any): ResponseUsage | null => {
  const usage = payload?.usage ?? payload?.response?.usage;
  if (!usage || typeof usage !== 'object') {
    return null;
  }

  const hasUsageFields = [
    'prompt_tokens',
    'completion_tokens',
    'total_tokens',
    'input_tokens',
    'output_tokens',
    'reasoning_tokens',
    'promptTokens',
    'completionTokens',
    'totalTokens',
    'inputTokens',
    'outputTokens',
    'reasoningTokens'
  ].some((field) => field in usage) || Boolean(
    usage.output_tokens_details ??
    usage.outputTokensDetails ??
    usage.completion_tokens_details ??
    usage.completionTokensDetails
  );

  if (!hasUsageFields) {
    return null;
  }

  const inputTokens = toSafeTokenCount(
    usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokens ?? usage.inputTokens
  );
  const outputTokens = toSafeTokenCount(
    usage.completion_tokens ?? usage.output_tokens ?? usage.completionTokens ?? usage.outputTokens
  );
  const reasoningTokens = toSafeTokenCount(
    usage.reasoning_tokens ??
    usage.reasoningTokens ??
    usage.output_tokens_details?.reasoning_tokens ??
    usage.outputTokensDetails?.reasoningTokens ??
    usage.completion_tokens_details?.reasoning_tokens ??
    usage.completionTokensDetails?.reasoningTokens
  );

  return {
    inputTokens,
    outputTokens,
    reasoningTokens,
    totalTokens: toSafeTokenCount(
      usage.total_tokens ?? usage.totalTokens ?? inputTokens + outputTokens
    ),
  };
};

export const generateResponse = async (
  prompt: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  files: File[] = [],
  modelId: string = "openai/gpt-4o",
  thinking: boolean = false,
  options?: {
    webSearch?: WebSearchConfig;
  }
) => {
  try {
    const messages: any[] = history.map(msg => ({
      role: (msg.role as string) === 'model' ? 'assistant' : msg.role,
      content: msg.content || (msg as any).parts?.[0]?.text
    }));

    let userContent: any;
    if (files.length > 0) {
      const contentParts: any[] = [];
      if (prompt.trim()) {
        contentParts.push({ type: "text", text: prompt });
      }

      for (const file of files) {
        if (isImageFile(file)) {
          const base64Data = await fileToBase64(file);
          contentParts.push({
            type: "image_url",
            image_url: { url: `data:${file.type};base64,${base64Data}` }
          });
        }
      }
      userContent = contentParts;
    } else {
      userContent = prompt;
    }

    messages.push({ role: 'user', content: userContent });

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const fetchProxyWithFallback = async (
      path: string,
      requestBody: any,
      retryStatuses: number[] = [404]
    ) => {
      const apiBases = getApiBaseCandidates();
      let lastResponse: Response | null = null;
      let lastError: unknown = null;

      for (let index = 0; index < apiBases.length; index += 1) {
        const baseUrl = apiBases[index];

        try {
          const response = await fetch(`${baseUrl}${path}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(requestBody),
          });

          lastResponse = response;

          if (!response.ok && retryStatuses.includes(response.status) && index < apiBases.length - 1) {
            continue;
          }

          return response;
        } catch (error) {
          lastError = error;
          if (index < apiBases.length - 1) {
            continue;
          }
        }
      }

      if (lastResponse) {
        return lastResponse;
      }

      throw lastError instanceof Error ? lastError : new Error(`Failed to reach ${path} via ${API_BASE_URL}`);
    };

    const sendChatRequest = async (requestBody: any) => {
      return fetchProxyWithFallback('/api/openrouter/chat', requestBody, [404, 502, 503, 504]);
    };

    const sendResponsesRequest = async (requestBody: any) => {
      return fetchProxyWithFallback('/api/openrouter/responses', requestBody, [404, 502, 503, 504]);
    };

    const buildResponsesInput = async () => {
      const responseInput: any[] = history.map((msg) => ({
        type: 'message',
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content
      }));

      if (files.length > 0) {
        const contentParts: any[] = [];

        if (prompt.trim()) {
          contentParts.push({ type: 'input_text', text: prompt });
        }

        for (const file of files) {
          if (isImageFile(file)) {
            const base64Data = await fileToBase64(file);
            contentParts.push({
              type: 'input_image',
              detail: 'auto',
              image_url: `data:${file.type};base64,${base64Data}`
            });
          }
        }

        responseInput.push({
          type: 'message',
          role: 'user',
          content: contentParts
        });
      } else {
        responseInput.push({
          type: 'message',
          role: 'user',
          content: prompt
        });
      }

      return responseInput;
    };

    const webSearch = options?.webSearch?.enabled ? options.webSearch : undefined;
    const defaultMaxTokens = 1024;
    const baseRequestBody: any = {
      model: modelId,
      messages,
      max_tokens: defaultMaxTokens,
      stream: true,
      stream_options: { include_usage: true }
    };
    const fullReasoningBody = {
      ...baseRequestBody,
      include_reasoning: true,
      reasoning: { effort: 'medium', summary: 'auto' }
    };
    const lightReasoningBody = {
      ...baseRequestBody,
      include_reasoning: true
    };

    const responseInput = webSearch ? await buildResponsesInput() : null;
    const baseResponsesBody: any = responseInput
      ? {
        model: modelId,
        input: responseInput,
        stream: true,
        max_output_tokens: 9000,
        plugins: [
          {
            id: 'web',
            max_results: options?.webSearch?.maxResults ?? 5,
            ...(options?.webSearch?.engine ? { engine: options.webSearch.engine } : {})
          }
        ]
      }
      : null;
    const fullReasoningResponsesBody = baseResponsesBody
      ? {
        ...baseResponsesBody,
        reasoning: { enabled: true, effort: 'medium', summary: 'auto' }
      }
      : null;
    const lightReasoningResponsesBody = baseResponsesBody
      ? {
        ...baseResponsesBody,
        reasoning: { enabled: true }
      }
      : null;

    let response: Response;
    if (baseResponsesBody) {
      response = await sendResponsesRequest(thinking ? fullReasoningResponsesBody : baseResponsesBody);

      if (!response.ok && thinking && response.status === 400) {
        console.warn(`OpenRouter rejected detailed reasoning params for ${modelId} via Responses API. Retrying with reasoning enabled only.`);
        response = await sendResponsesRequest(lightReasoningResponsesBody);
      }

      if (!response.ok && thinking && response.status === 400) {
        console.warn(`OpenRouter rejected reasoning params for ${modelId} via Responses API. Retrying without reasoning traces.`);
        response = await sendResponsesRequest(baseResponsesBody);
      }
    } else {
      response = await sendChatRequest(thinking ? fullReasoningBody : baseRequestBody);
      if (!response.ok && thinking && response.status === 400) {
        console.warn(`OpenRouter rejected detailed reasoning params for ${modelId}. Retrying with include_reasoning only.`);
        response = await sendChatRequest(lightReasoningBody);
      }

      if (!response.ok && thinking && response.status === 400) {
        console.warn(`OpenRouter rejected reasoning params for ${modelId}. Retrying without reasoning traces.`);
        response = await sendChatRequest(baseRequestBody);
      }
    }

    if (!response.ok) {
      const contentType = response.headers.get('content-type') || '';
      let errorText = '';
      let errorData: any = null;

      if (contentType.includes('application/json')) {
        errorData = await response.json().catch(() => null);
      } else {
        errorText = await response.text().catch(() => '');
      }

      if (!errorText && errorData) {
        try {
          errorText = JSON.stringify(errorData);
        } catch {
          errorText = String(errorData);
        }
      }

      if (
        webSearch &&
        response.status === 404 &&
        /Cannot POST \/api\/openrouter\/responses/i.test(errorText)
      ) {
        throw new ApiRequestError(
          404,
          'Web search requires a newer backend route.',
          {
            code: 'WEB_SEARCH_ROUTE_MISSING',
            error: 'The connected backend does not expose /api/openrouter/responses yet. Deploy the latest server or point VITE_API_URL at a backend that includes the web-search proxy route.',
          },
          errorText
        );
      }

      throw new ApiRequestError(
        response.status,
        `Proxy Error: ${response.status}${errorText ? ` - ${errorText}` : ''}`,
        errorData,
        errorText
      );
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let streamConsumed = false;
    let latestUsage: ResponseUsage | null = null;
    let latestMetadata: ResponseStreamMetadata | null = null;

    return {
      getDeltaStream: async function* () {
        if (!reader) return;
        if (streamConsumed) {
          throw new Error('OpenRouter stream has already been consumed.');
        }

        streamConsumed = true;
        let buffer = '';

        const processEventBlock = (eventBlock: string): {
          deltas: ResponseStreamDelta[];
          usage: ResponseUsage | null;
          metadata: ResponseStreamMetadata | null;
        } => {
          const data = eventBlock
            .split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
            .join('\n')
            .trim();

          if (!data || data === '[DONE]') {
            return { deltas: [], usage: null, metadata: null };
          }

          try {
            const parsed = JSON.parse(data);
            return {
              deltas: extractResponseDeltas(parsed, { allowReasoning: thinking }),
              usage: extractResponseUsage(parsed),
              metadata: extractResponseMetadata(parsed)
            };
          } catch {
            return { deltas: [], usage: null, metadata: null };
          }
        };

        try {
          while (true) {
            const { done, value } = await reader.read();
            buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

            const eventBlocks = buffer.split(/\r?\n\r?\n/);
            buffer = eventBlocks.pop() ?? '';

            for (const eventBlock of eventBlocks) {
              const { deltas, usage, metadata } = processEventBlock(eventBlock);
              if (usage) {
                latestUsage = usage;
              }
              if (metadata) {
                latestMetadata = metadata;
              }

              for (const delta of deltas) {
                yield delta;
              }
            }

            if (done) {
              break;
            }
          }

          if (buffer.trim()) {
            const { deltas, usage, metadata } = processEventBlock(buffer);
            if (usage) {
              latestUsage = usage;
            }
            if (metadata) {
              latestMetadata = metadata;
            }

            for (const delta of deltas) {
              yield delta;
            }
          }
        } finally {
          reader.releaseLock();
        }
      },
      getTextStream: async function* () {
        for await (const delta of this.getDeltaStream()) {
          if (delta.text) yield delta.text;
        }
      },
      getUsage: () => latestUsage,
      getMetadata: () => latestMetadata,
      cancel: () => reader?.cancel()
    };

  } catch (error: any) {
    console.error("❌ Proxy OpenRouter API Error:", error);
    throw error;
  }
};

export const generateTitle = async (
  userMessage: string,
  aiResponse: string,
  modelName: string
) => {
  try {
    const messages = [
      { role: "system", content: "Summarize this into a 3-word title. No quotes." },
      { role: "user", content: `User: ${userMessage.slice(0, 200)}\nAI: ${aiResponse.slice(0, 200)}` }
    ];

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const response = await fetch(`${API_BASE_URL}/api/openrouter/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ model: modelName, messages })
    });

    if (!response.ok) throw new Error(`Proxy Error: ${response.status}`);

    const data = await response.json();
    const rawTitle = data.choices?.[0]?.message?.content?.trim() || "";
    return sanitizeShortLabel(rawTitle, {
      maxWords: 5,
      fallback: sanitizeShortLabel(userMessage, { maxWords: 5, fallback: "New Chat" }),
    });

  } catch (error) {
    console.error("Title generation failed:", error);
    return sanitizeShortLabel(userMessage, {
      maxWords: 5,
      fallback: "New Discussion",
    });
  }
};

const sanitizeShortLabel = (value: string, options?: { maxWords?: number; fallback?: string }) => {
  const maxWords = options?.maxWords ?? 6;
  const fallback = options?.fallback ?? "New branch";
  const cleaned = value
    .replace(/["'#*.,!?()[\]{}:;\\/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(" ").filter(Boolean).slice(0, maxWords);
  return words.length > 0 ? words.join(" ") : fallback;
};

const buildBranchLabelFallback = (userMessage: string, aiResponse: string) => {
  return sanitizeShortLabel(userMessage || aiResponse, {
    maxWords: 6,
    fallback: "New branch",
  });
};

export const generateBranchLabel = async (
  userMessage: string,
  aiResponse: string,
  modelName: string
) => {
  try {
    const messages = [
      {
        role: "system",
        content: "Write one very simple 4 to 6 word branch label. Casual, clear, easy to scan. No quotes. No punctuation. Not formal.",
      },
      { role: "user", content: `User: ${userMessage.slice(0, 260)}\nAI: ${aiResponse.slice(0, 260)}` }
    ];

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const response = await fetch(`${API_BASE_URL}/api/openrouter/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ model: modelName, messages })
    });

    if (!response.ok) throw new Error(`Proxy Error: ${response.status}`);

    const data = await response.json();
    const rawLabel = data.choices?.[0]?.message?.content?.trim() || "";
    return sanitizeShortLabel(rawLabel, {
      maxWords: 6,
      fallback: buildBranchLabelFallback(userMessage, aiResponse),
    });
  } catch (error) {
    console.error("Branch label generation failed:", error);
    return buildBranchLabelFallback(userMessage, aiResponse);
  }
};
