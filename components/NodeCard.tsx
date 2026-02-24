import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { ChatNode } from '../types';

interface NodeCardData {
  id: string;
  onBranch: (id: string) => void;
  scale?: number;
}

const stripMarkdown = (text: string): string => {
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

const extractHeadings = (messages: { content: string }[]): { text: string; depth: number; number?: number }[] => {
  const headings: { text: string; depth: number; number?: number }[] = [];

  for (const msg of messages) {
    const lines = msg.content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();

      // 1. Markdown headings: #, ##, ###, ####
      const hashMatch = trimmed.match(/^(#{1,4})\s+(.+)/);
      if (hashMatch) {
        headings.push({ depth: hashMatch[1].length, text: stripMarkdown(hashMatch[2].trim()) });
        continue;
      }

      // 2. Numbered list items that are bold: "1. **Make the dough:**"
      const numberedBoldMatch = trimmed.match(/^(\d+)\.\s+\*\*(.+?)\*\*:?$/);
      if (numberedBoldMatch) {
        headings.push({ depth: 2, number: parseInt(numberedBoldMatch[1]), text: stripMarkdown(numberedBoldMatch[2].trim()) });
        continue;
      }

      // 3. Standalone bold-only lines: "**Ingredients:**"
      const boldOnlyMatch = trimmed.match(/^\*\*(.+?)\*\*:?$/);
      if (boldOnlyMatch) {
        headings.push({ depth: 1, text: stripMarkdown(boldOnlyMatch[1].trim()) });
        continue;
      }
    }
  }

  return headings;
};

import { useNodeData } from '../src/contexts/NodeDataContext';

export const NodeCard = memo(({ data, selected }: NodeProps<NodeCardData>) => {
  const { id, onBranch, scale = 1 } = data;
  const nodes = useNodeData();
  const nodeData = nodes[id];

  const title = nodeData?.title || '';
  const messages = nodeData?.messages || [];
  const hierarchicalID = nodeData?.hierarchicalID || '';

  const firstMessage = messages[0]?.content || '';

  const rawTitle = title && title !== '...'
    ? title
    : (firstMessage.length > 30 ? firstMessage.substring(0, 30) + '...' : firstMessage);

  const displayTitle = stripMarkdown(rawTitle);
  const headings = extractHeadings(messages);

  return (
    <div
      style={{
        transform: `scale(${scale})`,
        transformOrigin: 'left center',
        width: '260px',
      }}
      className={`
        relative group transition-all duration-500 ease-out p-5 rounded-2xl border flex flex-col gap-2
        ${selected
          ? 'bg-blue-600/20 border-blue-500 shadow-[0_0_40px_rgba(59,130,246,0.3)] ring-1 ring-blue-500'
          : 'bg-zinc-900/90 backdrop-blur-xl border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800/95 shadow-2xl'}
      `}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#3f3f46', border: 'none', width: '8px', height: '8px', left: '-4px' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#3b82f6', border: 'none', width: '8px', height: '8px', right: '-4px' }}
      />

      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${selected ? 'bg-blue-400 animate-pulse' : 'bg-zinc-700'}`} />
            <span className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.2em]">
              NODE {hierarchicalID}
            </span>
            <span className="text-[8px] px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400 font-mono ml-auto">
              {messages.length} MSGS
            </span>
          </div>
          <h3 className={`text-[13px] font-bold text-white leading-tight transition-all duration-300 ${title === '...' ? 'animate-pulse text-zinc-500' : ''}`}>
            {displayTitle || "Untitled Segment"}
          </h3>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onBranch(id);
          }}
          className="shrink-0 p-2 bg-zinc-800 hover:bg-blue-600 rounded-xl text-zinc-400 hover:text-white transition-all active:scale-90 border border-zinc-700/50 shadow-lg"
          title="Branch from end of this node"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Heading list */}
      {headings.length > 0 && (
        <div className="border-t border-zinc-00/50 pt-2 flex flex-col gap-1">
          {/* Removed the .slice() limit so it maps all headings */}
          {headings.map((h, i) => {
            const isTop = h.depth === 1;
            return (
              <div
                key={i}
                className="flex items-baseline gap-2"

              >
                {/* Prefix: number if numbered, dot otherwise */}
                {h.number != null ? (
                  <span className="shrink-0 text-[11px] font-bold text-zinc-400 leading-none w-4 text-right">
                    {h.number}.
                  </span>
                ) : (
                  <span className={`shrink-0 mt-[3px] rounded-full ${isTop ? 'w-1 h-1 bg-zinc-500' : 'w-1.5 h-1.5 bg-zinc-200'}`} />
                )}
                <span className={`leading-snug ${isTop ? 'text-[12px] font-semibold text-zinc-400' : 'text-[13px] text-zinc-00'}`}>
                  {h.text}
                </span>
              </div>
            );
          })}

        </div>
      )}
    </div>
  );
});