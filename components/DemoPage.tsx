import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BranchMetadata, ChatView, ChatViewTutorialConfig } from './ChatView';
import { NodeView } from './NodeView';
import { ChatNode, GenerationStatus, Message } from '../types';
import { DEFAULT_FREE_MODEL_ID } from '../services/modelCatalog';
import { getFallbackModelCatalog } from '../services/openRouterModels';

type DemoStep = 'branch-zone' | 'branch-prompt' | 'select-text' | 'mini-chat' | 'node-view' | 'done';

const DEMO_ROOT_ID = 'demo-root';
const DEMO_TITLE = 'Klados Guided Demo';
const TUTORIAL_CARD_TOP = 88;

const createMessage = (role: Message['role'], content: string, ordinal: number): Message => ({
  role,
  content,
  ordinal,
  timestamp: Date.now() + ordinal,
});

const createInitialRootNode = (): ChatNode => ({
  id: DEMO_ROOT_ID,
  hierarchicalID: '1',
  parentId: null,
  title: 'Guided Klados Tour',
  timestamp: Date.now(),
  childrenIds: [],
  isBranch: false,
  messages: [
    createMessage('user', 'Show me how Klados helps people explore an idea without losing the main thread.', 0),
    createMessage(
      'model',
      [
        '# Klados turns one idea into many paths',
        '',
        'Klados keeps your original conversation intact while letting you **branch a thought** the moment a side-question appears.',
        '',
        '## What you are about to try',
        '',
        'Hover on the right side of this answer to open a fresh branch.',
        'Highlight a phrase like **branch a thought** to create a focused branch from selected text.',
        'Open a mini chat to compare a branch without leaving the main thread.',
        'Switch to node view to see the whole tree of ideas at once.',
      ].join('\n'),
      1
    ),
  ],
});

const getTargetSelector = (step: DemoStep, selectionReady: boolean) => {
  switch (step) {
    case 'branch-zone':
      return '[data-demo-branch-zone="true"]';
    case 'branch-prompt':
      return '[data-demo-branch-input="true"]';
    case 'select-text':
      return selectionReady
        ? '[data-demo-selection-panel="true"]'
        : `[data-message-id="${DEMO_ROOT_ID}-1"] .md-content`;
    case 'mini-chat':
      return '[data-demo-mini-chat-header="true"]';
    case 'node-view':
      return '[data-demo-node-toggle="true"]';
    default:
      return null;
  }
};

const getCardPosition = (): React.CSSProperties => ({
  left: '50%',
  top: TUTORIAL_CARD_TOP,
  transform: 'translateX(-50%)',
});

const getStepTitle = (step: DemoStep) => {
  switch (step) {
    case 'branch-zone':
      return 'Welcome to Klados';
    case 'branch-prompt':
      return 'Name your new branch';
    case 'select-text':
      return 'Branch from exact text';
    case 'mini-chat':
      return 'Open the mini chat';
    case 'node-view':
      return 'See the full map';
    default:
      return 'You are ready to start';
  }
};

const getStepBody = (step: DemoStep, selectionReady: boolean) => {
  switch (step) {
    case 'branch-zone':
      return 'Move your cursor to the open space on the right side of the answer. When the branch cue appears, click there to open a new branch.';
    case 'branch-prompt':
      return 'Type a short branch prompt, then send it. Try something like "Give me a sharper hero headline angle."';
    case 'select-text':
      return selectionReady
        ? 'Perfect. Click "Create new branch" to turn that highlighted phrase into a focused side path.'
        : 'Now drag across a phrase in the main answer. Klados lets you branch from the exact text that sparked a new thought.';
    case 'mini-chat':
      return 'Your new branches appear as mini chats. Click one of the collapsed branch cards to open it and make it bigger.';
    case 'node-view':
      return 'Switch to node view to see every branch you created as a connected map.';
    default:
      return 'You have seen the core Klados workflow. Continue to create an account and start branching your own ideas.';
  }
};

const getStepIndex = (step: DemoStep) => {
  const orderedSteps: DemoStep[] = ['branch-zone', 'branch-prompt', 'select-text', 'mini-chat', 'node-view'];
  const index = orderedSteps.indexOf(step);
  return index === -1 ? orderedSteps.length : index + 1;
};

