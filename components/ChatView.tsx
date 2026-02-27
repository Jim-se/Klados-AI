import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { ChatNode, Message } from '../types';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight, vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from '../src/contexts/ThemeContext';
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
  onSendMessage: (text: string, files: File[], branchMetadata?: BranchMetadata) => void;
  onSendMessageToNode?: (nodeId: string, text: string, files: File[]) => void;
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
    className="absolute pointer-events-none z-[70] flex items-center gap-1.5 select-none"
    style={{ left: x + 10, top: y - 9 }}
  >
    <svg className="w-3.5 h-3.5 text-blue-500/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
    </svg>
    <span className="text-[11px] font-bold tracking-tight text-blue-500/80 uppercase whitespace-nowrap">
      Create branch
    </span>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// BranchComposer — spawns at click Y, aligned to message column right edge
// ─────────────────────────────────────────────────────────────────────────────

interface BranchComposerProps {
  anchorY: number;
  onSend: (text: string, files: File[]) => void;
  onClose: () => void;
  selectedModel: string;
  onModelSelect: (modelId: string) => void;
}

const BranchComposer: React.FC<BranchComposerProps & { composerRef: React.RefObject<HTMLDivElement> }> = ({ anchorY, onSend, onClose, selectedModel, onModelSelect, composerRef }) => {
  const [text, setText] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

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
      className="branch-composer-ui absolute z-[60] bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] flex flex-col p-1.5 animate-in fade-in zoom-in-95 duration-150 transition-all"
      style={{
        top: anchorY - 24,
        left: 'calc(50% + 384px + 12px)',
        width: 300,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <input type="file" multiple ref={fileInputRef} className="hidden" onChange={handleFileSelect} />

      {/* File Previews */}
      {files.length > 0 && (
        <div className="flex gap-2 pb-2 px-1 overflow-x-auto custom-scrollbar">
          {files.map((file, i) => (
            <div key={i} className="flex items-center gap-1.5 bg-[var(--sidebar-bg)] rounded-lg px-2 py-1 text-[10px] text-[var(--app-text-muted)] border border-[var(--border-color)] shrink-0">
              <span className="truncate max-w-[100px]">{file.name}</span>
              <button type="button" onClick={() => removeFile(i)} className="hover:text-red-500 transition-colors">✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Top Row: Input & Actions */}
      <div className="flex items-center gap-1">
        <button type="button" onClick={onClose} title="Cancel (Esc)" className="p-1 text-[var(--app-text-muted)] hover:text-[var(--app-text)] transition-colors rounded shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
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
          placeholder="Type a branch prompt…"
          className="flex-1 bg-transparent border-none text-sm text-[var(--app-text)] placeholder:text-[var(--app-text-muted)] focus:ring-0 outline-none px-1 min-w-0"
        />

        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          title="Toggle Options"
          className={`p-1 transition-colors rounded shrink-0 ${isExpanded ? 'text-[var(--app-text)] bg-[var(--sidebar-bg)]' : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'}`}
        >
          <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : 'rotate-0'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <button
          type="button"
          onClick={handleSend}
          disabled={!text.trim() && files.length === 0}
          className="bg-[var(--accent-color)] hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed text-white p-1.5 rounded-lg transition-all shrink-0"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
        </button>
      </div>

      {/* Expanded Bottom Row: File & Model Options */}
      {isExpanded && (
        <div className="flex items-center gap-2 pt-2 pb-0.5 px-1 mt-1 border-t border-[var(--border-color)] animate-in slide-in-from-top-2 fade-in duration-200">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Attach files"
            className="p-1.5 text-[var(--app-text-muted)] hover:text-[var(--accent-color)] rounded-full transition-all hover:bg-[var(--sidebar-bg)]"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsModelMenuOpen(!isModelMenuOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold text-[var(--app-text-muted)] hover:text-[var(--app-text)] bg-[var(--sidebar-bg)] transition-all group border border-[var(--border-color)]"
            >
              <span className="truncate max-w-[120px]">{currentModel?.name || 'Branch Model'}</span>
              <svg className="w-3.5 h-3.5 text-[var(--app-text-muted)] group-hover:text-[var(--app-text)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" /></svg>
            </button>

            {/* Mini Model Menu */}
            {isModelMenuOpen && (
              <div className="absolute top-[calc(100%+6px)] left-0 w-48 max-h-48 overflow-y-auto bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl shadow-xl z-[70] p-1 custom-scrollbar">
                {MODELS.map(model => (
                  <button
                    key={model.id}
                    onClick={() => { onModelSelect(model.id); setIsModelMenuOpen(false); }}
                    className={`w-full flex justify-between items-center text-left px-2 py-1.5 text-[11px] rounded-lg transition-colors ${selectedModel === model.id ? 'bg-[var(--accent-color)]/20 text-[var(--app-text)] font-semibold' : 'text-[var(--app-text-muted)] hover:bg-[var(--sidebar-bg)] hover:text-[var(--app-text)]'}`}
                  >
                    <span className="truncate">{model.name}</span>
                    {selectedModel === model.id && <svg className="w-3 h-3 text-[var(--accent-color)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
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
  onBranch?: (nodeId: string) => void,
  onSendMessage?: (text: string, files: File[], branchMetadata?: BranchMetadata) => void, // <--- Using standard onSendMessage
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
    if (activeBranch) {
      closeBranch(true);
      return;
    }
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;

    const relY = e.clientY - containerRect.top;
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

  // ── Submit Logic ──────────────────────────────────────────────────────────
  const handleBranchSubmit = useCallback((text: string, files: File[]) => {
    if (!activeBranch) return;
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;

    const absoluteClickY = containerRect.top + activeBranch.y;
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

const MODELS = [
  { id: 'google/gemini-2.0-flash-lite-preview-02-05:free', name: 'Gemini 2.0 Flash Lite', provider: 'google', description: 'Lightning-fast with surprising capability', isPremium: false },
  { id: 'google/gemini-2.0-pro-exp-02-05:free', name: 'Gemini 2.0 Pro Exp', provider: 'google', description: 'Google\'s newest flagship with advanced reasoning', isPremium: true },
  { id: 'google/gemini-pro-1.5', name: 'Gemini 1.5 Pro', provider: 'google', description: 'High fidelity generation built on Gemini', isPremium: true },
  { id: 'arcee-ai/trinity-large-preview:free', name: 'Trinity Large (Free)', provider: 'arcee', description: 'Advanced preview model from Arcee AI', isPremium: false },
  { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'openai', description: 'OpenAI\'s latest with breakthrough speed and intelligence', isPremium: true },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', description: 'Fast, affordable model for everyday tasks', isPremium: false },
  { id: 'openai/o1-preview', name: 'GPT-o1 Preview', provider: 'openai', description: 'Advanced reasoning and problem-solving capabilities', isPremium: true },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude Sonnet 3.5', provider: 'anthropic', description: 'Anthropic\'s most advanced Sonnet yet', isPremium: true },
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
  title?: string;
  onSendMessage?: (text: string, files: File[]) => void;
  onGoToNode?: () => void;
  onStopGeneration?: () => void;
  containerRef: React.RefObject<HTMLDivElement>;
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
      {content}
    </ReactMarkdown>
  );
};

const BranchMiniChat: React.FC<BranchMiniChatProps> = ({
  line, uniqueMsgId, branchNode, isGeneratingThisNode, title, onSendMessage, onGoToNode, onStopGeneration, containerRef
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
  }, [line, uniqueMsgId, containerRef, history.length]); // Re-run when history changes to adjust for new content layout


  useEffect(() => {
    if (!collapsed) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, collapsed]);

  const handleSend = () => {
    if (!input.trim() || !onSendMessage) return;
    onSendMessage(input.trim(), []);
    setInput('');
  };

  const displayTitle = branchNode?.title && branchNode.title !== '...' ? branchNode.title : (title || 'Branch');
  if (!pos) return null;

  const panelTop = collapsed ? pos.top - 18 : pos.top - 120;

  return (
    // z-[60] — sits above the branch zone (z-40) and BranchComposer (z-60 too, but this is fine)
    <div
      className="absolute z-[60] pointer-events-none"
      style={{ top: pos.top, left: pos.left }}
    >
      {/* Blue connecting line — from left edge back to the message bubble */}
      <div
        className="pointer-events-none absolute top-[1px] h-[2px] bg-blue-400 shadow-[0_0_10px_2px_rgba(59,130,246,0.7)]"
        style={{ width: LINE_WIDTH, left: -LINE_WIDTH }}
      >
        <div className="absolute left-0 top-[-2px] w-1.5 h-1.5 bg-blue-100 rounded-full shadow-[0_0_8px_2px_rgba(255,255,255,0.8)]" />
        <div className="absolute right-0 top-[-2px] w-1.5 h-1.5 bg-blue-400 rounded-full" />
      </div>

      {/* Mini chat panel — pointer-events-auto so it captures mouse fully */}
      <div
        className="pointer-events-auto absolute flex flex-col bg-white border border-zinc-200 rounded-2xl shadow-xl overflow-hidden transition-all duration-200"
        style={{
          top: panelTop - pos.top,
          left: 0,
          width: 280,
          height: collapsed ? 36 : 260,
        }}
        onWheel={e => e.stopPropagation()} // keep scroll inside the mini chat
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-zinc-100 bg-zinc-50 shrink-0">
          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 truncate flex-1 min-w-0">
            {displayTitle}
          </span>
          {isGeneratingThisNode && (
            <svg className="w-3 h-3 animate-spin text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          )}
          {onGoToNode && (
            <button type="button" onClick={onGoToNode} title="Go to branch"
              className="p-0.5 text-zinc-600 hover:text-blue-400 transition-colors shrink-0">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </button>
          )}
          <button type="button" onClick={() => setCollapsed(c => !c)} title={collapsed ? 'Expand' : 'Collapse'}
            className="p-0.5 text-zinc-600 hover:text-zinc-300 transition-colors shrink-0">
            <svg className={`w-3 h-3 transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {!collapsed && (
          <>
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 custom-scrollbar text-[11px]">
              {messages.length === 0 && !isGeneratingThisNode && (
                <div className="flex items-center justify-center h-full text-zinc-600 text-center">No messages yet</div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[92%] px-2.5 py-1.5 rounded-xl leading-relaxed ${msg.role === 'user' ? 'bg-[#f4f4f4] border border-zinc-200 text-zinc-900 rounded-tr-none text-[11px]' : 'bg-transparent pl-0'
                    }`}>
                    {msg.role === 'user' ? msg.content : (
                      msg.content
                        ? <MiniMarkdown content={msg.content} />
                        : isGeneratingThisNode && i === messages.length - 1
                          ? <span className="text-zinc-500 italic">Thinking…</span>
                          : null
                    )}
                  </div>
                </div>
              ))}
              {isGeneratingThisNode && messages.length === 0 && (
                <div className="text-zinc-500 italic px-1">Thinking…</div>
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="shrink-0 border-t border-zinc-100 px-2 py-1.5 flex items-center gap-1.5 bg-white">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); handleSend(); }
                }}
                placeholder="Continue branch…"
                disabled={isGeneratingThisNode}
                className="flex-1 bg-transparent text-[11px] text-zinc-900 placeholder:text-zinc-400 outline-none border-none min-w-0 disabled:opacity-50"
              />
              {isGeneratingThisNode ? (
                <button type="button" onClick={onStopGeneration} title="Stop generating"
                  className="p-1 text-red-500 hover:text-red-600 transition-colors shrink-0">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="2" ry="2" />
                  </svg>
                </button>
              ) : (
                <button type="button" onClick={handleSend}
                  disabled={!input.trim()}
                  className="p-1 text-blue-600 hover:text-blue-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              )}
            </div>
          </>
        )}
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
  const [input, setInput] = React.useState('');
  const [files, setFiles] = useState<File[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isAtBottomRef = useRef(true);
  const [userHasScrolledUp, setUserHasScrolledUp] = useState(false);
  const [showMinimap, setShowMinimap] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Track where the submit came from — only scroll to bottom for 'main'
  const [loadingSource, setLoadingSource] = useState<'main' | 'branch'>('main');

  // 2. ADD THIS: Wrap the branch submit so it flags the source as 'branch'
  const handleBranchMessage = useCallback((text: string, files: File[], metadata?: BranchMetadata) => {
    setLoadingSource('branch');
    if (onSendMessage) onSendMessage(text, files, metadata);
  }, [onSendMessage]);

  const {
    cursor, activeBranch, composerRef, zoneRef,
    handleMouseMove, handleMouseLeave, handleZoneClick,
    handleBranchSubmit, closeBranch,
  } = useBranchInteraction(containerRef, onBranch, handleBranchMessage, onCancelBranch); // <--- Passed the wrapper here
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

  const handleScroll = () => {
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

      setShowMinimap(true);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        setShowMinimap(false);
      }, 1500);
    }
  };

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && files.length === 0 || isGenerating) return;

    setLoadingSource('main'); // <--- ADD THIS: Flag source as 'main'

    onSendMessage(input, files);
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
    <div ref={containerRef} className="w-full h-full flex flex-col bg-transparent overflow-hidden pt-20 relative">

      {cursor && !activeBranch && (
        <BranchGhostLabel x={cursor.x} y={cursor.y} />
      )}

      {/* Zone moved inside scroll container to prevent click blocking */}

      {activeBranch && (
        <BranchComposer
          anchorY={activeBranch.y}
          onSend={handleBranchSubmit}
          onClose={() => closeBranch(true)}
          composerRef={composerRef}
          selectedModel={selectedModel}
          onModelSelect={onModelSelect}
        />
      )}

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

      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto custom-scrollbar relative z-10">
        <div className="relative w-full min-h-full" ref={contentRef}>
          {/* Branching Zone — rendered inside scroll content so it doesn't block mini-chats */}
          <div
            className="absolute top-0 h-full z-0 cursor-default"
            style={{ left: 'calc(50% + 384px)', right: 0 }}
            ref={zoneRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onMouseDown={handleZoneClick}
            onWheel={e => {
              if (scrollRef.current) scrollRef.current.scrollTop += e.deltaY;
            }}
          />
          <div className="max-w-3xl mx-auto px-6 pt-8 pb-12 space-y-8">
            {allMessages.map(({ msg, nodeId }, idx) => {
              const uniqueMsgId = `${nodeId}-${idx}`;

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

                      <div className="md-content relative z-10">
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
                                    className="flex items-center gap-1.5 hover:text-white transition-colors"
                                  >
                                    <svg
                                      className="w-4 h-4"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                      xmlns="http://www.w3.org/2000/svg"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-8a2 2 0 00-2-2z"
                                      />
                                    </svg>                                  <span>Copy</span>
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
                          p: ({ node, ...props }) => <p className={`leading-relaxed ${msg.role === 'user' ? 'mb-0' : 'mb-4 text-[var(--app-text)] opacity-90'}`} {...props} />,
                          ul: ({ node, ...props }) => <ul className="list-disc list-inside mb-4 space-y-2 text-[var(--app-text)] opacity-90" {...props} />,
                          ol: ({ node, ...props }) => <ol className="list-decimal list-inside mb-4 space-y-2 text-[var(--app-text)] opacity-90" {...props} />,
                          li: ({ node, ...props }) => <li className="text-[var(--app-text)] opacity-90" {...props} />,
                          strong: ({ node, ...props }) => <strong className="font-bold text-[var(--app-text)]" {...props} />,
                          a: ({ node, ...props }) => <a className="text-[var(--accent-color)] hover:opacity-80 underline" target="_blank" rel="noopener noreferrer" {...props} />,
                          blockquote: ({ node, ...props }) => <blockquote className="border-l-4 border-[var(--border-color)] pl-4 italic text-[var(--app-text-muted)] my-4" {...props} />,
                        }}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    </div>

                    <div className={`mt-1.5 flex items-center gap-3 opacity-40 group-hover:opacity-100 focus-within:opacity-100 transition-all ${msg.role === 'user' ? 'text-zinc-500 pr-2' : 'text-zinc-500 pl-1'}`}>
                      {msg.role === 'model' && (
                        <button onClick={() => onBranch(nodeId)} className="flex items-center gap-1.5 hover:text-blue-400 transition-colors py-1">
                          <span className="text-[10px] uppercase font-bold tracking-widest">Create new branch</span>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                        </button>
                      )}
                      <button onClick={() => handleCopyMessage(msg.content, uniqueMsgId)} className="flex items-center gap-1.5 hover:text-blue-400 transition-colors py-1">
                        <span className="text-[10px] uppercase font-bold tracking-widest">
                          {copiedMessageId === uniqueMsgId ? 'Copied!' : 'Copy'}
                        </span>
                        {copiedMessageId === uniqueMsgId ? (
                          <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        ) : (
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-8a2 2 0 00-2-2z"
                            />
                          </svg>)}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* ONLY show this spinner if the request came from the main input */}
            {isGenerating && loadingSource === 'main' && (
              <div className="flex justify-start pl-8 py-2 animate-in fade-in duration-300">
                <svg className="w-6 h-6 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            )}
          </div>

          {/* Mini chat overlays — rendered inside the scroll CONTENT so they move natively! */}
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
                  title={displayTitle}
                  containerRef={contentRef}
                  onSendMessage={
                    line.targetNodeId && onSendMessageToNode
                      ? (text, files) => onSendMessageToNode!(line.targetNodeId!, text, files)
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

      {/* Minimap */}
      <div
        className={`absolute right-4 top-24 bottom-32 w-4 z-50 transition-opacity duration-300 ${showMinimap ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
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

      <div className="w-full bg-gradient-to-t from-white via-white/80 to-transparent pb-10 pt-6 z-20">
        <div className="max-w-3xl mx-auto px-6">
          {isBranching && (
            <div className="flex items-center justify-between px-6 py-2.5 bg-blue-50 border border-blue-100 text-blue-600 rounded-t-2xl mb-[-1px] mx-2 animate-in slide-in-from-bottom-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Creating new branch</span>
              </div>
              <button onClick={onCancelBranch} className="text-[9px] font-bold uppercase hover:text-blue-700 transition-colors flex items-center gap-1">
                Dismiss
              </button>
            </div>
          )}

          <div className={`flex flex-col gap-0 bg-white border rounded-[2rem] p-0.5 transition-all shadow-sm ${isBranching ? 'border-blue-500/50 rounded-t-none ring-2 ring-blue-500/5' : 'border-zinc-200 focus-within:border-zinc-300 focus-within:shadow-md'}`}>

            {files.length > 0 && (
              <div className="w-full flex gap-2 px-4 pt-4 overflow-x-auto custom-scrollbar">
                {files.map((file, i) => (
                  <div key={i} className="flex items-center gap-2 bg-zinc-50 rounded-lg px-3 py-2 text-xs text-zinc-600 border border-zinc-100 shrink-0">
                    <span className="truncate max-w-[150px]">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="hover:text-red-400 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
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
                placeholder={isBranching ? "What should this branch do?" : "Message Klados..."}
                className="w-full bg-transparent border-none px-2 py-2 text-base font-medium focus:outline-none placeholder:text-zinc-400 text-zinc-900 resize-none overflow-y-auto custom-scrollbar min-h-[44px]"
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
                    <span>{MODELS.find(m => m.id === selectedModel)?.name || 'Select Model'}</span>
                    <svg className={`w-3.5 h-3.5 transition-transform ${isModelMenuOpen ? 'rotate-180 text-zinc-900' : 'text-zinc-400 group-hover:text-zinc-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" /></svg>
                  </button>

                  {isModelMenuOpen && (
                    <div className="absolute bottom-[calc(100%+16px)] left-0 w-[420px] max-h-[400px] bg-white border border-zinc-200 rounded-2xl flex overflow-hidden shadow-2xl z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                      <div className="w-14 bg-zinc-50 border-r border-zinc-200 flex flex-col items-center py-3 gap-3">
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

                      <div className="flex-1 flex flex-col bg-white min-w-0">
                        <div className="p-3 border-b border-zinc-100 space-y-2.5">
                          <div className="flex items-center justify-between px-1">
                            <span className="text-[13px] font-semibold text-zinc-900">Models</span>
                            <button className="text-[10px] uppercase tracking-wider font-bold bg-blue-50 text-blue-600 border border-blue-100 px-2 py-1 rounded-lg hover:bg-blue-100 transition-colors">
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
                              className="w-full bg-zinc-50 border border-zinc-200 text-xs text-zinc-900 rounded-lg py-2 pl-9 pr-3 focus:outline-none focus:border-zinc-300 focus:bg-white transition-all"
                            />
                          </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2 space-y-0.5 custom-scrollbar">
                          {filteredModels.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-24 text-xs text-zinc-400">
                              <p>No models found.</p>
                            </div>
                          ) : (
                            filteredModels.map((model) => (
                              <div
                                key={model.id}
                                onClick={() => {
                                  onModelSelect(model.id);
                                  setIsModelMenuOpen(false);
                                }}
                                className="group flex flex-col p-2.5 rounded-xl hover:bg-zinc-50 cursor-pointer transition-colors"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className={`font-semibold text-[13px] ${selectedModel === model.id ? 'text-zinc-900' : 'text-zinc-600 group-hover:text-zinc-900'}`}>
                                      {model.name}
                                    </span>
                                    {model.isPremium && (
                                      <div className="flex items-center gap-1 bg-blue-50 border border-blue-100 rounded text-blue-600 px-1 py-0.5">
                                        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 12L12 22L22 12L12 2Z" /></svg>
                                      </div>
                                    )}
                                    {selectedModel === model.id && (
                                      <svg className="w-3.5 h-3.5 text-blue-600 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <svg className="w-3.5 h-3.5 hover:text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" title="Info"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                  </div>
                                </div>
                                <p className="text-[11px] text-zinc-500 mt-0.5 truncate pr-4">{model.description}</p>
                              </div>
                            ))
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
                    className="p-2 rounded-xl transition-all text-red-500 hover:text-red-400 hover:scale-[1.02] active:scale-[0.98]"
                    title="Stop generating"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" ry="2" /></svg>
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={(!input.trim() && files.length === 0)}
                    className={`p-2 rounded-xl transition-all ${(!input.trim() && files.length === 0) ? 'text-zinc-200 cursor-not-allowed' : (isBranching ? 'text-blue-500 hover:text-blue-600' : 'text-white bg-blue-600 hover:bg-blue-700')} hover:scale-[1.02] active:scale-[0.98]`}
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
