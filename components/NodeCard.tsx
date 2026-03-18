import React, { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, NodeProps, useUpdateNodeInternals } from 'reactflow';
import { buildNodeMessageSummaries, stripMarkdown } from './nodeViewUtils';

interface NodeCardData {
  id: string;
  onBranch: (id: string, messageOrdinal?: number) => void;
  onSelect: (id: string, messageOrdinal?: number) => void;
  onToggleCollapse?: (id: string) => void;
  onReportBranchLayout?: (id: string, layout: { height: number; branchTops: Record<string, number> }) => void;
  collapsed?: boolean;
  scale?: number;
}

import { useNodeData } from '../src/contexts/NodeDataContext';

export const NodeCard = memo(({ data, selected }: NodeProps<NodeCardData>) => {
  const { id, onBranch, onSelect, onToggleCollapse, onReportBranchLayout, collapsed = false, scale = 1 } = data;
  const nodes = useNodeData();
  const nodeData = nodes[id];
  const updateNodeInternals = useUpdateNodeInternals();
  const cardRef = useRef<HTMLDivElement>(null);
  const [branchHandleTops, setBranchHandleTops] = useState<Record<string, number>>({});
  const lastReportedLayoutKeyRef = useRef<string>('');

  const title = nodeData?.title || '';
  const messages = nodeData?.messages || [];
  const hierarchicalID = nodeData?.hierarchicalID || '';

  const firstMessage = messages[0]?.content || '';
  const compactTitle = (value: string) => {
    const normalized = stripMarkdown(value).replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    return normalized.length > 52 ? `${normalized.slice(0, 52).trim()}...` : normalized;
  };

  const rawTitle = title && title !== '...'
    ? title
    : (firstMessage.length > 30 ? firstMessage.substring(0, 30) + '...' : firstMessage);

  const displayTitle = compactTitle(rawTitle);
  const normalizeLabel = (value: string) => value.trim().toLowerCase();
  const messageSummaries = buildNodeMessageSummaries(messages);
  const branchSourceOrdinal = messageSummaries[messageSummaries.length - 1]?.responseOrdinal
    ?? messageSummaries[messageSummaries.length - 1]?.promptOrdinal
    ?? messageSummaries[messageSummaries.length - 1]?.anchorOrdinal
    ?? messages[messages.length - 1]?.ordinal;

  const branchSourceHandles = useMemo(() => {
    const maxOrdinal = messages.reduce((max, message) => Math.max(max, message.ordinal), -1);

    const parseSourceOrdinal = (branchMessageId: string | null | undefined) => {
      if (!branchMessageId) return null;

      const colonIndex = branchMessageId.lastIndexOf(':');
      if (colonIndex > -1) {
        const prefixNodeId = branchMessageId.slice(0, colonIndex);
        if (prefixNodeId !== id) return null;
        const maybeOrdinal = Number(branchMessageId.slice(colonIndex + 1));
        if (Number.isFinite(maybeOrdinal)) return maybeOrdinal;
      }

      // Legacy ids looked like `${nodeId}-${idx}`. If `idx` happens to match a valid ordinal in this node,
      // treat it as such so older branches keep correct origins for common cases.
      const legacyPrefix = `${id}-`;
      if (branchMessageId.startsWith(legacyPrefix)) {
        const suffix = branchMessageId.slice(legacyPrefix.length);
        const maybeOrdinal = Number(suffix);
        if (Number.isFinite(maybeOrdinal) && maybeOrdinal >= 0 && maybeOrdinal <= maxOrdinal) {
          return maybeOrdinal;
        }
      }

      return null;
    };

    return (nodeData?.childrenIds || [])
      .map((childId) => {
        const childNode = nodes[childId];
        if (!childNode?.isBranch) return null;
        return { childId, sourceOrdinal: parseSourceOrdinal(childNode.branchMessageId) };
      })
      .filter(Boolean) as { childId: string; sourceOrdinal: number | null }[];
  }, [id, messages, nodeData?.childrenIds, nodes]);

  useLayoutEffect(() => {
    const cardEl = cardRef.current;
    if (!cardEl) return;

    const summaryEls = Array.from(cardEl.querySelectorAll<HTMLElement>('[data-summary-anchor-ordinal]'));
    const ordinalToEl = new Map<number, HTMLElement>();

    summaryEls.forEach((el) => {
      const anchor = Number(el.getAttribute('data-summary-anchor-ordinal'));
      const prompt = Number(el.getAttribute('data-summary-prompt-ordinal'));
      const response = Number(el.getAttribute('data-summary-response-ordinal'));

      if (Number.isFinite(anchor)) ordinalToEl.set(anchor, el);
      if (Number.isFinite(prompt)) ordinalToEl.set(prompt, el);
      if (Number.isFinite(response)) ordinalToEl.set(response, el);
    });

    const cardHeight = cardEl.clientHeight || 1;
    const centerTop = cardHeight / 2;

    const nextTops: Record<string, number> = {};
    branchSourceHandles.forEach(({ childId, sourceOrdinal }) => {
      const targetEl = sourceOrdinal == null ? null : (ordinalToEl.get(sourceOrdinal) ?? null);
      const top = targetEl ? (targetEl.offsetTop + (targetEl.offsetHeight / 2)) : centerTop;
      const clampedTop = Math.max(12, Math.min(cardHeight - 12, top));
      nextTops[childId] = clampedTop;
    });

    // If multiple branches map to the same summary (or fallback), spread them slightly so connectors don't overlap.
    const groups = new Map<number, string[]>();
    Object.entries(nextTops).forEach(([childId, top]) => {
      const key = Math.round(top);
      const existing = groups.get(key) ?? [];
      existing.push(childId);
      groups.set(key, existing);
    });

    groups.forEach((childIds, keyTop) => {
      if (collapsed || childIds.length <= 1) return;
      const spacing = 10;
      const mid = (childIds.length - 1) / 2;
      childIds.forEach((childId, index) => {
        const delta = (index - mid) * spacing;
        nextTops[childId] = keyTop + delta;
      });
    });

    setBranchHandleTops(nextTops);

    const height = cardEl.clientHeight || 0;
    const layoutKey = `${Math.round(height)}|${Object.entries(nextTops)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([childId, top]) => `${childId}:${Math.round(top)}`)
      .join(',')}`;

    if (!collapsed && layoutKey !== lastReportedLayoutKeyRef.current) {
      lastReportedLayoutKeyRef.current = layoutKey;
      onReportBranchLayout?.(id, { height, branchTops: nextTops });
    }

    // Tell ReactFlow to recompute handle positions after layout updates.
    const raf = window.requestAnimationFrame(() => updateNodeInternals(id));
    return () => window.cancelAnimationFrame(raf);
  }, [branchSourceHandles, collapsed, id, onReportBranchLayout, updateNodeInternals, messageSummaries.length]);

  return (
    <div
      ref={cardRef}
      style={{
        transform: `scale(${scale})`,
        transformOrigin: 'left center',
        width: '340px',
        minHeight: collapsed ? '76px' : undefined,
      }}
      className={`
        relative group transition-all duration-500 ease-out rounded-3xl border flex flex-col shadow-sm px-5 ${collapsed ? 'gap-1.5 pt-3 pb-3' : 'gap-3 pt-5 pb-5'}
        ${selected
          ? 'bg-[var(--accent-color)]/4 border-[var(--accent-color)]/45 shadow-[0_10px_24px_rgba(0,0,0,0.045)]'
          : 'bg-[var(--card-bg)] border-[var(--border-color)]/45 shadow-[0_10px_22px_rgba(0,0,0,0.035)] hover:shadow-[0_12px_26px_rgba(0,0,0,0.05)]'}
      `}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="target"
        style={{ background: 'var(--border-color)', border: 'none', width: '8px', height: '8px', left: '-4px' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="source"
        style={{ background: 'var(--accent-color)', border: 'none', width: '8px', height: '8px', right: '-4px' }}
      />

      {branchSourceHandles.map(({ childId }) => (
        <Handle
          key={`branch-handle-${id}-${childId}`}
          type="source"
          position={Position.Right}
          id={`branch-${childId}`}
          style={{
            background: 'var(--accent-color)',
            border: 'none',
            width: '8px',
            height: '8px',
            right: '-4px',
            top: branchHandleTops[childId] == null ? '50%' : `${branchHandleTops[childId]}px`,
            transform: 'translateY(-50%)',
          }}
        />
      ))}

      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${selected ? 'bg-[var(--accent-color)] animate-pulse' : 'bg-[var(--app-text-muted)] opacity-30'}`} />
            <span className="text-[9px] font-black text-[var(--app-text-muted)] uppercase tracking-[0.2em]">
              NODE {hierarchicalID}
            </span>
            <span className="text-[8px] px-1.5 py-0.5 bg-[var(--sidebar-bg)] rounded text-[var(--app-text-muted)] font-mono ml-auto border border-[var(--border-color)]">
              {messageSummaries.length} TURNS
            </span>
          </div>
          <h3 className={`truncate text-[13px] font-bold text-[var(--app-text)] leading-tight transition-all duration-300 ${title === '...' ? 'animate-pulse opacity-40' : ''}`}>
            {displayTitle || "Untitled Segment"}
          </h3>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleCollapse?.(id);
            }}
            className="nodrag p-2 bg-[var(--sidebar-bg)] hover:bg-[var(--card-bg)] rounded-xl text-[var(--app-text-muted)] hover:text-[var(--app-text)] transition-all active:scale-90 border border-[var(--border-color)]/60 shadow-sm"
            title={collapsed ? 'Expand node' : 'Collapse node'}
          >
            <svg className={`w-3.5 h-3.5 transition-transform ${collapsed ? '-rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 9l6 6 6-6" />
            </svg>
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onBranch(id, branchSourceOrdinal);
            }}
            className="nodrag p-2 bg-[var(--sidebar-bg)] hover:bg-[var(--accent-color)] rounded-xl text-[var(--app-text-muted)] hover:text-white transition-all active:scale-90 border border-[var(--border-color)]/60 shadow-sm"
            title="Branch from end of this node"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>

      {!collapsed && messageSummaries.length > 0 && (
        <div className="border-t border-[var(--border-color)] pt-3 flex flex-col gap-2">
          {messageSummaries.map((messageSummary) => {
            const isSingleTurn = messageSummaries.length === 1;
            const normalizedSummaryTitle = normalizeLabel(messageSummary.title);
            const normalizedCardTitle = normalizeLabel(displayTitle || '');
            const summaryTitleMatchesCard = Boolean(normalizedSummaryTitle) && normalizedSummaryTitle === normalizedCardTitle;
            const shouldShowSummaryTitle = !summaryTitleMatchesCard;

            const headings = messageSummary.headings.filter((heading, headingIndex) => {
              if (headingIndex !== 0) return true;
              return normalizeLabel(heading.text) !== normalizedSummaryTitle;
            });

            return (
              <button
                key={`${id}-${messageSummary.anchorOrdinal}`}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(id, messageSummary.anchorOrdinal);
                }}
                data-summary-anchor-ordinal={messageSummary.anchorOrdinal}
                data-summary-prompt-ordinal={messageSummary.promptOrdinal}
                data-summary-response-ordinal={messageSummary.responseOrdinal}
                className={`nodrag w-full text-left rounded-2xl px-3.5 py-3 transition-all ${isSingleTurn
                  ? 'border border-transparent bg-transparent hover:bg-[var(--sidebar-bg)]/35'
                  : selected
                    ? 'border border-[var(--accent-color)]/25 bg-[var(--card-bg)]/85 hover:bg-[var(--card-bg)]'
                    : 'border border-[var(--border-color)]/75 bg-[var(--sidebar-bg)]/55 hover:border-[var(--accent-color)]/25 hover:bg-[var(--card-bg)]'
                  }`}
              >
                <div className="w-8 h-px bg-[var(--accent-color)]/35 mb-2" />

                {shouldShowSummaryTitle && (
                  <div className="text-[13px] font-semibold text-[var(--app-text)] leading-snug">
                    {messageSummary.title}
                  </div>
                )}

                {headings.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1">
                    {headings.map((heading, headingIndex) => {
                      const isTop = heading.depth === 1;

                      return (
                        <div key={`${id}-${messageSummary.anchorOrdinal}-${headingIndex}`} className="flex items-baseline gap-2">
                          {heading.number != null ? (
                            <span className="shrink-0 text-[11px] font-bold text-[var(--app-text-muted)] opacity-50 leading-none w-4 text-right">
                              {heading.number}.
                            </span>
                          ) : (
                            <span className={`shrink-0 mt-[3px] rounded-full ${isTop ? 'w-1 h-1 bg-[var(--accent-color)] opacity-50' : 'w-1.5 h-1.5 bg-[var(--border-color)]'}`} />
                          )}
                          <span className={`leading-snug ${isTop ? 'text-[11px] font-bold text-[var(--app-text-muted)] uppercase tracking-[0.04em]' : 'text-[12px] text-[var(--app-text)] opacity-80'}`}>
                            {heading.text}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});