const getBranchTitle = (prompt: string, metadata?: BranchMetadata) => {
  const trimmed = prompt.trim();
  if (metadata?.triggerSource === 'selection') {
    return 'Selected Text Branch';
  }

  if (!trimmed) {
    return 'New Branch';
  }

  const words = trimmed.split(/\s+/).slice(0, 4).join(' ');
  return words.length < trimmed.length ? `${words}...` : words;
};

const getChildLabel = (parent: ChatNode) => {
  const nextIndex = parent.childrenIds.length;
  if (parent.parentId === null) {
    return `${parent.hierarchicalID}.${String.fromCharCode(97 + nextIndex)}`;
  }

  return `${parent.hierarchicalID}.${nextIndex + 1}`;
};

const buildBranchReply = (prompt: string, metadata?: BranchMetadata) => {
  if (metadata?.triggerSource === 'selection') {
    return [
      `That selected phrase matters because it captures the core value of Klados: **${metadata.selectionText || metadata.textSnippet}**.`,
      '',
      'Selection branching lets you ask a precise question without interrupting the rest of the conversation. The main thread stays clean while this side path digs deeper.',
    ].join('\n');
  }

  return [
    `This branch is now exploring **${prompt.trim() || 'a new direction'}** while the original thread stays untouched.`,
    '',
    'That is the core Klados workflow: open a side path when you want a rewrite, a narrower question, or a different angle.',
  ].join('\n');
};

const buildMiniChatReply = (prompt: string) => [
  `This mini chat keeps the follow-up focused on **${prompt.trim() || 'the branch topic'}**.`,
  '',
  'In the real workspace, you can keep refining this branch while the main conversation remains visible beside it.',
].join('\n');

