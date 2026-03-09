import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { ChatNode, Message, SendMessageOptions } from '../types';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight, vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from '../src/contexts/ThemeContext';
import DOMPurify from 'dompurify';
import { AttachmentPreviewStrip } from './AttachmentPreviewStrip';
export interface BranchMetadata {
  messageId: string;
  blockId: string;
  blockIndex: number;
  relativeYInBlock: number;
  textSnippet: string;
  msgRelativeY: number;
  targetNodeId?: string;
}

export interface ChatViewProps {
  history: ChatNode[];
  onSendMessage: (text: string, files: File[], branchMetadata?: BranchMetadata, thinking?: boolean, options?: SendMessageOptions) => void;
  onSendMessageToNode?: (nodeId: string, text: string, files: File[], thinking?: boolean, options?: SendMessageOptions) => void;
  onSelectNode?: (nodeId: string) => void;
  branchLines?: BranchMetadata[];
  onBranch: (nodeId: string) => void;
  nodes?: Record<string, ChatNode>;
  isGenerating: boolean;
  generatingNodeId?: string | null;
  isBranching?: boolean;
  onCancelBranch?: () => void;
  currentNodeId: string | null;
  currentTitle?: string;
  selectedModel: string;
  onModelSelect: (modelId: string) => void;
  onStopGeneration?: () => void;
}



// ─────────────────────────────────────────────────────────────────────────────
// Branch ghost label — follows cursor, no cursor change
// ─────────────────────────────────────────────────────────────────────────────

interface GhostLabelProps {
  x: number;
  y: number;
}

const BranchGhostLabel: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <div
    className="absolute pointer-events-none z-[70] select-none transition-all duration-75 ease-out"
    style={{ left: x, top: y }}
  >
    <div className="absolute w-6 h-6" style={{ left: -19, top: -3 }}>
      <svg className="w-full h-full text-blue-500 drop-shadow-sm" viewBox="0 0 24 24" fill="currentColor" stroke="white" strokeWidth="1.5">
        <path strokeLinejoin="round" strokeLinecap="round" d="M18.5 3.21V20.8c0 .45-.54.67-.85.35l-4.86-4.86a.5.5 0 00-.35-.15H6.02c-.45 0-.67-.54-.35-.85L18.5 3.21z" />
      </svg>
    </div>

    <div
      className="absolute bg-blue-500 text-white text-[12px] font-medium px-2 py-1 rounded-full shadow-lg flex items-center gap-1.5 whitespace-nowrap border border-white/20"
      style={{ left: 14, top: 0, transform: 'translateY(-50%)' }}
    >
      <div className="w-4 h-4 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm">
        <svg className="w-2.5 h-2.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14 5l7 7m0 0l-7 7m7-7H3" />
        </svg>
      </div>
      <span className="pr-1 tracking-wide">Create branch</span>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
const MarkdownMessage = React.memo(function MarkdownMessage({
  content,
  mode,
  isUser,
}: {
  content: string;
  mode: string;
  isUser: boolean;
}) {
  return (
    <ReactMarkdown components={{
      code: ({ node, inline, className, children, ...props }: any) => {
        const match = /language-(\w+)/.exec(className || '');
        const codeContent = String(children).replace(/\n$/, '');

        if (inline) return <code className="bg-zinc-100 text-blue-600 px-1.5 py-0.5 rounded text-sm font-mono whitespace-nowrap" {...props}>{children}</code>;

        return (
          <div className="relative group/code my-4 rounded-xl overflow-hidden border border-zinc-200">
            <div className="flex items-center justify-between px-4 py-2 bg-zinc-50 border-b border-zinc-200 text-xs text-zinc-500 font-medium">
              <span className="font-mono">{match ? match[1] : 'code'}</span>
              <button
                onClick={() => navigator.clipboard.writeText(codeContent)}
                className="p-1 hover:bg-zinc-200 rounded transition-colors group/btn relative"
                title="Copy code"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
            </div>
            {match ? (
              <SyntaxHighlighter
                style={mode === 'dark' ? vscDarkPlus : oneLight}
                language={match[1]}
                PreTag="div"
                className={`!my-0 !bg-transparent custom-scrollbar ${mode === 'dark' ? 'bg-[#1e1e1e]' : 'bg-zinc-50'}`}
                customStyle={{ margin: 0, padding: '1.5rem', background: 'transparent' }}
                {...props}
              >
                {codeContent}
              </SyntaxHighlighter>
            ) : (
              <div className={`p-4 border rounded-xl overflow-x-auto custom-scrollbar ${mode === 'dark' ? 'bg-[#1e1e1e] border-[#2e2e2e]' : 'bg-zinc-50 border-zinc-100'}`}>
                <code className={`font-mono text-sm ${mode === 'dark' ? 'text-zinc-300' : 'text-zinc-800'}`} {...props}>{children}</code>
              </div>
            )}
          </div>
        );
      },
      h1: ({ node, ...props }) => <h1 className="text-2xl font-bold mb-4 text-[var(--app-text)]" {...props} />,
      h2: ({ node, ...props }) => <h2 className="text-xl font-bold mb-3 text-[var(--app-text)]" {...props} />,
      h3: ({ node, ...props }) => <h3 className="text-lg font-bold mb-2 text-[var(--app-text)]" {...props} />,
      p: ({ node, ...props }) => <p className={`leading-relaxed ${isUser ? 'mb-0' : 'mb-4 text-[var(--app-text)] opacity-90'}`} {...props} />,
      ul: ({ node, ...props }) => <ul className="list-disc list-inside mb-4 space-y-2 text-[var(--app-text)] opacity-90" {...props} />,
      ol: ({ node, ...props }) => <ol className="list-decimal list-inside mb-4 space-y-2 text-[var(--app-text)] opacity-90" {...props} />,
      li: ({ node, ...props }) => <li className="text-[var(--app-text)] opacity-90" {...props} />,
      strong: ({ node, ...props }) => <strong className="font-bold text-[var(--app-text)]" {...props} />,
      a: ({ node, ...props }) => <a className="text-[var(--accent-color)] hover:opacity-80 underline" target="_blank" rel="noopener noreferrer" {...props} />,
      blockquote: ({ node, ...props }) => <blockquote className="border-l-4 border-[var(--border-color)] pl-4 italic text-[var(--app-text-muted)] my-4" {...props} />,
    }}>
      {content}
    </ReactMarkdown>
  );
}, (prev, next) => prev.content === next.content && prev.mode === next.mode && prev.isUser === next.isUser);

// BranchComposer — spawns at click Y, aligned to message column right edge
// ─────────────────────────────────────────────────────────────────────────────

interface BranchComposerProps {
  anchorY: number;
  onSend: (text: string, files: File[]) => void;
  onClose: () => void;
  selectedModel: string;
  onModelSelect: (modelId: string) => void;
  initialText?: string;
}

