import { Message } from '../types';

const MESSAGE_CONTENT_PREFIX_V2 = '__KLADOS_MESSAGE_V2__';
const MESSAGE_CONTENT_PREFIX_V3 = '__KLADOS_MESSAGE_V3__';

type PersistedMessageContent = Pick<Message, 'content' | 'thinkingTrace' | 'citations'>;

const sanitizeCitations = (citations: unknown): Message['citations'] => {
  if (!Array.isArray(citations)) {
    return undefined;
  }

  const normalized = citations
    .map((citation) => {
      if (!citation || typeof citation !== 'object') {
        return null;
      }

      const value = citation as Record<string, unknown>;
      if (value.type !== 'url_citation' || typeof value.url !== 'string') {
        return null;
      }

      return {
        type: 'url_citation' as const,
        url: value.url,
        startIndex: typeof value.startIndex === 'number' ? value.startIndex : undefined,
        endIndex: typeof value.endIndex === 'number' ? value.endIndex : undefined,
        title: typeof value.title === 'string' ? value.title : undefined,
        text: typeof value.text === 'string' ? value.text : undefined,
      };
    })
    .filter((citation): citation is NonNullable<typeof citation> => Boolean(citation));

  return normalized.length > 0 ? normalized : undefined;
};

export const encodeMessageContent = (message: PersistedMessageContent): string => {
  if (!message.thinkingTrace?.trim() && !message.citations?.length) {
    return message.content;
  }

  return `${MESSAGE_CONTENT_PREFIX_V3}${JSON.stringify({
    content: message.content,
    thinkingTrace: message.thinkingTrace,
    citations: message.citations,
  })}`;
};

export const decodeMessageContent = (rawContent: string | null | undefined): PersistedMessageContent => {
  const safeContent = rawContent ?? '';

  if (!safeContent.startsWith(MESSAGE_CONTENT_PREFIX_V3) && !safeContent.startsWith(MESSAGE_CONTENT_PREFIX_V2)) {
    return { content: safeContent };
  }

  try {
    const prefix = safeContent.startsWith(MESSAGE_CONTENT_PREFIX_V3)
      ? MESSAGE_CONTENT_PREFIX_V3
      : MESSAGE_CONTENT_PREFIX_V2;
    const parsed = JSON.parse(safeContent.slice(prefix.length));
    return {
      content: typeof parsed?.content === 'string' ? parsed.content : '',
      thinkingTrace: typeof parsed?.thinkingTrace === 'string' ? parsed.thinkingTrace : undefined,
      citations: sanitizeCitations(parsed?.citations),
    };
  } catch {
    return { content: safeContent };
  }
};