const TutorialOverlay: React.FC<{
  step: DemoStep;
  selectionReady: boolean;
  onSkip: () => void;
  onStart: () => void;
}> = ({ step, selectionReady, onSkip, onStart }) => {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [contentRect, setContentRect] = useState<DOMRect | null>(null);
  const [ghostCursor, setGhostCursor] = useState<{ visible: boolean; x: number; y: number }>({ visible: false, x: 0, y: 0 });
  const [ghostRipple, setGhostRipple] = useState<{ visible: boolean; x: number; y: number; key: number }>({
    visible: false,
    x: 0,
    y: 0,
    key: 0,
  });
  const [ghostMiniChat, setGhostMiniChat] = useState<{ visible: boolean; left: number; top: number; expanded: boolean }>({
    visible: false,
    left: 0,
    top: 0,
    expanded: false,
  });
  const [ghostComposer, setGhostComposer] = useState<{ visible: boolean; left: number; top: number; expanded: boolean }>({
    visible: false,
    left: 0,
    top: 0,
    expanded: false,
  });
  const [ghostSelectionClick, setGhostSelectionClick] = useState(false);
  const [ghostTyping, setGhostTyping] = useState<{ visible: boolean; text: string }>({ visible: false, text: '' });
  const timersRef = useRef<number[]>([]);
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return true;
    }
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const clearGhostTimers = () => {
    timersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    timersRef.current = [];
  };

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const updateTarget = () => {
      const selector = getTargetSelector(step, selectionReady);
      const element = selector ? document.querySelector(selector) as HTMLElement | null : null;
      if (!element) {
        setTargetRect(null);
        return;
      }

      const rect = element.getBoundingClientRect();
      setTargetRect(rect);

      const mainColumn = document.querySelector<HTMLElement>('.max-w-3xl.mx-auto');
      if (mainColumn) {
        setContentRect(mainColumn.getBoundingClientRect());
      }
    };

    updateTarget();
    window.addEventListener('resize', updateTarget);
    document.addEventListener('scroll', updateTarget, true);

    return () => {
      window.removeEventListener('resize', updateTarget);
      document.removeEventListener('scroll', updateTarget, true);
    };
  }, [selectionReady, step]);

  useEffect(() => {
    clearGhostTimers();
    setGhostCursor((prev) => ({ ...prev, visible: false }));
    setGhostRipple((prev) => ({ ...prev, visible: false }));
    setGhostMiniChat((prev) => ({ ...prev, visible: false, expanded: false }));
    setGhostComposer((prev) => ({ ...prev, visible: false, expanded: false }));
    setGhostSelectionClick(false);
    setGhostTyping({ visible: false, text: '' });

    if (prefersReducedMotion) {
      return () => clearGhostTimers();
    }

    if (!targetRect) {
      return () => clearGhostTimers();
    }

    const schedule = (fn: () => void, delayMs: number) => {
      const id = window.setTimeout(fn, delayMs);
      timersRef.current.push(id);
    };

    const showRippleAt = (x: number, y: number) => {
      setGhostRipple((prev) => ({ visible: true, x, y, key: prev.key + 1 }));
      schedule(() => setGhostRipple((prev) => ({ ...prev, visible: false })), 650);
    };

    const runCursorLoop = (start: { x: number; y: number }, end: { x: number; y: number }, onClick?: () => void) => {
      setGhostCursor({ visible: true, x: start.x, y: start.y });
      schedule(() => setGhostCursor({ visible: true, x: end.x, y: end.y }), 60);
      schedule(() => {
        onClick?.();
        showRippleAt(end.x, end.y);
      }, 1350);
      schedule(() => setGhostCursor((prev) => ({ ...prev, visible: false })), 2600);
      schedule(() => runCursorLoop(start, end, onClick), 3600);
    };

    if (step === 'branch-zone') {
      const anchorRect = contentRect ?? targetRect;
      const end = {
        x: Math.min(window.innerWidth - 72, (anchorRect?.right ?? targetRect.left) + 60),
        y: (anchorRect?.top ?? targetRect.top) + Math.min(180, Math.max(120, (anchorRect?.height ?? 360) * 0.38)),
      };
      const start = { x: end.x - 220, y: end.y + 80 };
      runCursorLoop(start, end, () => {
        const width = 310;
        const baseLeft = (anchorRect?.right ?? end.x) + 12;
        const left = Math.max(24, Math.min(window.innerWidth - width - 24, baseLeft));
        const top = Math.max(96, Math.min(window.innerHeight - 96, end.y));
        setGhostComposer({ visible: true, left, top, expanded: false });
        schedule(() => setGhostComposer({ visible: true, left, top, expanded: true }), 220);
        schedule(() => setGhostComposer((prev) => ({ ...prev, visible: false, expanded: false })), 1400);
      });
      return () => clearGhostTimers();
    }

    if (step === 'branch-prompt') {
      const end = { x: targetRect.left + 22, y: targetRect.top + targetRect.height / 2 };
      const start = { x: end.x - 180, y: end.y + 40 };
      runCursorLoop(start, end, () => {
        const demoText = 'Give me a sharper headline';
        setGhostTyping({ visible: true, text: '' });
        demoText.split('').forEach((_, idx) => {
          schedule(() => {
            setGhostTyping({ visible: true, text: demoText.slice(0, idx + 1) });
          }, 160 + idx * 34);
        });
        schedule(() => setGhostTyping({ visible: false, text: '' }), 1500);
      });
      return () => clearGhostTimers();
    }

    if (step === 'select-text' && !selectionReady) {
      const selectionRect = {
        left: targetRect.left + Math.max(24, targetRect.width * 0.18),
        top: targetRect.top + Math.max(28, targetRect.height * 0.46),
        width: Math.min(240, Math.max(140, targetRect.width * 0.32)),
        height: 24,
      };
      const start = { x: selectionRect.left + 12, y: selectionRect.top + 14 };
      const end = { x: selectionRect.left + selectionRect.width - 12, y: selectionRect.top + 14 };
      runCursorLoop(start, end, () => {
        setGhostSelectionClick(true);
        schedule(() => setGhostSelectionClick(false), 900);
      });
      return () => clearGhostTimers();
    }

    if (step === 'mini-chat') {
      const end = { x: targetRect.left + targetRect.width * 0.6, y: targetRect.top + targetRect.height / 2 };
      const start = { x: end.x - 190, y: end.y + 40 };
      runCursorLoop(start, end, () => {
        const left = Math.min(window.innerWidth - 320, Math.max(24, targetRect.left));
        const top = Math.min(window.innerHeight - 320, Math.max(24, targetRect.top + 10));
        setGhostMiniChat({ visible: true, left, top, expanded: false });
        schedule(() => setGhostMiniChat({ visible: true, left, top, expanded: true }), 220);
        schedule(() => setGhostMiniChat((prev) => ({ ...prev, visible: false, expanded: false })), 1400);
      });
      return () => clearGhostTimers();
    }

    if (step === 'node-view') {
      const end = { x: targetRect.left + targetRect.width / 2, y: targetRect.top + targetRect.height / 2 };
      const start = { x: end.x - 200, y: end.y + 40 };
      runCursorLoop(start, end);
      return () => clearGhostTimers();
    }

    return () => clearGhostTimers();
  }, [contentRect, prefersReducedMotion, selectionReady, step, targetRect]);

  const cardPosition = getCardPosition();

  const selectionDemoRect = useMemo(() => {
    if (step !== 'select-text' || selectionReady || !targetRect) {
      return null;
    }

    return {
      left: targetRect.left + Math.max(24, targetRect.width * 0.18),
      top: targetRect.top + Math.max(28, targetRect.height * 0.46),
      width: Math.min(240, Math.max(140, targetRect.width * 0.32)),
      height: 24,
    };
  }, [selectionReady, step, targetRect]);

  return (
    <div className="pointer-events-none fixed inset-0 z-[280]">
      {selectionDemoRect && (
        <div
          className="fixed z-[281] rounded-md bg-blue-400/20 ring-2 ring-blue-400/35 shadow-[0_18px_60px_rgba(59,130,246,0.20)] animate-pulse"
          style={selectionDemoRect}
        />
      )}

      {ghostSelectionClick && selectionDemoRect && (
        <div
          className="fixed z-[282] -translate-x-1/2 -translate-y-full"
          style={{ left: selectionDemoRect.left + selectionDemoRect.width / 2, top: selectionDemoRect.top - 10 }}
        >
          <div className="rounded-full bg-blue-500 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white shadow-lg">
            Create new branch
          </div>
        </div>
      )}

      {ghostMiniChat.visible && (
        <div
          className={`fixed z-[282] pointer-events-none origin-top-left transition-all duration-300 ease-out ${
            ghostMiniChat.expanded ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
          }`}
          style={{ left: ghostMiniChat.left, top: ghostMiniChat.top }}
        >
          <div className={`bg-white/95 border border-black/[0.06] rounded-3xl shadow-[0_18px_60px_rgba(0,0,0,0.10)] overflow-hidden ${
            ghostMiniChat.expanded ? 'w-[280px] h-[260px]' : 'w-[240px] h-10'
          }`}>
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-black/[0.04] bg-white">
              <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#6b7280] truncate flex-1 min-w-0">
                Branch
              </span>
            </div>
            {ghostMiniChat.expanded && (
              <>
                <div className="px-3 py-2 text-[11.5px] text-gray-700 space-y-2">
                  <div className="h-3 w-4/5 bg-slate-200/70 rounded" />
                  <div className="h-3 w-3/5 bg-slate-200/70 rounded" />
                  <div className="h-3 w-2/3 bg-slate-200/70 rounded" />
                </div>
                <div className="mt-auto border-t border-black/[0.04] px-3 py-2 text-[11px] text-gray-400">
                  Type a branch prompt…
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {ghostComposer.visible && (
        <div
          className={`fixed z-[282] pointer-events-none origin-top-left transition-all duration-300 ease-out ${
            ghostComposer.expanded ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
          }`}
          style={{ left: ghostComposer.left, top: ghostComposer.top }}
        >
          <div className="relative w-[310px]">
            <div
              className="pointer-events-none absolute top-0"
              style={{ width: 44, left: -44, transform: 'translateY(-50%)' }}
            >
              <div className="absolute left-0 top-[-1px] h-[2px] w-full bg-gradient-to-r from-transparent via-blue-200/50 to-blue-400" />
              <div className="absolute right-0 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full border-[1.5px] border-white bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
            </div>

            <div className="pointer-events-none absolute top-0 left-0 w-full" style={{ transform: 'translateY(-50%)' }}>
              <div className="pointer-events-auto relative overflow-visible rounded-full border border-black/[0.04] bg-white shadow-[0_4px_30px_rgba(0,0,0,0.06)] p-1.5 text-left">
                <div className="flex items-center gap-1.5 px-1.5">
                  <button
                    type="button"
                    className="shrink-0 rounded-full p-1 text-[#9ca3af]"
                    aria-hidden
                    tabIndex={-1}
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>

                  <div className="flex-1 px-1 py-1 text-[13px] font-medium tracking-tight text-gray-400">
                    Type a branch prompt...
                  </div>

                  <button
                    type="button"
                    className="shrink-0 rounded-full p-1 text-[#9ca3af]"
                    aria-hidden
                    tabIndex={-1}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    className="ml-1 flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[#dbeafe] text-white"
                    aria-hidden
                    tabIndex={-1}
                  >
                    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {ghostCursor.visible && (
        <div
          className="fixed z-[283] transition-[left,top,opacity] duration-[1300ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]"
          style={{ left: ghostCursor.x, top: ghostCursor.y, opacity: ghostCursor.visible ? 1 : 0 }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" className="drop-shadow-[0_10px_20px_rgba(15,23,42,0.25)]">
            <path d="M4 2l7 17 2-6 6-2L4 2z" fill="#0f172a" stroke="white" strokeWidth="1.5" />
          </svg>
        </div>
      )}

      {ghostRipple.visible && (
        <div className="fixed z-[282]" style={{ left: ghostRipple.x, top: ghostRipple.y }}>
          <div key={ghostRipple.key} className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-blue-500/30 animate-ping" />
          <div className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full bg-blue-500 shadow-[0_0_0_4px_rgba(59,130,246,0.18)]" />
        </div>
      )}

      {ghostTyping.visible && step === 'branch-prompt' && targetRect && (
        <div
          className="fixed z-[282] pointer-events-none text-[13px] font-medium text-gray-700"
          style={{ left: targetRect.left + 18, top: targetRect.top + targetRect.height / 2, transform: 'translateY(-50%)' }}
        >
          <span className="opacity-85">{ghostTyping.text}</span>
          <span className="inline-block w-[1px] h-4 bg-gray-700/70 align-middle ml-0.5 animate-pulse" />
        </div>
      )}

      <div
        className="absolute w-[calc(100vw-48px)] max-w-[720px] rounded-[28px] border border-white/70 bg-white/92 p-5 shadow-[0_28px_80px_rgba(15,23,42,0.22)] backdrop-blur-xl"
        style={cardPosition}
      >
        <div className="relative">
          <div className={step === 'branch-zone' ? 'text-center' : undefined}>
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">
              {step === 'done' ? 'Demo Complete' : `Step ${getStepIndex(step)} of 5`}
            </p>
            <h2
              className={`mt-2 tracking-tight text-slate-900 ${
                step === 'branch-zone' ? 'text-[40px] font-extrabold leading-tight' : 'text-[26px] font-semibold'
              }`}
            >
              {getStepTitle(step)}
            </h2>
          </div>
          <div className="pointer-events-auto absolute right-0 top-0">
            {step !== 'done' && (
              <button
                type="button"
                onClick={onSkip}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700"
              >
                Skip
              </button>
            )}
          </div>
        </div>

        <p className={`mt-4 text-sm leading-6 text-slate-600 ${step === 'branch-zone' ? 'text-center' : ''}`}>
          {getStepBody(step, selectionReady)}
        </p>

        {step === 'done' && (
          <div className="pointer-events-auto mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={onStart}
              className="rounded-full bg-[var(--accent-color)] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_36px_rgba(16,163,127,0.25)] transition-transform hover:scale-[1.02] active:scale-[0.98]"
            >
              Start using
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export const DemoPage: React.FC = () => {
  const availableModels = useMemo(() => getFallbackModelCatalog(), []);
  const [selectedModel, setSelectedModel] = useState(() => DEFAULT_FREE_MODEL_ID || availableModels[0]?.id || '');
  const [nodes, setNodes] = useState<Record<string, ChatNode>>(() => ({
    [DEMO_ROOT_ID]: createInitialRootNode(),
  }));
  const [branchLines, setBranchLines] = useState<BranchMetadata[]>([]);
  const [viewMode, setViewMode] = useState<'chat' | 'node'>('chat');
  const [step, setStep] = useState<DemoStep>('branch-zone');
  const [selectionReady, setSelectionReady] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingNodeId, setGeneratingNodeId] = useState<string | null>(null);
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>({ phase: 'idle' });
  const branchCounterRef = useRef(1);
  const generationTimeoutRef = useRef<number | null>(null);

  const rootNode = nodes[DEMO_ROOT_ID];
  const history = useMemo(() => (rootNode ? [rootNode] : []), [rootNode]);

  const navigateToAuth = () => {
    window.location.assign('/');
  };

  useEffect(() => {
    if (step !== 'select-text') {
      setSelectionReady(false);
      return;
    }

    const syncSelectionState = () => {
      if (!document.querySelector('[data-demo-selection-panel="true"]')) {
        setSelectionReady(false);
      }
    };

    document.addEventListener('selectionchange', syncSelectionState);
    document.addEventListener('scroll', syncSelectionState, true);

    return () => {
      document.removeEventListener('selectionchange', syncSelectionState);
      document.removeEventListener('scroll', syncSelectionState, true);
    };
  }, [step]);

  useEffect(() => {
    return () => {
      if (generationTimeoutRef.current) {
        window.clearTimeout(generationTimeoutRef.current);
      }
    };
  }, []);

  const appendMessagesToNode = (nodeId: string, nextMessages: Message[]) => {
    setNodes((prev) => {
      const node = prev[nodeId];
      if (!node) {
        return prev;
      }

      return {
        ...prev,
        [nodeId]: {
          ...node,
          messages: [...node.messages, ...nextMessages],
        },
      };
    });
  };

  const startDemoGeneration = (nodeId: string, reply: string) => {
    if (generationTimeoutRef.current) {
      window.clearTimeout(generationTimeoutRef.current);
    }

    setIsGenerating(true);
    setGeneratingNodeId(nodeId);
    setGenerationStatus({ phase: 'requesting', modelId: selectedModel });

    generationTimeoutRef.current = window.setTimeout(() => {
      setNodes((prev) => {
        const node = prev[nodeId];
        if (!node) {
          return prev;
        }

        const messages = [...node.messages];
        for (let i = messages.length - 1; i >= 0; i -= 1) {
          if (messages[i].role === 'model' && !messages[i].content.trim()) {
            messages[i] = { ...messages[i], content: reply };
            break;
          }
        }

        return {
          ...prev,
          [nodeId]: {
            ...node,
            messages,
          },
        };
      });

      setIsGenerating(false);
      setGeneratingNodeId(null);
      setGenerationStatus({ phase: 'idle' });
    }, 900);
  };

  const handleSendMessage = (text: string, _files: File[], branchMetadata?: BranchMetadata) => {
    if (!text.trim()) {
      return;
    }

    if (!branchMetadata) {
      const currentRoot = nodes[DEMO_ROOT_ID];
      if (!currentRoot) {
        return;
      }

      const userOrdinal = currentRoot.messages.length;
      appendMessagesToNode(DEMO_ROOT_ID, [
        createMessage('user', text.trim(), userOrdinal),
        createMessage('model', 'The main chat keeps flowing here, but the guided demo focuses on branching. Continue with the steps to see the full Klados workflow.', userOrdinal + 1),
      ]);
      return;
    }

    const parentId = branchMetadata.sourceNodeId || DEMO_ROOT_ID;
    const nextNodeId = `demo-branch-${branchCounterRef.current++}`;
    const userMessage = createMessage('user', text.trim(), 0);
    const modelMessage = createMessage('model', '', 1);

    setNodes((prev) => {
      const parentNode = prev[parentId] || prev[DEMO_ROOT_ID];
      if (!parentNode) {
        return prev;
      }

      return {
        ...prev,
        [parentId]: {
          ...parentNode,
          childrenIds: [...parentNode.childrenIds, nextNodeId],
        },
        [nextNodeId]: {
          id: nextNodeId,
          hierarchicalID: getChildLabel(parentNode),
          parentId,
          messages: [userMessage, modelMessage],
          title: getBranchTitle(text, branchMetadata),
          timestamp: Date.now(),
          childrenIds: [],
          isBranch: true,
          branchMessageId: branchMetadata.messageId,
        },
      };
    });

    setBranchLines((prev) => [...prev, { ...branchMetadata, targetNodeId: nextNodeId }]);
    startDemoGeneration(nextNodeId, buildBranchReply(text, branchMetadata));

    if (branchMetadata.triggerSource === 'branch-zone' && step === 'branch-prompt') {
      setStep('select-text');
    }

    if (branchMetadata.triggerSource === 'selection' && step === 'select-text') {
      setSelectionReady(false);
      setStep('mini-chat');
    }
  };

  const handleSendMessageToNode = (nodeId: string, text: string) => {
    const branchNode = nodes[nodeId];
    if (!branchNode || !text.trim()) {
      return;
    }

    const userOrdinal = branchNode.messages.length;
    appendMessagesToNode(nodeId, [
      createMessage('user', text.trim(), userOrdinal),
      createMessage('model', '', userOrdinal + 1),
    ]);
    startDemoGeneration(nodeId, buildMiniChatReply(text));
  };

  const tutorial = useMemo<ChatViewTutorialConfig>(() => ({
    miniChatsStartCollapsed: true,
    onBranchZoneHover: () => {
      if (step === 'branch-zone') {
        // Hover is intentionally observed so the overlay can respond to the real branch zone.
      }
    },
    onBranchComposerOpen: () => {
      if (step === 'branch-zone') {
        setStep('branch-prompt');
      }
    },
    onTextSelection: () => {
      if (step === 'select-text') {
        setSelectionReady(true);
      }
    },
    onMiniChatToggle: (_nodeId, collapsed) => {
      if (step === 'mini-chat' && !collapsed) {
        setStep('node-view');
      }
    },
  }), [step]);

  const canOpenNodeView = step === 'node-view' || step === 'done';

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--app-bg)] text-[var(--app-text)]">
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,163,127,0.08),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(148,163,184,0.16),transparent_30%)]" />

        <header className="relative z-[110] flex h-16 items-center justify-between border-b border-[var(--header-border)] bg-[var(--header-bg)] px-8 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl border border-[var(--border-color)] bg-white shadow-sm">
              <img src="/logo.png" alt="Klados Logo" className="h-full w-full object-contain" />
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[var(--app-text-muted)]">Public Demo</p>
              <h1 className="text-sm font-semibold tracking-tight text-[var(--app-text)]">{DEMO_TITLE}</h1>
            </div>
          </div>

          <button
            type="button"
            data-demo-node-toggle="true"
            onClick={() => {
              if (!canOpenNodeView) {
                return;
              }

              setViewMode((prev) => {
                const next = prev === 'chat' ? 'node' : 'chat';
                if (step === 'node-view' && next === 'node') {
                  setStep('done');
                }
                return next;
              });
            }}
            className={`rounded-xl border px-5 py-2 text-[11px] font-bold uppercase tracking-[0.16em] transition-all ${
              canOpenNodeView
                ? viewMode === 'node'
                  ? 'border-[var(--accent-color)] bg-[var(--accent-color)] text-white'
                  : 'border-[var(--border-color)] bg-[var(--card-bg)] text-[var(--app-text)] hover:border-[var(--accent-color)]'
                : 'cursor-not-allowed border-[var(--border-color)] bg-[var(--card-bg)] text-[var(--app-text-muted)] opacity-70'
            }`}
          >
            {viewMode === 'chat' ? 'Node View' : 'Back to Chat'}
          </button>
        </header>

        <main className="relative flex-1 overflow-hidden">
          <div className={`absolute inset-0 transition-all duration-300 ${viewMode === 'chat' ? 'pointer-events-none opacity-10 blur-3xl grayscale' : 'opacity-100'}`}>
            <NodeView
              nodes={nodes}
              rootNodeId={DEMO_ROOT_ID}
              currentNodeId={DEMO_ROOT_ID}
              viewMode={viewMode}
              onSelectNode={() => undefined}
              onBranchNode={() => undefined}
            />
          </div>

          <div className={`relative z-50 h-full w-full transition-all duration-500 ${viewMode === 'chat' ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-12 opacity-0'}`}>
            <ChatView
              history={history}
              onSendMessage={handleSendMessage}
              onSendMessageToNode={(nodeId, text) => handleSendMessageToNode(nodeId, text)}
              branchLines={branchLines}
              onBranch={() => undefined}
              nodes={nodes}
              isGenerating={isGenerating}
              generatingNodeId={generatingNodeId}
              generationStatus={generationStatus}
              currentNodeId={DEMO_ROOT_ID}
              currentTitle={rootNode?.title || DEMO_TITLE}
              selectedModel={selectedModel}
              availableModels={availableModels}
              onModelSelect={setSelectedModel}
              userTier="FREE"
              tutorial={tutorial}
            />
          </div>
        </main>

        <TutorialOverlay
          step={step}
          selectionReady={selectionReady}
          onSkip={navigateToAuth}
          onStart={navigateToAuth}
        />
      </div>
    </div>
  );
};