const BranchComposer: React.FC<BranchComposerProps & { composerRef: React.RefObject<HTMLDivElement> }> = ({ anchorY, onSend, onClose, selectedModel, onModelSelect, initialText = '', composerRef }) => {
  const [text, setText] = useState(initialText);
  const [isExpanded, setIsExpanded] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus({ preventScroll: true }); }, []);

  const handleSend = useCallback(() => {
    if (text.trim() || files.length > 0) {
      onSend(text.trim(), files);
    }
  }, [text, files, onSend]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const currentModel = MODELS.find(m => m.id === selectedModel);

  return (
    <div
      ref={composerRef}
      className="branch-composer-ui absolute z-[60] pointer-events-none drop-shadow-sm"
      style={{
        top: anchorY,
        left: 'calc(100% + 12px)',
        width: 310,
      }}
    >
      <div
        className="pointer-events-none absolute top-0"
        style={{ width: 44, left: -44, transform: 'translateY(-50%)' }}
      >
        <div className="absolute left-0 top-[-1px] w-full h-[2px] bg-gradient-to-r from-transparent via-blue-200/50 to-blue-400" />
        <div className="absolute right-0 top-[50%] -translate-y-[50%] w-1.5 h-1.5 bg-blue-500 rounded-full border-[1.5px] border-white z-10 box-content shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
      </div>

      <div
        className="pointer-events-none absolute top-0 left-0 w-full"
        style={{ transform: 'translateY(-50%)' }}
      >
        <div
          className={`pointer-events-auto bg-white border border-black/[0.04] shadow-[0_4px_30px_rgba(0,0,0,0.06)] flex flex-col p-1.5 animate-in fade-in zoom-in-95 duration-150 transition-all text-left relative overflow-visible ${isExpanded ? 'rounded-[20px]' : 'rounded-full'}`}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <input type="file" multiple ref={fileInputRef} className="hidden" onChange={handleFileSelect} />

          {/* File Previews */}
          {files.length > 0 && (
            <AttachmentPreviewStrip
              files={files}
              onRemove={removeFile}
              density="compact"
              className="pb-2 px-3 pt-2 relative z-10"
            />
          )}

          {/* Top Row: Input & Actions */}
          <div className="flex items-center gap-1.5 relative z-10 px-1.5">
            <button type="button" onClick={onClose} title="Cancel (Esc)" className="p-1 text-[#9ca3af] hover:text-gray-700 transition-colors rounded-full shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>

            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSend();
                if (e.key === 'Escape') onClose();
              }}
              placeholder="Type a branch prompt..."
              className="flex-1 bg-transparent border-none text-[13px] text-gray-700 placeholder:text-gray-400/80 focus:ring-0 outline-none px-1 py-1 min-w-0 font-medium tracking-tight"
            />

            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              title="Toggle Options"
              className={`p-1 transition-colors rounded-full shrink-0 flex items-center justify-center ${isExpanded ? 'bg-gray-100 text-gray-600' : 'text-[#9ca3af] hover:text-gray-700'}`}
            >
              <svg className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : 'rotate-0'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <button
              type="button"
              onClick={handleSend}
              disabled={!text.trim() && files.length === 0}
              className="bg-[#dbeafe] hover:bg-[#bfdbfe] disabled:bg-gray-100 disabled:text-gray-300 disabled:cursor-not-allowed text-white p-2 rounded-full transition-all shrink-0 flex items-center justify-center w-[34px] h-[34px] ml-1"
            >
              <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
            </button>
          </div>

          {/* Expanded Bottom Row: File & Model Options */}
          {isExpanded && (
            <div className="flex items-center justify-between pt-3 pb-1.5 px-3 mt-1 border-t border-gray-100 animate-in slide-in-from-top-2 fade-in duration-200">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Attach files"
                className="flex items-center gap-1.5 px-3 py-1.5 text-gray-500 hover:text-gray-800 rounded-full transition-all hover:bg-gray-100 border-none text-[12px] font-medium"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                Attach
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsModelMenuOpen(!isModelMenuOpen)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium text-gray-600 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 transition-all group border border-gray-200 shadow-sm"
                >
                  <span className="truncate max-w-[120px]">{currentModel?.name || 'Branch Model'}</span>
                  <svg className="w-3 h-3 text-gray-400 group-hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" /></svg>
                </button>

                {/* Mini Model Menu */}
                {isModelMenuOpen && (
                  <div className="absolute top-[calc(100%+8px)] right-0 w-52 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl z-[70] p-1.5 custom-scrollbar">
                    {MODELS.map(model => (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => {
                          onModelSelect(model.id);
                          setIsModelMenuOpen(false);
                        }}
                        className={`w-full flex justify-between items-center text-left px-2.5 py-2 text-[12px] rounded-lg transition-colors ${selectedModel === model.id ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
                      >
                        <span className="truncate">{model.name}</span>
                        {selectedModel === model.id ? (
                          <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                        ) : null}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// useBranchInteraction hook
// ─────────────────────────────────────────────────────────────────────────────
interface ActiveBranch {
  y: number;
  nodeId: string;
  metadata: BranchMetadata; // <--- Now activeBranch knows about metadata
}

function useBranchInteraction(
  containerRef: React.RefObject<HTMLDivElement>,
  contentRef: React.RefObject<HTMLDivElement>, // Passed to anchor things to content
  onBranch?: (nodeId: string) => void,
  onSendMessage?: (text: string, files: File[], branchMetadata?: BranchMetadata) => void,
  onCancelBranch?: () => void
) {
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [activeBranch, setActiveBranch] = useState<ActiveBranch | null>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (activeBranch) return;
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;
    setCursor({
      x: e.clientX - containerRect.left,
      y: e.clientY - containerRect.top,
    });
  }, [activeBranch, containerRef]);

  const handleMouseLeave = useCallback(() => {
    if (!activeBranch) setCursor(null);
  }, [activeBranch]);

  const closeBranch = useCallback((isCancel = true) => {
    setActiveBranch(null);
    setCursor(null);
    if (isCancel && onCancelBranch) {
      onCancelBranch();
    }
  }, [onCancelBranch]);

  const handleZoneClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // Only trigger on left-click
    if (activeBranch) {
      closeBranch(true);
      return;
    }
    const contentRect = contentRef.current?.getBoundingClientRect();
    if (!contentRect) return;

    const relY = e.clientY - contentRect.top;
    const absoluteClickY = e.clientY;

    // 1. Find closest message
    const messageEls = document.querySelectorAll<HTMLElement>('[data-node-id]');
    let closestMsgEl: HTMLElement | null = null;
    let closestNodeId = 'unknown';
    let minMsgDist = Infinity;

    messageEls.forEach((el) => {
      const rect = el.getBoundingClientRect();
      let dist = 0;
      if (absoluteClickY < rect.top) dist = rect.top - absoluteClickY;
      else if (absoluteClickY > rect.bottom) dist = absoluteClickY - rect.bottom;

      if (dist < minMsgDist) {
        minMsgDist = dist;
        closestNodeId = el.getAttribute('data-node-id') || 'unknown';
        closestMsgEl = el;
      }
    });

    // 2. Find closest block inside that message & do math
    let messageId = closestMsgEl?.getAttribute('data-message-id') || 'unknown';
    let blockId = 'unknown';
    let blockIndex = -1; // <--- MOVED UP HERE!
    let relativeYInBlock = 0;
    let textSnippet = '';

    if (closestMsgEl) {
      const mdWrapper = closestMsgEl.querySelector('.md-content');
      if (mdWrapper) {
        const blocks = Array.from(mdWrapper.children) as HTMLElement[];
        let closestBlock: HTMLElement | null = null;
        let minBlockDist = Infinity;
        // (Removed blockIndex from here)

        blocks.forEach((block, idx) => {
          const rect = block.getBoundingClientRect();
          let dist = 0;
          if (absoluteClickY < rect.top) dist = rect.top - absoluteClickY;
          else if (absoluteClickY > rect.bottom) dist = absoluteClickY - rect.bottom;

          if (dist < minBlockDist) {
            minBlockDist = dist;
            closestBlock = block;
            blockIndex = idx;
          }
        });

        if (closestBlock) {
          blockId = `block-${blockIndex}-${closestBlock.tagName.toLowerCase()}`;
          const rect = closestBlock.getBoundingClientRect();

          // ADD THIS LINE:
          const msgRelativeY = absoluteClickY - closestMsgEl.getBoundingClientRect().top;

          const yInside = Math.max(0, Math.min(absoluteClickY - rect.top, rect.height)); relativeYInBlock = rect.height > 0 ? yInside / rect.height : 0;

          const textContent = closestBlock.innerText || closestBlock.textContent || '';
          const words = textContent.trim().split(/\s+/).filter(Boolean);

          if (words.length > 0) {
            const estimatedWordIndex = Math.min(words.length - 1, Math.floor(relativeYInBlock * words.length));
            const start = Math.max(0, estimatedWordIndex - 3);
            const end = Math.min(words.length, estimatedWordIndex + 4);
            textSnippet = words.slice(start, end).join(' ');
          }
        }
      }
    }

    // 3. Log it immediately on click!
    console.log('Floating Composer Clicked Math:', {
      messageId,
      blockId,
      relativeYInBlock: Number(relativeYInBlock.toFixed(4)),
      textSnippet,
      promptText: "" // Empty since the user hasn't typed anything yet
    });

    // 4. Proceed to open the composer
    setActiveBranch({
      y: relY,
      nodeId: closestNodeId,
      // Create the metadata object (Now includes blockIndex!)
      metadata: {
        messageId,
        blockId,
        blockIndex, // <--- ADD THIS
        relativeYInBlock,
        textSnippet,
        msgRelativeY: absoluteClickY - (closestMsgEl?.getBoundingClientRect().top || 0)
      }
    }); setCursor(null);

    if (onBranch && closestNodeId !== 'unknown') {
      onBranch(closestNodeId);
    }
  }, [activeBranch, containerRef, closeBranch, onBranch]);

  useEffect(() => {
    if (!activeBranch) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Element;
      if (target.closest('.branch-composer-ui')) return;
      if (zoneRef.current?.contains(target)) return;

      closeBranch(true);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [activeBranch, closeBranch]);

  // Listen for selection-based branch triggers
  useEffect(() => {
    const handleSelectionBranch = (e: Event) => {
      const customEvent = e as CustomEvent<ActiveBranch>;
      const payload = customEvent.detail;

      setActiveBranch(payload);
      setCursor(null);
      if (onBranch && payload.nodeId !== 'unknown') {
        onBranch(payload.nodeId);
      }
    };

    document.addEventListener('open-branch-with-selection', handleSelectionBranch);
    return () => document.removeEventListener('open-branch-with-selection', handleSelectionBranch);
  }, [onBranch]);

  // ── Submit Logic ──────────────────────────────────────────────────────────
  const handleBranchSubmit = useCallback((text: string, files: File[]) => {
    if (!activeBranch) return;
    const contentRect = contentRef.current?.getBoundingClientRect();
    if (!contentRect) return;

    const absoluteClickY = contentRect.top + activeBranch.y;
    const messageEls = document.querySelectorAll<HTMLElement>('[data-message-id]');

    let closestMsgEl: HTMLElement | null = null;
    let minMsgDist = Infinity;

    messageEls.forEach((el) => {
      const rect = el.getBoundingClientRect();
      let dist = 0;
      if (absoluteClickY < rect.top) dist = rect.top - absoluteClickY;
      else if (absoluteClickY > rect.bottom) dist = absoluteClickY - rect.bottom;

      if (dist < minMsgDist) {
        minMsgDist = dist;
        closestMsgEl = el;
      }
    });

    let messageId = 'unknown';
    let blockId = 'unknown';
    let relativeYInBlock = 0;
    let textSnippet = '';

    if (closestMsgEl) {
      messageId = closestMsgEl.getAttribute('data-message-id') || 'unknown';

      const mdWrapper = closestMsgEl.querySelector('.md-content');
      if (mdWrapper) {
        const blocks = Array.from(mdWrapper.children) as HTMLElement[];
        let closestBlock: HTMLElement | null = null;
        let minBlockDist = Infinity;
        let blockIndex = -1;

        blocks.forEach((block, idx) => {
          const rect = block.getBoundingClientRect();
          let dist = 0;
          if (absoluteClickY < rect.top) dist = rect.top - absoluteClickY;
          else if (absoluteClickY > rect.bottom) dist = absoluteClickY - rect.bottom;

          if (dist < minBlockDist) {
            minBlockDist = dist;
            closestBlock = block;
            blockIndex = idx;
          }
        });

        if (closestBlock) {
          blockId = `block-${blockIndex}-${closestBlock.tagName.toLowerCase()}`;
          const rect = closestBlock.getBoundingClientRect();

          const yInside = Math.max(0, Math.min(absoluteClickY - rect.top, rect.height));
          relativeYInBlock = rect.height > 0 ? yInside / rect.height : 0;

          const textContent = closestBlock.innerText || closestBlock.textContent || '';
          const words = textContent.trim().split(/\s+/).filter(Boolean);

          if (words.length > 0) {
            const estimatedWordIndex = Math.min(words.length - 1, Math.floor(relativeYInBlock * words.length));
            const start = Math.max(0, estimatedWordIndex - 3);
            const end = Math.min(words.length, estimatedWordIndex + 4);
            textSnippet = words.slice(start, end).join(' ');
          }
        }
      }
    }

    // 1. Log the requested data
    console.log('Floating Composer Submit Math:', {
      messageId,
      blockId,
      relativeYInBlock: Number(relativeYInBlock.toFixed(4)),
      textSnippet,
      promptText: text
    });

    // 2. Call the EXACT same submit function as the main bottom input!
    if (onSendMessage) {
      onSendMessage(text, files, activeBranch.metadata);
    }

    // 3. Close the floating composer normally (don't trigger onCancelBranch)
    closeBranch(false);
  }, [activeBranch, containerRef, closeBranch, onSendMessage]);

  return { cursor, activeBranch, composerRef, zoneRef, handleMouseMove, handleMouseLeave, handleZoneClick, handleBranchSubmit, closeBranch };
}

// ─────────────────────────────────────────────────────────────────────────────
interface ModelOption {
  id: string;
  name: string;
  provider: string;
  description: string;
  isPremium: boolean;
  thinkingOnly?: boolean;
  supportsThinkingTrace?: boolean;
  smartLoading?: boolean;
}

const MODELS: ModelOption[] = [
  { id: 'arcee-ai/trinity-large-preview:free', name: 'Trinity Large (Free)', provider: 'arcee', description: 'Advanced preview model from Arcee AI', isPremium: false, smartLoading: false },
  { id: 'openai/gpt-5.3', name: 'GPT 5.3', provider: 'openai', description: 'Next-generation reasoning model with unprecedented scale', isPremium: true, supportsThinkingTrace: true, smartLoading: true },
  { id: 'openai/gpt-5.2', name: 'GPT 5.2', provider: 'openai', description: 'Highly efficient, ultra-intelligent foundation model', isPremium: true, supportsThinkingTrace: true, smartLoading: true },
  { id: 'google/gemini-3.1-pro', name: 'Gemini 3.1 Pro', provider: 'google', description: 'Multimodal flagship with advanced logical planning', isPremium: true, smartLoading: true },
  { id: 'google/gemini-3-flash', name: 'Gemini 3 Flash', provider: 'google', description: 'Ultrafast response with broad knowledge base', isPremium: false, smartLoading: false },
  { id: 'anthropic/claude-4.6-sonnet', name: 'Claude Sonnet 4.6', provider: 'anthropic', description: 'State-of-the-art coding and creative assistance', isPremium: true, smartLoading: true },
  { id: 'anthropic/claude-4.6-opus', name: 'Claude Opus 4.6', provider: 'anthropic', description: 'Maximum intelligence for complex scientific tasks', isPremium: true, smartLoading: true },
  { id: 'moonshot/kimi-k2.5-thinking', name: 'Kimi K2.5 Thinking', provider: 'moonshot', description: 'Extended chain-of-thought processing', isPremium: true, thinkingOnly: true, supportsThinkingTrace: true, smartLoading: true },
  { id: 'zhipu/glm-5', name: 'GLM 5', provider: 'zhipu', description: 'Advanced bilingual language model', isPremium: true, smartLoading: true },
];

const isModelLockedForPublicLaunch = (model: ModelOption) => false;

const SMART_MODEL_LOADING_PHRASES = [
  'Mapping the problem space',
  'Running a deeper reasoning pass',
  'Pressure-testing candidate answers',
  'Cross-checking the final response',
];

const ProviderIcon = ({ provider, isActive }: { provider: string, isActive: boolean }) => {
  const className = `w-5 h-5 transition-colors ${isActive ? 'text-white' : 'text-zinc-500 group-hover:text-zinc-300'}`;
  switch (provider) {
    case 'all':
      return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>;
    case 'openai':
      return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A6.0651 6.0651 0 0 0 19.0192 19.818a5.9847 5.9847 0 0 0 3.9977-2.9001 6.051 6.051 0 0 0-.735-7.0968zM10.8422 20.2505a4.062 4.062 0 0 1-2.4276-1.0776l.0448-.0258 3.5148-2.0298a.566.566 0 0 0 .2852-.4913v-4.757l2.8722 1.6585a.0467.0467 0 0 1 .0223.038v4.2023a4.062 4.062 0 0 1-4.3117 2.4827zm-5.717-3.0487a4.053 4.053 0 0 1-.9512-2.4842l.0442.0254 3.5135 2.029a.5665.5665 0 0 0 .5689 0l4.1198-2.3787v3.317a.0467.0467 0 0 1-.0236.0402l-3.6393 2.1013a4.053 4.053 0 0 1-3.6323-.65zm-2.122-6.526a4.062 4.062 0 0 1 1.4746-2.222l-.0218.0386-3.5144 2.0298a.566.566 0 0 0-.2851.4913v4.757l2.8723-1.6585a.0467.0467 0 0 1 .046-.0011l3.6385-2.1012a4.062 4.062 0 0 1-4.21-.3339zm10.7495-5.91a4.053 4.053 0 0 1 2.4278 1.0776l-.0448.0258-3.5148 2.0298a.566.566 0 0 0-.2852.4913v4.757l-2.8722-1.6585a.0467.0467 0 0 1-.0223-.038v-4.2023a4.053 4.053 0 0 1 4.3115-2.4827zm5.717 3.0487a4.062 4.062 0 0 1 .9512 2.4842l-.0442-.0254-3.5135-2.029a.5665.5665 0 0 0-.5689 0l-4.1198 2.3787v-3.317a.0467.0467 0 0 1 .0236-.0402l3.6393-2.1013a4.062 4.062 0 0 1 3.6323.65zm2.122 6.526a4.053 4.053 0 0 1-1.4746 2.222l.0218-.0386 3.5144-2.0298a.566.566 0 0 0 .2851-.4913v-4.757l-2.8723 1.6585a.0467.0467 0 0 1-.046.0011l-3.6385 2.1012a4.053 4.053 0 0 1 4.21.3339zM12 14.654l-2.298-1.3267v-2.6534L12 9.3473l2.298 1.3266v2.6534L12 14.654z" /></svg>;
    case 'google':
      return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.761H12.545z" /></svg>;
    case 'anthropic':
      return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M21.05 18.98L12 3.32 2.95 18.98h2.36l6.69-11.58 6.69 11.58h2.36z" /></svg>;
    case 'arcee':
      return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>;
    case 'moonshot':
      return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L4.5 20.29L5.21 21L12 18L18.79 21L19.5 20.29L12 2Z" /></svg>;
    case 'zhipu':
      return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M11.644 1.609a.75.75 0 0 1 .712 0l7.5 4.125a.75.75 0 0 1 .394.656v8.25a.75.75 0 0 1-.394.656l-7.5 4.125a.75.75 0 0 1-.712 0l-7.5-4.125a.75.75 0 0 1-.394-.656v-8.25a.75.75 0 0 1 .394-.656l7.5-4.125z" /></svg>;
    default:
      return <div className={`w-5 h-5 rounded-full border-2 ${isActive ? 'border-white' : 'border-zinc-500 group-hover:border-zinc-300'}`} />;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Responsive Branch Line Indicator
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// BranchMiniChat — rendered as a top-level overlay above the branch zone
// Position is computed from the message element's screen coords each frame
// ─────────────────────────────────────────────────────────────────────────────
interface BranchMiniChatProps {
  line: BranchMetadata;
  uniqueMsgId: string;
  branchNode?: ChatNode;
  isGeneratingThisNode?: boolean;
  loadingPhrase?: string | null;
  showSmartLoading?: boolean;
  title?: string;
  onSendMessage?: (text: string, files: File[]) => void;
  onGoToNode?: () => void;
  onStopGeneration?: () => void;
  containerRef: React.RefObject<HTMLDivElement>;
  scrollRef: React.RefObject<HTMLDivElement>; // Passed for scroll detection
}

const MiniMarkdown: React.FC<{ content: string }> = ({ content }) => {
  const { mode } = useTheme();
  return (
    <ReactMarkdown
      components={{
        p: ({ node, ...props }) => <p className="mb-1.5 last:mb-0 leading-relaxed text-[var(--app-text)] opacity-90" {...props} />,
        code: ({ node, inline, className, children, ...props }: any) => {
          if (inline) return <code className="bg-[var(--sidebar-bg)] text-[var(--accent-color)] px-1 py-0.5 rounded text-[10px] font-mono border border-[var(--border-color)]" {...props}>{children}</code>;
          return <pre className="bg-[var(--sidebar-bg)] border border-[var(--border-color)] rounded-lg p-2 my-1.5 overflow-x-auto custom-scrollbar"><code className="text-[10px] font-mono text-[var(--app-text)] opacity-80" {...props}>{children}</code></pre>;
        },
        strong: ({ node, ...props }) => <strong className="font-bold text-[var(--app-text)]" {...props} />,
        em: ({ node, ...props }) => <em className="italic text-[var(--app-text-muted)]" {...props} />,
        ul: ({ node, ...props }) => <ul className="list-disc list-inside mb-1.5 space-y-0.5 text-[var(--app-text)] opacity-90" {...props} />,
        ol: ({ node, ...props }) => <ol className="list-decimal list-inside mb-1.5 space-y-0.5 text-[var(--app-text)] opacity-90" {...props} />,
        li: ({ node, ...props }) => <li className="text-[var(--app-text)] opacity-90" {...props} />,
        h1: ({ node, ...props }) => <h1 className="text-sm font-bold text-[var(--app-text)] mb-1" {...props} />,
        h2: ({ node, ...props }) => <h2 className="text-xs font-bold text-[var(--app-text)] mb-1" {...props} />,
        h3: ({ node, ...props }) => <h3 className="text-xs font-semibold text-[var(--app-text)] opacity-80 mb-1" {...props} />,
        blockquote: ({ node, ...props }) => <blockquote className="border-l-2 border-[var(--border-color)] pl-2 italic text-[var(--app-text-muted)] my-1" {...props} />,
        a: ({ node, ...props }) => <a className="text-[var(--accent-color)] hover:opacity-80 underline" target="_blank" rel="noopener noreferrer" {...props} />,
      }}
    >
      {DOMPurify.sanitize(content)}
    </ReactMarkdown>
  );
};

const ThinkingTracePanel: React.FC<{
  trace?: string;
  messageId: string;
  isStreaming?: boolean;
  compact?: boolean;
}> = ({ trace, messageId, isStreaming = false, compact = false }) => {
  const [isExpanded, setIsExpanded] = useState(isStreaming);

  useEffect(() => {
    if (isStreaming) {
      setIsExpanded(true);
    }
  }, [isStreaming, messageId]);

  if (!trace?.trim()) {
    return null;
  }

  return (
    <div className={`mb-3 rounded-2xl border border-zinc-200/60 bg-zinc-50/50 overflow-hidden ${compact ? 'mb-2 rounded-xl' : ''}`}>
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-zinc-100/50 ${compact ? 'px-2.5 py-1.5' : ''}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className={`rounded-full bg-zinc-200 text-zinc-500 flex items-center justify-center ${compact ? 'w-6 h-6' : 'w-7 h-7'}`}>
            <svg className={`${isStreaming ? 'animate-pulse' : ''} ${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className={`font-semibold text-zinc-700 ${compact ? 'text-[10px]' : 'text-xs uppercase tracking-[0.16em]'}`}>
              {isStreaming ? 'Thinking...' : 'Thought'}
            </p>
            {!compact && (
              <p className="text-zinc-500/80 truncate text-[10px]">
                {isStreaming ? 'Analyzing and reasoning' : 'Click to inspect the model trace'}
              </p>
            )}
          </div>
        </div>
        <svg className={`shrink-0 text-zinc-400 transition-transform ${isExpanded ? 'rotate-180' : ''} ${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className={`border-t border-zinc-200/60 bg-white/40 ${compact ? 'px-2.5 py-2' : 'px-4 py-3'}`}>
          <MiniMarkdown content={trace} />
        </div>
      )}
    </div>
  );
};

const BranchMiniChat: React.FC<BranchMiniChatProps> = ({
  line, uniqueMsgId, branchNode, isGeneratingThisNode, loadingPhrase, showSmartLoading, title, onSendMessage, onGoToNode, onStopGeneration, containerRef, scrollRef
}) => {
  // Position in pixels relative to the container element
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [input, setInput] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messages = branchNode?.messages ?? [];
  const LINE_WIDTH = 48;

  useEffect(() => {
    const updatePosition = () => {
      const scrollContent = containerRef.current;
      const msgEl = document.querySelector<HTMLElement>(`[data-message-id="${uniqueMsgId}"]`);
      if (!scrollContent || !msgEl) return;

      const mdWrapper = msgEl.querySelector('.md-content');
      const contentRect = scrollContent.getBoundingClientRect();
      const msgRect = msgEl.getBoundingClientRect();

      let lineTop: number;
      if (mdWrapper && mdWrapper.children[line.blockIndex]) {
        const blockEl = mdWrapper.children[line.blockIndex] as HTMLElement;
        const blockRect = blockEl.getBoundingClientRect();
        // Calculate offset relative to the TOP of the scroll content (this is constant regardless of scroll)
        lineTop = (blockRect.top - contentRect.top) + (blockRect.height * line.relativeYInBlock);
      } else {
        lineTop = (msgRect.top - contentRect.top) + line.msgRelativeY;
      }

      // Left edge: right side of the message bubble relative to content container
      const msgBubbleRight = msgRect.right - contentRect.left;
      setPos({ top: lineTop, left: msgBubbleRight + LINE_WIDTH });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);

    // We NO LONGER need the scroll listener because the parent div now scrolls these nodes natively!
    // This is what removes the lag.

    return () => {
      window.removeEventListener('resize', updatePosition);
    };
  }, [line, uniqueMsgId, containerRef]); // history.length removed as it is not in scope and pos is updated by line/resize


  const [isFocused, setIsFocused] = useState(false);

  const miniScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!collapsed && miniScrollRef.current) {
      // Small timeout to ensure layout is done and avoid triggering parent scroll behavior
      const el = miniScrollRef.current;
      setTimeout(() => {
        el.scrollTop = el.scrollHeight;
      }, 0);
    }
  }, [messages.length, collapsed]);

  // AUTO-COLLAPSE ON OVERLAP
  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl || collapsed) return;

    const checkOverlap = () => {
      if (collapsed) return;
      const composer = document.querySelector('.branch-composer-ui');
      if (!composer) return;

      const myBox = miniScrollRef.current?.closest('.pointer-events-auto');
      if (!myBox) return;

      const myRect = myBox.getBoundingClientRect();
      const compRect = composer.getBoundingClientRect();

      const isOverlapping = !(
        myRect.right < compRect.left ||
        myRect.left > compRect.right ||
        myRect.bottom < compRect.top ||
        myRect.top > compRect.bottom
      );

      if (isOverlapping) {
        setCollapsed(true);
      }
    };

    scrollEl.addEventListener('scroll', checkOverlap);
    // Also check on mount/updates
    setTimeout(checkOverlap, 100);

    return () => scrollEl.removeEventListener('scroll', checkOverlap);
  }, [scrollRef, collapsed]);

  const handleSend = () => {
    if (!input.trim() || !onSendMessage) return;
    onSendMessage(input.trim(), []);
    setInput('');
  };

  const displayTitle = branchNode?.title && branchNode.title !== '...' ? branchNode.title : (title || 'Branch');
  if (!pos) return null;


  return (
    // z-[60] — sits above the branch zone (z-40) and BranchComposer (z-60 too, but this is fine)
    <div
      className="absolute z-[60] pointer-events-none"
      style={{ top: pos.top, left: pos.left }}
    >
      <div
        className="pointer-events-none absolute top-0"
        style={{ width: LINE_WIDTH, left: -LINE_WIDTH, transform: 'translateY(-50%)' }}
      >
        <div className="absolute left-0 top-[-1px] w-full h-[2px] bg-gradient-to-r from-transparent via-blue-200/50 to-blue-400" />
        <div className="absolute right-0 top-[50%] -translate-y-[50%] w-1.5 h-1.5 bg-blue-500 rounded-full border-[1.5px] border-white box-content shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
      </div>

      <div
        className="pointer-events-none absolute top-0 left-0"
        style={{ transform: 'translateY(-50%)' }}
      >
        <div
          className={`pointer-events-auto flex flex-col bg-white border border-black/[0.04] rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.06)] overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${collapsed ? 'w-[240px] h-10' : 'w-[280px] h-[260px]'
            }`}
          onWheel={e => e.stopPropagation()} // keep scroll inside the mini chat
        >
          {/* Header */}
          <div
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-2 px-3 py-2.5 border-b border-black/[0.04] bg-white shrink-0 cursor-pointer hover:bg-gray-50/50 transition-colors group"
          >
            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full shrink-0 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#6b7280] truncate flex-1 min-w-0">
              {displayTitle}
            </span>
            {isGeneratingThisNode && (
              <svg className="w-3 h-3 animate-spin text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            )}
            <div className="flex items-center gap-1">
              {onGoToNode && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onGoToNode(); }}
                  title="Go to branch"
                  className="p-0.5 text-[#9ca3af] hover:text-gray-700 transition-colors shrink-0 rounded-md"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </button>
              )}
              <div className={`p-0.5 bg-black text-white rounded-full flex items-center justify-center transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                </svg>
              </div>
            </div>
          </div>

          {!collapsed && isGeneratingThisNode && showSmartLoading && loadingPhrase && (
            <div className="px-3 py-2 border-b border-[var(--border-color)] bg-zinc-50/60 flex items-center gap-2 text-[10px] text-zinc-500">
              <svg className="w-3 h-3 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="truncate">{loadingPhrase}</span>
            </div>
          )}

          {!collapsed && (
            <div className="flex-1 flex flex-col min-h-0 relative">
              {/* Vertical connection line inside chat area */}
              <div className="absolute left-4 top-0 bottom-0 w-px bg-zinc-100/50 z-0" />

              <div ref={miniScrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2 custom-scrollbar text-[11.5px] relative z-10 bg-white">
                {messages.length === 0 && !isGeneratingThisNode && (
                  <div className="flex items-center justify-center h-full text-[#9ca3af] text-center">No messages yet</div>
                )}
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end pr-1' : 'justify-start'} relative z-10 w-full`}>
                    <div className={`max-w-[92%] transition-all ${msg.role === 'user'
                      ? 'px-2.5 py-1.5 rounded-2xl bg-white border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] text-gray-800 rounded-tr-sm text-[11.5px]'
                      : 'bg-transparent text-gray-800 pl-6 py-1 text-[11.5px] leading-relaxed w-full'
                      }`}>
                      {msg.role === 'model' && (
                        <ThinkingTracePanel
                          trace={msg.thinkingTrace}
                          messageId={`${uniqueMsgId}-branch-${i}`}
                          compact
                          isStreaming={Boolean(isGeneratingThisNode && i === messages.length - 1 && msg.thinkingTrace)}
                        />
                      )}
                      {msg.role === 'user' ? msg.content : (
                        msg.content
                          ? <MiniMarkdown content={msg.content} />
                          : isGeneratingThisNode && i === messages.length - 1
                            ? showSmartLoading && loadingPhrase
                              ? <p className="py-1 text-[10px] uppercase tracking-[0.14em] text-zinc-500/80">{loadingPhrase}</p>
                              : <div className="flex gap-1 py-1"><div className="w-1 h-1 bg-zinc-300 rounded-full animate-bounce" /><div className="w-1 h-1 bg-zinc-300 rounded-full animate-bounce [animation-delay:0.2s]" /><div className="w-1 h-1 bg-zinc-300 rounded-full animate-bounce [animation-delay:0.4s]" /></div>
                            : null
                      )}
                    </div>
                  </div>
                ))}
                {isGeneratingThisNode && messages.length === 0 && (
                  showSmartLoading && loadingPhrase
                    ? <div className="py-1 relative z-10 pl-6 text-[10px] uppercase tracking-[0.14em] text-zinc-500/80">{loadingPhrase}</div>
                    : <div className="flex gap-1 py-1 relative z-10 pl-6"><div className="w-1 h-1 bg-blue-300 rounded-full animate-bounce" /><div className="w-1 h-1 bg-blue-300 rounded-full animate-bounce [animation-delay:0.2s]" /><div className="w-1 h-1 bg-blue-300 rounded-full animate-bounce [animation-delay:0.4s]" /></div>
                )}
                <div ref={messagesEndRef} />
              </div>
              <div className="shrink-0 border-t border-black/[0.04] px-2.5 py-2 flex items-center gap-2 bg-white">
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); handleSend(); }
                  }}
                  placeholder="Type a branch prompt..."
                  disabled={isGeneratingThisNode}
                  className="flex-1 bg-transparent text-[12px] text-gray-700 placeholder:text-gray-400/80 outline-none border-none min-w-0 disabled:opacity-50 tracking-tight"
                />
                {isGeneratingThisNode ? (
                  <button type="button" onClick={onStopGeneration} title="Stop generating"
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors shrink-0">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="6" width="12" height="12" rx="2" ry="2" />
                    </svg>
                  </button>
                ) : (
                  <button type="button" onClick={handleSend} disabled={!input.trim()}
                    className={`p-1.5 transition-all text-gray-300 hover:text-blue-500 disabled:opacity-100`}>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};



export const ChatView: React.FC<ChatViewProps> = ({
  history,
  onSendMessage,
  onSendMessageToNode,
  onSelectNode,
  branchLines = [],
  onBranch,
  nodes = {},
  isGenerating,
  generatingNodeId,
  isBranching,
  onCancelBranch,
  currentNodeId,
  currentTitle,
  selectedModel,
  onModelSelect,
  onStopGeneration,
}) => {
  const { mode } = useTheme();
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [selectedTextData, setSelectedTextData] = useState<{ text: string; x: number; y: number; messageId: string; nodeId: string; blockId: string; blockIndex: number; relativeYInBlock: number; msgRelativeY: number } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleMouseUp = (e: MouseEvent) => {
      setTimeout(() => {
        const selection = window.getSelection();

        // If they clicked inside the floating panel itself, don't clear the selection state
        const target = e.target as HTMLElement;
        // Check if there's any active selection.
        const selObj = window.getSelection();
        if (!selObj || selObj.isCollapsed || !selObj.toString().trim()) {
          setSelectedTextData(null);
          return;
        }

        if (target.closest('.text-selection-panel')) {
          return;
        }

        if (!selection || selection.isCollapsed || !selection.toString().trim()) {
          setSelectedTextData(null);
          return;
        }

        const range = selection.getRangeAt(0);
        const savedRange = range.cloneRange();
        const rect = range.getBoundingClientRect();
        const container = range.commonAncestorContainer;
        const element = container.nodeType === Node.TEXT_NODE ? container.parentElement : (container as HTMLElement);

        const msgEl = element?.closest('[data-message-id]');
        if (!msgEl) {
          setSelectedTextData(null);
          return;
        }

        const messageId = msgEl.getAttribute('data-message-id') || '';
        const nodeId = msgEl.getAttribute('data-node-id') || '';
        const selectionMidY = rect.top + (rect.height / 2);
        const msgRelativeY = selectionMidY - msgEl.getBoundingClientRect().top;

        let blockId = 'unknown';
        let blockIndex = -1;
        let relativeYInBlock = 0;

        const mdWrapper = msgEl.querySelector('.md-content');
        if (mdWrapper) {
          const blocks = Array.from(mdWrapper.children) as HTMLElement[];
          let closestBlock: HTMLElement | null = null;
          let minBlockDist = Infinity;
          const absoluteY = rect.top + (rect.height / 2);

          blocks.forEach((block, idx) => {
            const r = block.getBoundingClientRect();
            let dist = 0;
            if (absoluteY < r.top) dist = r.top - absoluteY;
            else if (absoluteY > r.bottom) dist = absoluteY - r.bottom;

            if (dist < minBlockDist) {
              minBlockDist = dist;
              closestBlock = block;
              blockIndex = idx;
            }
          });

          if (closestBlock) {
            blockId = `block-${blockIndex}-${closestBlock.tagName.toLowerCase()}`;
            const r = closestBlock.getBoundingClientRect();
            const yInside = Math.max(0, Math.min(absoluteY - r.top, r.height));
            relativeYInBlock = r.height > 0 ? yInside / r.height : 0;
          }
        }

        const contentEl = document.querySelector('.flex-1.overflow-y-auto');
        if (!contentEl) {
          setSelectedTextData(null);
          return;
        }

        // We should position the label relative to the entire ChatView container
        // because the floating panel is rendered outside the scrolling area.
        const containerRect = containerRef.current?.getBoundingClientRect();
        if (!containerRect) {
          setSelectedTextData(null);
          return;
        }

        const x = rect.left + rect.width / 2 - containerRect.left;
        const y = rect.top - containerRect.top;

        setSelectedTextData({
          text: selection.toString().trim(),
          x,
          y,
          messageId,
          nodeId,
          blockId,
          blockIndex,
          relativeYInBlock,
          msgRelativeY,
        });

        // Rendering the floating panel can cause ReactMarkdown to re-render and collapse the selection.
        // Re-apply the saved range on the next frame so the highlight "sticks".
        requestAnimationFrame(() => {
          const sel = window.getSelection();
          if (!sel) return;
          sel.removeAllRanges();
          sel.addRange(savedRange);
        });
      }, 50); // slight delay to allow selection to form
    };

    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isAtBottomRef = useRef(true);
  const [userHasScrolledUp, setUserHasScrolledUp] = useState(false);
  const [showMinimap, setShowMinimap] = useState(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Track where the submit came from — only scroll to bottom for 'main'
  const [loadingSource, setLoadingSource] = useState<'main' | 'branch'>('main');
  const [isThinking, setIsThinking] = useState(false);

  // 2. ADD THIS: Wrap the branch submit so it flags the source as 'branch'
  const handleBranchMessage = useCallback((text: string, files: File[], metadata?: BranchMetadata, options?: SendMessageOptions) => {
    setLoadingSource('branch');
    if (onSendMessage) onSendMessage(text, files, metadata, isThinking, options);
  }, [isThinking, onSendMessage]);

  const {
    cursor, activeBranch, composerRef, zoneRef,
    handleMouseMove, handleMouseLeave, handleZoneClick,
    handleBranchSubmit, closeBranch,
  } = useBranchInteraction(containerRef, contentRef, onBranch, handleBranchMessage, onCancelBranch); // Passed contentRef
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [selectedProviderTab, setSelectedProviderTab] = useState('all');
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const modelMenuRef = useRef<HTMLDivElement>(null);

  const providers = ['all', ...Array.from(new Set(MODELS.map(m => m.provider)))];

  const filteredModels = useMemo(() => {
    return MODELS.filter(m => {
      const matchesProvider = selectedProviderTab === 'all' || m.provider === selectedProviderTab;
      const matchesSearch = m.name.toLowerCase().includes(modelSearchQuery.toLowerCase()) ||
        m.description.toLowerCase().includes(modelSearchQuery.toLowerCase());
      return matchesProvider && matchesSearch;
    });
  }, [selectedProviderTab, modelSearchQuery]);

  const selectedModelConfig = useMemo(
    () => MODELS.find((model) => model.id === selectedModel),
    [selectedModel]
  );
  const shouldShowSmartLoading = Boolean(isGenerating && selectedModelConfig?.smartLoading);
  const [loadingPhraseIndex, setLoadingPhraseIndex] = useState(0);
  const loadingPhrase = shouldShowSmartLoading
    ? SMART_MODEL_LOADING_PHRASES[loadingPhraseIndex % SMART_MODEL_LOADING_PHRASES.length]
    : null;

  useEffect(() => {
    if (!shouldShowSmartLoading) {
      setLoadingPhraseIndex(0);
      return;
    }

    const intervalId = window.setInterval(() => {
      setLoadingPhraseIndex((prev) => (prev + 1) % SMART_MODEL_LOADING_PHRASES.length);
    }, 2200);

    return () => window.clearInterval(intervalId);
  }, [shouldShowSmartLoading, selectedModel]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(event.target as Node)) {
        setIsModelMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsModelMenuOpen(false);
    };

    if (isModelMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isModelMenuOpen]);

  // Only scroll to bottom when new messages arrive in the MAIN chat node
  useEffect(() => {
    if (loadingSource === 'main' && scrollRef.current && !userHasScrolledUp) {
      if (isAtBottomRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }
  }, [history, loadingSource, userHasScrolledUp]);

  // Force scroll to top when currentNodeId changes (e.g., expanding a branch)
  useEffect(() => {
    if (scrollRef.current) {
      isAtBottomRef.current = false;
      setUserHasScrolledUp(true);
      // Slight delay to allow DOM to render new history
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = 0;
        }
      }, 50);
    }
  }, [currentNodeId]);

  // Scroll to bottom while streaming — only for the main node
  useEffect(() => {
    if (isGenerating && generatingNodeId === currentNodeId && scrollRef.current) {
      isAtBottomRef.current = true;
      setUserHasScrolledUp(false);
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [isGenerating, generatingNodeId, currentNodeId]);

  const handleCopyMessage = (content: string, msgId: string) => {
    navigator.clipboard.writeText(content);
    setCopiedMessageId(msgId);
    setTimeout(() => {
      setCopiedMessageId(null);
    }, 2000);
  };

  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const distanceToBottom = scrollHeight - scrollTop - clientHeight;

      if (distanceToBottom > 10) {
        isAtBottomRef.current = false;
        setUserHasScrolledUp(true);
      } else {
        isAtBottomRef.current = true;
        setUserHasScrolledUp(false);
      }

      // Fade out text selection menu if user scrolls
      if (selectedTextData) {
        setSelectedTextData(null);
        window.getSelection()?.removeAllRanges();
      }

      setShowMinimap(true);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        setShowMinimap(false);
      }, 1500) as unknown as ReturnType<typeof setTimeout>;
    }
  }, [selectedTextData]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...newFiles]);
      setTimeout(() => {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }, 0);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items;
    const pastedFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file' && items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) pastedFiles.push(file);
      }
    }
    if (pastedFiles.length > 0) {
      setFiles((prev) => [...prev, ...pastedFiles]);
    }
  };

  // Sync isThinking with model constraints
  useEffect(() => {
    setIsThinking(Boolean(selectedModelConfig?.thinkingOnly || selectedModelConfig?.supportsThinkingTrace));
  }, [selectedModelConfig]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && files.length === 0 || isGenerating) return;

    setLoadingSource('main'); // <--- ADD THIS: Flag source as 'main'

    onSendMessage(input, files, undefined, isThinking);
    setInput('');
    setFiles([]);
    setTimeout(() => {
      const textarea = document.querySelector('textarea');
      if (textarea) textarea.style.height = 'auto';
    }, 0);
  };

  const historyMessageIds = useMemo(() => {
    const ids = new Set<string>();
    history.forEach((node) => {
      node.messages.forEach((_, idx) => {
        ids.add(`${node.id}-${idx}`);
      });
    });
    return ids;
  }, [history]);

  const allMessages: { msg: Message, nodeId: string, isLastInNode: boolean }[] = [];
  history.forEach((node) => {
    node.messages.forEach((msg, idx) => {
      allMessages.push({
        msg,
        nodeId: node.id,
        isLastInNode: idx === node.messages.length - 1
      });
    });
  });

  return (
    <div ref={containerRef} className="w-full h-full flex flex-col bg-transparent overflow-hidden relative">
      {/* Top Fade Overlay (Gemini Style) */}
      <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-[var(--app-bg)] via-[var(--app-bg)] to-transparent z-40 pointer-events-none" />

      {cursor && !activeBranch && allMessages.length > 0 && (
        <BranchGhostLabel x={cursor.x} y={cursor.y} />
      )}

      {/* Floating Text Selection Panel */}
      {selectedTextData && !activeBranch && (
        <div
          className="text-selection-panel absolute z-[70] translate-x-[-50%] pointer-events-auto"
          style={{
            left: selectedTextData.x,
            top: selectedTextData.y - 48, // Tightly above the selection box (48px accounts for the button height and padding)
          }}
        >
          <button
            onClick={() => {
              const trimmed = selectedTextData.text.trim();
              if (!trimmed || isGenerating) {
                setSelectedTextData(null);
                return;
              }

              const prompt = `what is ${trimmed}?`;
              const metadata: BranchMetadata = {
                messageId: selectedTextData.messageId,
                blockId: selectedTextData.blockId,
                blockIndex: selectedTextData.blockIndex,
                relativeYInBlock: selectedTextData.relativeYInBlock,
                textSnippet: trimmed,
                msgRelativeY: selectedTextData.msgRelativeY
              };

              handleBranchMessage(prompt, [], metadata, {
                branchParentId: selectedTextData.nodeId,
                modelId: 'google/gemini-3-flash',
                contextMode: 'none'
              });

              setSelectedTextData(null);
            }}
            className="bg-blue-500 text-white text-[12px] font-medium px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 whitespace-nowrap border border-white/20 hover:bg-blue-600 hover:scale-105 active:scale-95 transition-all outline-none"
          >
            <div className="w-4 h-4 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm">
              <svg className="w-2.5 h-2.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </div>
            <span className="pr-1 tracking-wide truncate max-w-[200px]">
              What is "{selectedTextData.text.length > 15 ? selectedTextData.text.substring(0, 15) + '...' : selectedTextData.text}"?
            </span>
          </button>
        </div>
      )}

      {/* Zone moved inside scroll container to prevent click blocking */}

      {allMessages.length === 0 && !isGenerating && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-300 gap-4 pointer-events-none z-0">
          <div className="w-16 h-16 bg-zinc-50 rounded-2xl flex items-center justify-center border border-zinc-100">
            <svg className="w-8 h-8 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <p className="text-lg font-medium tracking-tight text-zinc-400">Enter a prompt to start this chat.</p>
        </div>
      )}

      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto custom-scrollbar relative z-10 pt-20 pb-48">
        <div className="relative w-full min-h-full">
          {/* Branching Zone — rendered inside scroll content so it doesn't block mini-chats */}
          <div
            className={`absolute top-0 h-full z-0 ${!activeBranch && allMessages.length > 0 ? 'cursor-none' : 'cursor-default'}`}
            style={{ left: 'calc(50% + 384px)', right: 0 }}
            ref={zoneRef}
            onMouseMove={allMessages.length > 0 ? handleMouseMove : undefined}
            onMouseLeave={allMessages.length > 0 ? handleMouseLeave : undefined}
            onMouseDown={allMessages.length > 0 ? handleZoneClick : undefined}
            onWheel={e => {
              if (scrollRef.current) scrollRef.current.scrollTop += e.deltaY;
            }}
          />
          <div className="max-w-3xl mx-auto px-6 pt-8 pb-12 space-y-8 relative" ref={contentRef}>
            {allMessages.map(({ msg, nodeId }, idx) => {
              const uniqueMsgId = `${nodeId}-${idx}`;
              const isStreamingMessage = Boolean(
                msg.role === 'model' &&
                isGenerating &&
                generatingNodeId === nodeId &&
                idx === allMessages.length - 1 &&
                msg.thinkingTrace
              );

              return (
                <div
                  id={`msg-${idx}`}
                  key={uniqueMsgId}
                  data-node-id={nodeId}
                  data-message-id={uniqueMsgId}
                  className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'} group animate-in fade-in slide-in-from-bottom-2 duration-500`}
                >
                  <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} max-w-full`}>
                    <div className={`max-w-full px-5 py-3 rounded-2xl relative transition-all duration-300 ${msg.role === 'user' ? 'bg-[#f4f4f4] text-zinc-900 border border-zinc-200' : 'bg-transparent text-zinc-800 pl-0'}`}>
                      {msg.role === 'model' && (
                        <ThinkingTracePanel
                          trace={msg.thinkingTrace}
                          messageId={uniqueMsgId}
                          isStreaming={isStreamingMessage}
                        />
                      )}

                      <div className="md-content relative z-10">
                        <MarkdownMessage content={DOMPurify.sanitize(msg.content)} mode={mode} isUser={msg.role === 'user'} />
                      </div>
                    </div>

                    <div className={`mt-1.5 flex items-center gap-3 opacity-40 group-hover:opacity-100 focus-within:opacity-100 transition-all ${msg.role === 'user' ? 'text-zinc-500 pr-2' : 'text-zinc-500 pl-1'}`}>
                      {msg.role === 'model' && (
                        <button onClick={() => onBranch(nodeId)} className="flex items-center gap-1.5 hover:text-blue-400 transition-colors py-1">
                          <span className="text-[10px] uppercase font-bold tracking-widest">Create new branch</span>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                        </button>
                      )}
                      <button
                        onClick={() => handleCopyMessage(msg.content, uniqueMsgId)}
                        className="flex items-center gap-1.5 hover:text-blue-500 transition-colors py-1 px-1.5 rounded-md hover:bg-blue-50/50"
                        title="Copy message"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Move BranchComposer inside the content container so it scrolls with history */}
            {activeBranch && (
              <BranchComposer
                anchorY={activeBranch.y}
                initialText={selectedTextData && selectedTextData.nodeId === activeBranch.nodeId ? `What is ${selectedTextData.text}?` : ''}
                onSend={handleBranchSubmit}
                onClose={() => closeBranch(true)}
                composerRef={composerRef}
                selectedModel={selectedModel}
                onModelSelect={onModelSelect}
              />
            )}

            {/* ONLY show this spinner if the request came from the main input and model hasn't started replying */}
            {isGenerating && loadingSource === 'main' && allMessages.length > 0 &&
              allMessages[allMessages.length - 1].msg.role === 'model' &&
              !allMessages[allMessages.length - 1].msg.content.trim() && (
                <div className="flex justify-start pl-0 py-2 animate-in fade-in duration-300">
                  <div className="inline-flex items-center gap-3 rounded-2xl border border-zinc-200/60 bg-white/80 px-4 py-2 shadow-sm">
                    <svg className="w-5 h-5 animate-spin text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    {loadingPhrase ? (
                      <span className="text-sm text-zinc-600/90">{loadingPhrase}</span>
                    ) : (
                      <span className="text-sm text-[var(--app-text-muted)]">Generating response</span>
                    )}
                  </div>
                </div>
              )}
            {/* Mini chat overlays moved inside max-w-3xl container */}
            {branchLines
              .filter(line => historyMessageIds.has(line.messageId) && line.targetNodeId !== currentNodeId)
              .map((line, i) => {
                const branchNode = line.targetNodeId ? nodes[line.targetNodeId] : undefined;
                const isGeneratingThisNode = isGenerating && generatingNodeId === line.targetNodeId;
                const activeNode = history.find(n => n.id === currentNodeId);
                const displayTitle = (activeNode as any)?.title || currentTitle;
                return (
                  <BranchMiniChat
                    key={line.targetNodeId ?? i}
                    line={line}
                    uniqueMsgId={line.messageId}
                    branchNode={branchNode}
                    isGeneratingThisNode={isGeneratingThisNode}
                    loadingPhrase={loadingPhrase}
                    showSmartLoading={Boolean(selectedModelConfig?.smartLoading)}
                    title={displayTitle}
                    containerRef={contentRef}
                    scrollRef={scrollRef}
                    onSendMessage={
                      line.targetNodeId && onSendMessageToNode
                        ? (text, files) => onSendMessageToNode!(line.targetNodeId!, text, files, isThinking)
                        : undefined
                    }
                    onGoToNode={
                      line.targetNodeId && onSelectNode
                        ? () => onSelectNode!(line.targetNodeId!)
                        : undefined
                    }
                    onStopGeneration={onStopGeneration}
                  />
                );
              })}
          </div>
        </div>
      </div>

      {/* Minimap */}
      <div
        className={`hidden md:block absolute right-4 top-24 bottom-32 w-4 z-50 transition-opacity duration-300 ${showMinimap ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onMouseEnter={() => {
          setShowMinimap(true);
          if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
        }}
        onMouseLeave={() => {
          scrollTimeoutRef.current = setTimeout(() => setShowMinimap(false), 1000);
        }}
      >
        <div className="w-full h-full flex flex-col gap-1 py-2 overflow-hidden items-end">
          {allMessages.map((m, i) => (
            <div
              key={i}
              onClick={() => document.getElementById(`msg-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              className={`w-full rounded-sm cursor-pointer transition-all ${m.msg.role === 'user' ? 'bg-blue-500 opacity-60 hover:opacity-100' : 'bg-zinc-500 opacity-40 hover:opacity-100'
                }`}
              style={{ height: `${Math.max(4, Math.min((m.msg.content.length / 50), 60))}px`, minHeight: '8px' }}
              title={`${m.msg.role}: ${m.msg.content.substring(0, 20)}...`}
            />
          ))}
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 pb-10 pt-32 z-30 pointer-events-none" style={{ background: 'linear-gradient(to top, var(--app-bg) 40%, transparent 100%)' }}>
        <div className="max-w-3xl mx-auto px-6 pointer-events-auto">

          <div className="flex flex-col gap-0 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[2rem] p-0.5 transition-all shadow-sm focus-within:border-zinc-400 focus-within:shadow-md">

            {files.length > 0 && (
              <AttachmentPreviewStrip files={files} onRemove={removeFile} className="px-4 pt-4" />
            )}

            <form onSubmit={handleSubmit} className="w-full flex flex-col gap-2 px-3 pb-3 pt-2 relative">

              <input
                type="file"
                multiple
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileSelect}
              />

              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPaste={handlePaste}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
                placeholder="Message Klados..."
                className="w-full bg-transparent border-none px-2 py-2 text-base font-medium focus:outline-none placeholder:text-[var(--app-text-muted)] text-[var(--app-text)] resize-none overflow-y-auto custom-scrollbar min-h-[44px]"
                style={{ minHeight: '44px', maxHeight: '200px', height: 'auto' }}
                rows={1}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = Math.min(target.scrollHeight, 200) + 'px';
                }}
              />



              <div className="flex items-center justify-between relative">
                <div className="flex items-center gap-2" ref={modelMenuRef}>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isGenerating}
                    className="p-2 text-zinc-400 hover:text-blue-400 rounded-full transition-all disabled:opacity-50"
                    title="Attach files"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsModelMenuOpen(!isModelMenuOpen)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/50 transition-all group"
                  >
                    <span>{selectedModelConfig?.name || 'Select Model'}</span>
                    <svg className={`w-3.5 h-3.5 transition-transform ${isModelMenuOpen ? 'rotate-180 text-zinc-900' : 'text-zinc-400 group-hover:text-zinc-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" /></svg>
                  </button>

                  {isModelMenuOpen && (
                    <div className="absolute bottom-[calc(100%+16px)] left-0 w-[420px] max-h-[400px] bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl flex overflow-hidden shadow-2xl z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                      <div className="w-14 bg-[var(--sidebar-bg)] border-r border-[var(--border-color)] flex flex-col items-center py-3 gap-3">
                        {providers.map(p => (
                          <button
                            key={p}
                            onClick={() => setSelectedProviderTab(p)}
                            title={p.charAt(0).toUpperCase() + p.slice(1)}
                            className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all group ${selectedProviderTab === p ? 'bg-zinc-800 shadow-inner' : 'hover:bg-zinc-800/50'
                              }`}
                          >
                            <ProviderIcon provider={p} isActive={selectedProviderTab === p} />
                          </button>
                        ))}
                      </div>

                      <div className="flex-1 flex flex-col bg-[var(--card-bg)] min-w-0">
                        <div className="p-3 border-b border-[var(--border-color)] space-y-2.5">
                          <div className="flex items-center justify-between px-1">
                            <span className="text-[13px] font-semibold text-[var(--app-text)]">Models</span>
                            <button
                              onClick={() => window.location.href = "https://buy.stripe.com/00w9AVbsA88M9438lC1Nu01"}
                              className="text-[10px] uppercase tracking-wider font-bold bg-blue-50 text-blue-600 border border-blue-100 px-2 py-1 rounded-lg hover:bg-blue-100 transition-colors"
                            >
                              Unlock All
                            </button>
                          </div>
                          <div className="relative flex items-center">
                            <svg className="absolute left-3 w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            <input
                              type="text"
                              value={modelSearchQuery}
                              onChange={(e) => setModelSearchQuery(e.target.value)}
                              placeholder="Search models..."
                              className="w-full bg-[var(--sidebar-bg)] border border-[var(--border-color)] text-xs text-[var(--app-text)] rounded-lg py-2 pl-9 pr-3 focus:outline-none transition-all"
                            />
                          </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2 space-y-0.5 custom-scrollbar">
                          {filteredModels.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-24 text-xs text-zinc-400">
                              <p>No models found.</p>
                            </div>
                          ) : (
                            filteredModels.map((model) => {
                              const isLocked = isModelLockedForPublicLaunch(model);

                              return (
                                <div
                                  key={model.id}
                                  onClick={() => {
                                    if (isLocked) return;
                                    onModelSelect(model.id);
                                    setIsModelMenuOpen(false);
                                  }}
                                  className={`group flex flex-col p-2.5 rounded-xl transition-colors ${isLocked ? 'opacity-60 cursor-not-allowed' : 'hover:bg-[var(--msg-user)] cursor-pointer'}`}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className={`font-semibold text-[13px] ${selectedModel === model.id ? 'text-[var(--app-text)]' : isLocked ? 'text-[var(--app-text-muted)]' : 'text-[var(--app-text-muted)] group-hover:text-[var(--app-text)]'}`}>
                                        {model.name}
                                      </span>
                                      {model.isPremium && (
                                        <div className="flex items-center gap-1 bg-blue-50 border border-blue-100 rounded text-blue-600 px-1 py-0.5">
                                          <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 12L12 22L22 12L12 2Z" /></svg>
                                          <span className="text-[9px] font-bold uppercase tracking-wider">Locked</span>
                                        </div>
                                      )}
                                      {model.supportsThinkingTrace && (
                                        <div className="rounded bg-zinc-100 border border-zinc-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                                          Trace
                                        </div>
                                      )}
                                      {selectedModel === model.id && (
                                        <svg className="w-3.5 h-3.5 text-blue-600 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                      )}
                                    </div>
                                    <div className={`flex items-center gap-2 text-zinc-300 transition-opacity ${isLocked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                      <svg className="w-3.5 h-3.5 hover:text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><title>Info</title><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    </div>
                                  </div>
                                  <p className="text-[11px] text-[var(--app-text-muted)] mt-0.5 truncate pr-4">{model.description}</p>
                                </div>
                              )
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {isGenerating ? (
                  <button
                    type="button"
                    onClick={onStopGeneration}
                    className="p-2 rounded-xl transition-all text-[var(--app-text)] hover:text-[var(--accent-color)] hover:scale-[1.02] active:scale-[0.98]"
                    title="Stop generating"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" ry="2" /></svg>
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={(!input.trim() && files.length === 0)}
                    className={`p-2 rounded-xl transition-all ${(!input.trim() && files.length === 0) ? 'text-zinc-200 cursor-not-allowed' : 'text-white bg-blue-600 hover:bg-blue-700'} hover:scale-[1.02] active:scale-[0.98]`}
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
