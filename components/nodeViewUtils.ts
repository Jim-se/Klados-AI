import { Message } from '../types';

export interface ExtractedHeading {
  text: string;
  depth: number;
  number?: number;
}

export interface NodeMessageSummary {
  anchorOrdinal: number;
  promptOrdinal?: number;
  responseOrdinal?: number;
  title: string;
  headings: ExtractedHeading[];
}

export const stripMarkdown = (text: string): string => {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .trim();
};

export const extractHeadingsFromContent = (content: string): ExtractedHeading[] => {
  const headings: ExtractedHeading[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    const hashMatch = trimmed.match(/^(#{1,4})\s+(.+)/);
    if (hashMatch) {
      headings.push({ depth: hashMatch[1].length, text: stripMarkdown(hashMatch[2].trim()) });
      continue;
    }

    const numberedBoldMatch = trimmed.match(/^(\d+)\.\s+\*\*(.+?)\*\*:?$/);
    if (numberedBoldMatch) {
      headings.push({
        depth: 2,
        number: parseInt(numberedBoldMatch[1], 10),
        text: stripMarkdown(numberedBoldMatch[2].trim()),
      });
      continue;
    }

    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.+?)\s*:?$/);
    if (numberedMatch) {
      headings.push({
        depth: 3,
        number: parseInt(numberedMatch[1], 10),
        text: stripMarkdown(numberedMatch[2].trim()),
      });
      continue;
    }

    const boldOnlyMatch = trimmed.match(/^\*\*(.+?)\*\*:?$/);
    if (boldOnlyMatch) {
      headings.push({ depth: 1, text: stripMarkdown(boldOnlyMatch[1].trim()) });
    }
  }

  return headings;
};

const getFallbackTitle = (content: string, role: Message['role']) => {
  const firstLine = content
    .split('\n')
    .map((line) => stripMarkdown(line))
    .find((line) => line.trim().length > 0);

  if (firstLine) {
    return firstLine.length > 72 ? `${firstLine.slice(0, 72).trim()}…` : firstLine;
  }

  return role === 'user' ? 'Untitled prompt' : 'Untitled response';
};

export const buildNodeMessageSummaries = (messages: Message[]): NodeMessageSummary[] => {
  const orderedMessages = [...messages].sort((left, right) => left.ordinal - right.ordinal);
  const summaries: NodeMessageSummary[] = [];
  let pendingPrompt: Message | null = null;
  const MAX_HEADINGS = 12;

  orderedMessages.forEach((message) => {
    if (message.role === 'user') {
      if (pendingPrompt) {
        const promptHeadings = extractHeadingsFromContent(pendingPrompt.content).slice(0, MAX_HEADINGS);
        summaries.push({
          anchorOrdinal: pendingPrompt.ordinal,
          promptOrdinal: pendingPrompt.ordinal,
          title: promptHeadings[0]?.text || getFallbackTitle(pendingPrompt.content, pendingPrompt.role),
          headings: promptHeadings,
        });
      }

      pendingPrompt = message;
      return;
    }

    const responseHeadings = extractHeadingsFromContent(message.content).slice(0, MAX_HEADINGS);
    summaries.push({
      anchorOrdinal: pendingPrompt?.ordinal ?? message.ordinal,
      promptOrdinal: pendingPrompt?.ordinal,
      responseOrdinal: message.ordinal,
      title: responseHeadings[0]?.text || getFallbackTitle(message.content, message.role),
      headings: responseHeadings,
    });
    pendingPrompt = null;
  });

  if (pendingPrompt) {
    const promptHeadings = extractHeadingsFromContent(pendingPrompt.content).slice(0, MAX_HEADINGS);
    summaries.push({
      anchorOrdinal: pendingPrompt.ordinal,
      promptOrdinal: pendingPrompt.ordinal,
      title: promptHeadings[0]?.text || getFallbackTitle(pendingPrompt.content, pendingPrompt.role),
      headings: promptHeadings,
    });
  }

  return summaries;
};

export const estimateNodeCardHeight = (messages: Message[]) => {
  const summaries = buildNodeMessageSummaries(messages);
  const stackHeight = summaries.reduce((total, summary) => {
    return total + 86 + summary.headings.length * 18;
  }, 0);

  return Math.max(220, 118 + stackHeight + Math.max(0, summaries.length - 1) * 10);
};
