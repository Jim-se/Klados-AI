//n
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate, useLocation, Routes, Route } from 'react-router-dom';
import { ChatState, ChatNode, Message } from './types';
import { ChatView, BranchMetadata } from './components/ChatView';
import { NodeView } from './components/NodeView';
import { ProfileView } from './components/ProfileView';
import { useTheme } from './src/contexts/ThemeContext';
//import { generateResponse, generateTitle } from './services/geminiService';
import { dbService } from './services/dbService';
import { initSupabase } from './services/supabaseClient';
import { generateResponseOpenAI } from './services/openaiService';
import { generateResponse, generateTitle } from './services/openRouterService';
interface Conversation {
  id: string;
  nodes: Record<string, ChatNode>;
  rootNodeId: string | null;
  currentNodeId: string | null;
  title: string;
  timestamp: number;
}

const STORAGE_KEY = 'lumina_conversations_v2'; // Bumped version for logic change
const App: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [conversations, setConversations] = useState<any[]>([]);
  const [fullName, setFullName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSwitching, setIsSwitching] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [branchLines, setBranchLines] = useState<any[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (groupName: string) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [groupName]: !prev[groupName]
    }));
  };
  const [activeConvId, setActiveConvId] = useState<string | null>(null);

  const [workspace, setWorkspace] = useState<ChatState & { branchingFromId: string | null }>({
    nodes: {},
    rootNodeId: null,
    currentNodeId: null,
    viewMode: 'chat',
    branchingFromId: null,
  });

  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const { theme, mode, setTheme, setMode } = useTheme();

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingNodeId, setGeneratingNodeId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState("gemini-3-flash-preview");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const generationRef = React.useRef<any>(null);

  const stopGeneration = useCallback(async () => {
    if (generationRef.current) {
      await generationRef.current.cancel();
      generationRef.current = null;
    }
    setIsGenerating(false);
    setGeneratingNodeId(null);
  }, []);

  const groupedConversations = useMemo(() => {
    // 1. Define the buckets
    const groups: Record<string, any[]> = {
      'Today': [],
      'Yesterday': [],
      'Previous 7 Days': [],
      'Previous 30 Days': [],
      'Older': []
    };

    const now = new Date();
    // Midnight today
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const msInDay = 86400000;

    const startOfYesterday = startOfToday - msInDay;
    const startOf7DaysAgo = startOfToday - (7 * msInDay);
    const startOf30DaysAgo = startOfToday - (30 * msInDay);

    // 2. Sort conversations into buckets
    conversations.forEach(conv => {
      // Note: If you have 'updated_at', that is usually better to use than 'created_at' 
      // so bumped threads float to the top of "Today".
      const convDate = new Date(conv.created_at).getTime();

      if (convDate >= startOfToday) {
        groups['Today'].push(conv);
      } else if (convDate >= startOfYesterday) {
        groups['Yesterday'].push(conv);
      } else if (convDate >= startOf7DaysAgo) {
        groups['Previous 7 Days'].push(conv);
      } else if (convDate >= startOf30DaysAgo) {
        groups['Previous 30 Days'].push(conv);
      } else {
        groups['Older'].push(conv);
      }
    });

    // 3. Filter out empty groups so we don't render empty headers
    return Object.entries(groups).filter(([_, convs]) => convs.length > 0);
  }, [conversations]);
  // Add this near the top of your App component, after the useState declarations:

  useEffect(() => {
    console.log('🔍 [WORKSPACE UPDATE]');
    console.log('  - Total nodes:', Object.keys(workspace.nodes).length);
    console.log('  - Node IDs:', Object.keys(workspace.nodes));
    console.log('  - Current node:', workspace.currentNodeId);
    console.log('  - Root node:', workspace.rootNodeId);
    console.log('  - Branching from:', workspace.branchingFromId);
  }, [workspace.nodes, workspace.currentNodeId, workspace.rootNodeId, workspace.branchingFromId]);

  useEffect(() => {
    const loadSidebar = async () => {
      try {
        await initSupabase(); // Initialize Supabase with config from backend
        const data = await dbService.fetchConversations();
        setConversations(data);
        const userProfile = await dbService.fetchUserProfile();

        if (userProfile) {
          setFullName(userProfile.fullName);
          setEmail(userProfile.email || null);
          setCreatedAt(userProfile.createdAt || null);
        }
      } catch (err) {
        console.error("Sidebar load failed:", err);
      } finally {
        setIsLoading(false);
      }
    };
    loadSidebar();
  }, []);



  const getFullHistoryPath = useCallback((nodeId: string | null): ChatNode[] => {
    if (!nodeId) return [];
    const path: ChatNode[] = [];
    let currentId: string | null = nodeId;

    while (currentId && workspace.nodes[currentId]) {
      const node = workspace.nodes[currentId];
      path.unshift(node);
      // If this node was created as a "side question" (mini chat),
      // we treat it as the start of a new history chain for playback/display.
      if (node.branchMessageId) {
        break;
      }
      currentId = node.parentId;
    }
    return path;
  }, [workspace.nodes]);

  const activeMessages = useMemo(() => {
    // History is the full set of messages in nodes leading up to current
    const path = getFullHistoryPath(workspace.currentNodeId);
    return path.flatMap(node =>
      [...node.messages].sort((a, b) => a.ordinal - b.ordinal)
    );
  }, [workspace.currentNodeId, getFullHistoryPath]);

  const generateHierarchicalLabel = (parentId: string | null, nodes: Record<string, ChatNode>): string => {
    if (!parentId) return "1";
    const parent = nodes[parentId];
    const siblingsCount = parent.childrenIds.length;
    const endsWithLetter = /[a-z]$/.test(parent.hierarchicalID);
    return endsWithLetter ? `${parent.hierarchicalID}.${siblingsCount + 1}` : `${parent.hierarchicalID}.${String.fromCharCode(97 + siblingsCount)}`;
  };

  const generateCoolId = (parentId: string | null, nodes: Record<string, ChatNode>): string => {
    if (!parentId) return "1";
    const parent = nodes[parentId];
    const siblingsCount = parent.childrenIds.length;
    const endsWithLetter = /[a-z]$/.test(parentId);
    return endsWithLetter ? `${parentId}.${siblingsCount + 1}` : `${parentId}.${String.fromCharCode(97 + siblingsCount)}`;
  };

  const handleReportBug = async () => {
    let description = prompt("Describe the bug (what happened?):");
    if (!description) return;

    try {
      // Optional: Capture basic browser info
      const debugInfo = JSON.stringify({
        userAgent: navigator.userAgent,
        screen: `${window.innerWidth}x${window.innerHeight}`,
        url: window.location.href,
        node: workspace.currentNodeId // helpful to know where they were
      }, null, 2);

      await dbService.reportBug(description, debugInfo);
      alert("Bug reported! Thanks for helping.");
    } catch (err) {
      alert("Failed to send report. Irony.");
      console.error(err);
    }
  };

  const handleDeleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent selecting the conversation when clicking delete

    if (confirm("Delete this conversation? This action cannot be undone.")) {
      try {
        await dbService.deleteConversation(convId);

        // If we're deleting the active conversation, reset workspace
        if (activeConvId === convId) {
          setActiveConvId(null);
          setWorkspace({
            nodes: {},
            rootNodeId: null,
            currentNodeId: null,
            viewMode: 'chat',
            branchingFromId: null,
          });
        }

        // Refresh the sidebar
        const updatedConvs = await dbService.fetchConversations();
        setConversations(updatedConvs);
      } catch (err) {
        console.error("Delete failed:", err);
        alert("Failed to delete conversation");
      }
    }
  };

  const handleSelectConversation = async (id: string | null) => {
    console.log('🔍 handleSelectConversation called! id:', id, 'activeConvId:', activeConvId);

    // Don't reload if we're already on this conversation
    if (id === activeConvId) {
      console.log('⏭️ Skipping - already active');
      return;
    }
    setActiveConvId(id);
    setIsSwitching(true);
    setBranchLines([]);
    // If id is null, we are starting a NEW thread. Reset workspace.
    if (!id) {
      setWorkspace({
        nodes: {},
        rootNodeId: null,
        currentNodeId: null,
        viewMode: 'chat',
        branchingFromId: null,
      });
      setIsSwitching(false);
      return;
    }

    try {
      const { nodes: nodesMap, branchLines: loadedBranchLines } = await dbService.fetchConversationDetail(id);
      const header = conversations.find(c => c.id === id);

      setWorkspace({
        nodes: nodesMap,
        rootNodeId: header?.root_node_id || null,
        currentNodeId: header?.current_node_id || null,
        viewMode: 'chat',
        branchingFromId: null,
      });
      setBranchLines(loadedBranchLines);
    } catch (err) {
      console.error("Hydration failed:", err);
    } finally {
      setIsSwitching(false);
    }
  };

  const handleSendMessage = async (text: string, files: File[], branchMetadata?: BranchMetadata, thinking?: boolean) => {
    if (isGenerating || (!text.trim() && files.length === 0)) return; console.log('🚀 [START] Message send initiated');
    const perfStart = performance.now();
    setIsGenerating(true);
    let currentConvId = activeConvId;
    const isNewConversation = !currentConvId;
    const isBranching = !!workspace.branchingFromId;
    const timestamp = Date.now();

    // 1. GENERATE IDS ON CLIENT (The "Forever" IDs)
    // We use crypto.randomUUID() to generate a real UUID v4 immediately.
    // If we need a new node, we generate its ID now and keep it forever.
    const clientGeneratedNodeId = self.crypto.randomUUID();

    // Determine the Target Node ID immediately
    const targetNodeId = (isNewConversation || isBranching)
      ? clientGeneratedNodeId
      : workspace.currentNodeId!;

    const capturedParentId = isBranching ? workspace.branchingFromId : null;
    const capturedHLabel = generateHierarchicalLabel(capturedParentId, workspace.nodes);
    setGeneratingNodeId(targetNodeId);

    const currentMessages = (workspace.currentNodeId && workspace.nodes[workspace.currentNodeId])
      ? workspace.nodes[workspace.currentNodeId].messages
      : [];

    const userMsg: Message = {
      role: 'user',
      content: text,
      timestamp: timestamp,
      ordinal: isNewConversation || isBranching ? 0 : currentMessages.length
    };

    // 2. OPTIMISTIC UPDATE (Using the REAL ID)
    if (isNewConversation || isBranching) {
      console.log('🟢 [OPTIMISTIC] Creating new node with PERMANENT ID:', targetNodeId);

      setWorkspace(prev => {
        const newNodes = {
          ...prev.nodes,
          [targetNodeId]: {
            id: targetNodeId, // <--- We use the final ID right away
            hierarchicalID: capturedHLabel,
            parentId: capturedParentId,
            messages: [{ ...userMsg }],
            title: '...',
            timestamp: timestamp,
            childrenIds: [],
            isBranch: isBranching,
            branchMessageId: branchMetadata?.messageId
          }
        };

        // Update parent's childrenIds if branching
        if (capturedParentId && prev.nodes[capturedParentId]) {
          newNodes[capturedParentId] = {
            ...prev.nodes[capturedParentId],
            childrenIds: [...prev.nodes[capturedParentId].childrenIds, targetNodeId]
          };
        }

        return {
          ...prev,
          nodes: newNodes,
          // MAGIC: If branchMetadata exists, keep the OLD currentNodeId!
          currentNodeId: branchMetadata ? prev.currentNodeId : targetNodeId,
          rootNodeId: !capturedParentId ? targetNodeId : prev.rootNodeId,
          branchingFromId: null
        };
      });

      // MAGIC: Save the line coordinates so the UI can draw the blue line
      if (branchMetadata) {
        setBranchLines(prev => [...prev, { ...branchMetadata, targetNodeId }]);
      }
    } else {
      // Normal message appending
      setWorkspace(prev => {
        const node = prev.nodes[targetNodeId];
        if (!node) return prev;
        return {
          ...prev,
          nodes: {
            ...prev.nodes,
            [targetNodeId]: { ...node, messages: [...node.messages, userMsg] }
          }
        };
      });
    }

    try {
      // ... (inside handleSendMessage, after step 2 OPTIMISTIC UPDATE) ...

      // 3. GENERATE AI RESPONSE (Stream into the view)
      // Build context
      let aiContext;
      if (isNewConversation || isBranching) {
        const parentHistory = getFullHistoryPath(capturedParentId);
        // Map to standard OpenRouter format
        aiContext = parentHistory.flatMap(n =>
          n.messages.map(m => ({
            role: m.role === 'model' ? 'assistant' : 'user', // Normalize 'model' -> 'assistant'
            content: m.content
          }))
        );
      } else {
        const historyPath = getFullHistoryPath(targetNodeId);
        aiContext = historyPath.flatMap(n =>
          n.messages.map(m => ({
            role: m.role === 'model' ? 'assistant' : 'user',
            content: m.content
          }))
        );
      }

      // Call Unified OpenRouter Service
      const result = await generateResponse(
        text,
        aiContext as any,
        files,
        selectedModel,
        thinking
      );

      generationRef.current = result;

      // 4. STREAM HANDLING
      let fullResponse = "";
      const aiMsgTimestamp = Date.now();
      const aiMsg: Message = {
        role: 'model',
        content: '',
        timestamp: aiMsgTimestamp,
        ordinal: userMsg.ordinal + 1
      };

      // Add empty AI message to UI
      setWorkspace(prev => {
        const node = prev.nodes[targetNodeId];
        if (!node) return prev;
        return {
          ...prev,
          nodes: {
            ...prev.nodes,
            [targetNodeId]: { ...node, messages: [...node.messages, aiMsg] }
          }
        };
      });

      // Stream Helper
      const streamWordsGradually = async (textChunk: string) => {
        fullResponse += textChunk;
        setWorkspace(prev => {
          const node = prev.nodes[targetNodeId];
          if (!node) return prev;
          const updatedMessages = [...node.messages];
          const lastMsg = updatedMessages[updatedMessages.length - 1];
          // Ensure we are updating the AI message we just created
          if (lastMsg.role === 'model' && lastMsg.timestamp === aiMsgTimestamp) {
            lastMsg.content = fullResponse;
          }
          return {
            ...prev,
            nodes: { ...prev.nodes, [targetNodeId]: { ...node, messages: updatedMessages } }
          };
        });
        // Tiny delay to allow React render cycle if needed, though 0 might be too fast for some UIs
        await new Promise(r => setTimeout(r, 0));
      };

      // Process ModelResult Stream
      try {
        for await (const textDelta of result.getTextStream()) {
          if (textDelta) {
            await streamWordsGradually(textDelta);
          }
        }
      } catch (streamErr: any) {
        if (streamErr.name === 'AbortError' || streamErr.message?.includes('abort') || streamErr.message?.toLowerCase().includes('cancel')) {
          console.log("Stream intentionally aborted. Proceeding to save partial message...");
        } else {
          throw streamErr;
        }
      }

      setIsGenerating(false);
      setGeneratingNodeId(null);
      generationRef.current = null;

      // ... (Continue to 5. DATABASE SYNC as before) ...

      // 5. DATABASE SYNC (Background)
      // We already have the IDs, we just need to save them.

      if (isNewConversation) {
        // Create conversation wrapper first
        const newConv = await dbService.createConversation("New Discussion");
        currentConvId = newConv.id;
        setActiveConvId(currentConvId);
      }

      if (isNewConversation || isBranching) {
        // SAVE NODE WITH OUR PRE-GENERATED ID
        await dbService.createNode({
          id: targetNodeId,
          conversations_id: currentConvId!,
          parent_id: capturedParentId,
          hierarchical_id: capturedHLabel,
          is_branch: isBranching,
          title: '...',
          // Save branch line positioning so it can be restored on next load
          ...(branchMetadata ? {
            branch_message_id: branchMetadata.messageId,
            branch_block_index: branchMetadata.blockIndex,
            branch_relative_y_in_block: branchMetadata.relativeYInBlock,
            branch_msg_relative_y: branchMetadata.msgRelativeY,
          } : {})
        });
      }

      // Save Messages
      await dbService.createMessage({
        nodes_id: targetNodeId,
        role: 'user',
        content: text,
        ordinal: userMsg.ordinal
      });

      await dbService.createMessage({
        nodes_id: targetNodeId,
        role: 'model',
        content: fullResponse,
        ordinal: aiMsg.ordinal
      });

      // Update Pointers
      // Update Pointers
      if (isNewConversation) {
        await dbService.updateConversationState(currentConvId!, {
          root_node_id: targetNodeId,
          current_node_id: targetNodeId
        });
      } else if (isBranching && !branchMetadata) {
        await dbService.updateConversationState(currentConvId!, {
          current_node_id: targetNodeId
        });
      } else {
        // Regular message — bump updated_at so conversation floats to top of sidebar  await dbService.updateConversationState(currentConvId!, {});
      }

      // 6. FINAL SYNC (Just to update sidebar/titles, NO NODE SWAPPING)
      const sidebarData = await dbService.fetchConversations();
      setConversations(sidebarData);

      console.log(`✅ [COMPLETE] Total time: ${(performance.now() - perfStart).toFixed(0)}ms`);

      if (isNewConversation || isBranching) {
        generateTitle(text, fullResponse, selectedModel).then(async (llmTitle) => {
          try {
            console.log("🏷️ Generated Title:", llmTitle);

            // A. Update Database
            await dbService.updateNodeTitle(targetNodeId, llmTitle);

            if (isNewConversation) {
              // Update conversation title in DB
              await dbService.updateConversationState(currentConvId!, { title: llmTitle });
            }

            // B. UPDATE LOCAL WORKSPACE (The Safe Way)
            // We update ONLY the title field of the specific node.
            // We do NOT re-fetch the whole node list, preventing the "stale data" wipeout.
            setWorkspace(prev => {
              const node = prev.nodes[targetNodeId];
              if (!node) return prev; // Safety check
              return {
                ...prev,
                nodes: {
                  ...prev.nodes,
                  [targetNodeId]: {
                    ...node,
                    title: llmTitle
                  }
                }
              };
            });

            // C. Update Sidebar (Background Sync)
            // This is safe to re-fetch because it doesn't affect the active view
            const updatedSidebar = await dbService.fetchConversations();
            setConversations(updatedSidebar);

          } catch (titleErr) {
            console.warn("Title generation failed silently:", titleErr);
            // We don't alert here because the message was sent successfully
          }
        });
      }

    } catch (err: any) {
      console.error("Message Failure:", err);
      alert("Something went wrong: " + (err as Error).message);
      setIsGenerating(false);
      setGeneratingNodeId(null);
      generationRef.current = null;
    }
  };


  const handleSendMessageToNode = useCallback(async (nodeId: string, text: string, files: File[], thinking?: boolean) => {
    // Temporarily switch currentNodeId to the branch node, send, then restore
    // We do this by saving branchingFromId state and re-using handleSendMessage logic
    // but targeting a specific existing node
    if (isGenerating || !text.trim()) return;
    setIsGenerating(true);
    setGeneratingNodeId(nodeId);
    const perfStart = performance.now();

    const targetNodeId = nodeId;
    const node = workspace.nodes[nodeId];
    if (!node) { setIsGenerating(false); setGeneratingNodeId(null); return; }

    const currentMessages = node.messages;
    const timestamp = Date.now();
    const userMsg: Message = {
      role: 'user',
      content: text,
      timestamp,
      ordinal: currentMessages.length,
    };

    // Optimistically add user message
    setWorkspace(prev => {
      const n = prev.nodes[targetNodeId];
      if (!n) return prev;
      return { ...prev, nodes: { ...prev.nodes, [targetNodeId]: { ...n, messages: [...n.messages, userMsg] } } };
    });

    try {
      // Build context for this node's full history path
      const historyPath = getFullHistoryPath(targetNodeId);
      const aiContext = historyPath.flatMap(n =>
        n.messages.map(m => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.content }))
      );

      const result = await generateResponse(
        text,
        aiContext as any,
        files,
        selectedModel
      );

      generationRef.current = result;

      let fullResponse = '';
      const aiMsgTimestamp = Date.now();
      const aiMsg: Message = { role: 'model', content: '', timestamp: aiMsgTimestamp, ordinal: userMsg.ordinal + 1 };

      setWorkspace(prev => {
        const n = prev.nodes[targetNodeId];
        if (!n) return prev;
        return { ...prev, nodes: { ...prev.nodes, [targetNodeId]: { ...n, messages: [...n.messages, aiMsg] } } };
      });

      try {
        for await (const textDelta of result.getTextStream()) {
          if (textDelta) {
            fullResponse += textDelta;
            setWorkspace(prev => {
              const n = prev.nodes[targetNodeId];
              if (!n) return prev;
              const updatedMessages = [...n.messages];
              const lastMsg = updatedMessages[updatedMessages.length - 1];
              if (lastMsg.role === 'model' && lastMsg.timestamp === aiMsgTimestamp) {
                lastMsg.content = fullResponse;
              }
              return { ...prev, nodes: { ...prev.nodes, [targetNodeId]: { ...n, messages: updatedMessages } } };
            });
            await new Promise(r => setTimeout(r, 0));
          }
        }
      } catch (streamErr: any) {
        if (streamErr.name === 'AbortError' || streamErr.message?.includes('abort') || streamErr.message?.toLowerCase().includes('cancel')) {
          console.log('Stream intentionally aborted in mini chat');
        } else {
          throw streamErr;
        }
      }

      setIsGenerating(false);
      setGeneratingNodeId(null);
      generationRef.current = null;

      // Save messages to DB
      await dbService.createMessage({ nodes_id: targetNodeId, role: 'user', content: text, ordinal: userMsg.ordinal });
      await dbService.createMessage({ nodes_id: targetNodeId, role: 'model', content: fullResponse, ordinal: aiMsg.ordinal });

      console.log(`✅ [BRANCH MINI CHAT] Total time: ${(performance.now() - perfStart).toFixed(0)}ms`);
    } catch (err: any) {
      console.error('Mini chat send failed:', err);
      setIsGenerating(false);
      setGeneratingNodeId(null);
      generationRef.current = null;
    }
  }, [isGenerating, workspace.nodes, getFullHistoryPath, selectedModel]);

  const handleClearAll = () => {
    if (confirm("Purge all topological data from local storage?")) {
      setConversations([]);
      setActiveConvId(null);
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const currentTitle = useMemo(() => {
    const node = workspace.currentNodeId ? workspace.nodes[workspace.currentNodeId] : null;
    return node?.title && node.title !== '...' ? node.title : "Klados-AI Session";
  }, [workspace.nodes, workspace.currentNodeId]);

  const handleNodeSelect = useCallback((id: string) => {
    setWorkspace(prev => ({ ...prev, currentNodeId: id, branchingFromId: null, viewMode: 'chat' }));
  }, []);

  const handleNodeBranch = useCallback((id: string) => {
    setWorkspace(p => ({ ...p, branchingFromId: id, currentNodeId: id, viewMode: 'chat' }));
  }, []);


  return (
    <div className="flex h-screen w-screen bg-[var(--app-bg)] text-[var(--app-text)] overflow-hidden font-inter selection:bg-[var(--accent-color)]/20 selection:text-[var(--app-text)]">
      <Routes>
        <Route path="/profile" element={
          <ProfileView
            fullName={fullName}
            email={email}
            createdAt={createdAt}
            onBack={() => navigate('/')}
            onReportBug={handleReportBug}
          />
        } />
        <Route path="/" element={
          <div className="flex h-full w-full overflow-hidden">
            <aside
              className={`
                relative flex flex-col bg-[var(--sidebar-bg)] border-r border-[var(--sidebar-border)] transition-all duration-[450ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] z-[200]
                ${sidebarCollapsed ? 'w-16' : 'w-72 opacity-100'}
              `}
            >
              {/* LOGO + COLLAPSE TOGGLE */}
              <div className="flex items-center gap-4 pointer-events-auto pt-10 px-4 mb-4 justify-between">
                {!sidebarCollapsed && (
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm shrink-0 overflow-hidden border border-[var(--border-color)]">
                      <img src="/logo.png" alt="Klados Logo" className="w-full h-full object-contain" />
                    </div>
                    <div>
                      <h1 className="text-[13px] font-bold tracking-tight uppercase text-[var(--app-text)]">Klados-AI</h1>
                      <p className="text-[8px] font-bold tracking-[0.2em] uppercase text-[var(--app-text-muted)]">Beta Version</p>
                    </div>
                  </div>
                )}
                {sidebarCollapsed && (
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm mx-auto overflow-hidden border border-[var(--border-color)]">
                    <img src="/logo.png" alt="Klados Logo" className="w-full h-full object-contain" />
                  </div>
                )}
                {!sidebarCollapsed && (
                  <button
                    onClick={() => setSidebarCollapsed(true)}
                    className="p-2 rounded-lg hover:bg-[var(--card-hover)] text-[var(--app-text-muted)] hover:text-[var(--app-text)] transition-all shrink-0"
                    title="Collapse sidebar"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Expand button when collapsed */}
              {sidebarCollapsed && (
                <button
                  onClick={() => setSidebarCollapsed(false)}
                  className="mx-auto mt-2 mb-4 p-2 rounded-lg hover:bg-[var(--card-hover)] text-[var(--app-text-muted)] hover:text-[var(--app-text)] transition-all"
                  title="Expand sidebar"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  </svg>
                </button>
              )}

              {/* Collapsed: just show New Chat icon */}
              {sidebarCollapsed ? (
                <div className="flex flex-col items-center gap-4 px-2">
                  <button
                    onClick={() => handleSelectConversation(null)}
                    className="w-10 h-10 flex items-center justify-center bg-[var(--app-text)] text-[var(--app-bg)] hover:bg-[var(--accent-color)] rounded-xl transition-all active:scale-95"
                    title="New Chat"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>
              ) : (
                <>
                  <div className="p-6">
                    <button
                      onClick={() => handleSelectConversation(null)}
                      className="w-full flex items-center justify-center gap-3 py-3 bg-[var(--card-bg)] border border-[var(--border-color)] hover:border-[var(--accent-color)] hover:bg-[var(--card-hover)] rounded-xl transition-all group active:scale-95 shadow-sm"
                    >
                      <div className="p-1 bg-[var(--accent-color)]/10 rounded-md">
                        <svg className="w-4 h-4 text-[var(--accent-color)] group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                        </svg>
                      </div>
                      <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--app-text)]">New Chat</span>
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar [mask-image:linear-gradient(to_bottom,black_96%,transparent_100%)] px-3 pb-4">
                    {groupedConversations.length === 0 && (
                      <div className="px-3 py-20 text-center opacity-10">
                        <svg className="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                        <p className="text-[10px] font-bold uppercase tracking-widest">No active protocols</p>
                      </div>
                    )}

                    <div className="space-y-6">
                      {groupedConversations.map(([groupName, groupConvs]) => {
                        const isCollapsed = collapsedGroups[groupName];

                        return (
                          <div key={groupName} className="space-y-1.5">
                            <button
                              onClick={() => toggleGroup(groupName)}
                              className="w-full flex items-center justify-between px-3 py-1 group/header hover:bg-[var(--card-hover)] rounded-lg transition-colors active:scale-[0.98]"
                            >
                              <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--app-text-muted)] group-hover/header:text-[var(--app-text)] transition-colors">
                                {groupName}
                              </h4>
                              <svg
                                className={`w-3.5 h-3.5 text-[var(--app-text-muted)] transition-transform duration-200 ${isCollapsed ? '-rotate-90' : 'rotate-0'}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>

                            {!isCollapsed && (
                              <div className="space-y-1.5">
                                {groupConvs.map((conv) => (
                                  <div
                                    key={conv.id}
                                    className={`relative group/conv rounded-xl transition-all border ${activeConvId === conv.id ? 'bg-[var(--card-hover)] border-[var(--border-color)] text-[var(--app-text)]' : 'bg-transparent border-transparent text-[var(--app-text-muted)] hover:bg-[var(--card-hover)]/50 hover:text-[var(--app-text)]'}`}
                                  >
                                    <button
                                      onClick={() => handleSelectConversation(conv.id)}
                                      className="w-full text-left px-4 py-2.5 rounded-xl transition-all"
                                    >
                                      <h3 className="text-sm font-medium truncate pr-10 leading-tight">{conv.title}</h3>
                                    </button>

                                    <button
                                      onClick={(e) => handleDeleteConversation(conv.id, e)}
                                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2 opacity-0 group-hover/conv:opacity-100 hover:bg-red-600 text-white bg-[var(--app-text)] rounded-lg transition-all"
                                      title="Delete conversation"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="p-4 border-t border-[var(--sidebar-border)] bg-[var(--sidebar-bg)]">
                    <button
                      onClick={() => navigate('/profile')}
                      className="w-full flex items-center p-2.5 gap-3 bg-[var(--card-bg)] border border-[var(--border-color)] hover:border-[var(--accent-color)] hover:bg-[var(--card-hover)] rounded-xl transition-all active:scale-[0.98] shadow-sm group"
                    >
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold shrink-0 shadow-inner">
                        {fullName?.charAt(0) || 'U'}
                      </div>

                      <div className="flex flex-col items-start overflow-hidden text-[var(--app-text)]">
                        <span className="text-sm font-medium truncate ">
                          {fullName || ""}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-wider text-[var(--app-text-muted)]">
                            Free Plan
                          </span>
                        </div>
                      </div>

                      <svg
                        className="ml-auto w-4 h-4 text-[var(--app-text-muted)] group-hover:text-[var(--app-text)] transition-colors"
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </>
              )}
            </aside>

            {/* Main Workspace */}
            <div className="flex-1 flex flex-col relative overflow-hidden bg-[var(--app-bg)]">
              <header className="z-[100] h-16 bg-[var(--header-bg)] backdrop-blur-md px-10 flex items-center justify-between absolute top-0 left-0 right-0 border-b border-[var(--header-border)]">
                <div className="flex items-center gap-6 overflow-hidden">
                  <h2 className="text-sm font-semibold tracking-tight text-[var(--app-text)] truncate max-w-[300px]">
                    {currentTitle}
                  </h2>
                  {workspace.currentNodeId && (
                    <div className="flex items-center gap-2 px-2.5 py-0.5 bg-[var(--sidebar-bg)] border border-[var(--border-color)] rounded-full">
                      <span className="text-[9px] font-bold text-[var(--app-text-muted)] uppercase tracking-wider">Branch</span>
                      <span className="text-[10px] font-mono text-[var(--accent-color)]">
                        {workspace.nodes[workspace.currentNodeId]?.hierarchicalID}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <div className="relative">
                    <button
                      onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
                      className="p-2 text-[var(--app-text-muted)] hover:text-[var(--accent-color)] transition-colors rounded-xl hover:bg-[var(--card-hover)]"
                      title="Appearance"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 5a7 7 0 100 14 7 7 0 000-14z" />
                      </svg>
                    </button>

                    {isThemeMenuOpen && (
                      <div className="absolute top-[calc(100%+12px)] right-0 w-48 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl shadow-2xl p-2 z-[110] animate-in fade-in slide-in-from-top-2">
                        <div className="px-3 py-2 text-[10px] font-bold text-[var(--app-text-muted)] uppercase tracking-widest border-b border-[var(--border-color)] mb-2">
                          Appearance
                        </div>

                        <div className="space-y-1 mb-3">
                          <button
                            onClick={() => { setTheme('chatgpt'); setIsThemeMenuOpen(false); }}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${theme === 'chatgpt' ? 'bg-[var(--accent-color)] text-white' : 'text-[var(--app-text)] hover:bg-[var(--card-hover)]'}`}
                          >
                            ChatGPT Theme
                            {theme === 'chatgpt' && <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                          </button>
                          <button
                            onClick={() => { setTheme('claude'); setIsThemeMenuOpen(false); }}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${theme === 'claude' ? 'bg-[var(--accent-color)] text-white' : 'text-[var(--app-text)] hover:bg-[var(--card-hover)]'}`}
                          >
                            Claude Theme
                            {theme === 'claude' && <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                          </button>
                        </div>

                        <div className="flex gap-1 p-1 bg-[var(--sidebar-bg)] rounded-xl">
                          <button
                            onClick={() => { setMode('light'); setIsThemeMenuOpen(false); }}
                            className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${mode === 'light' ? 'bg-[var(--card-bg)] text-[var(--accent-color)] shadow-sm' : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'}`}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 5a7 7 0 100 14 7 7 0 000-14z" /></svg>
                            Light
                          </button>
                          <button
                            onClick={() => { setMode('dark'); setIsThemeMenuOpen(false); }}
                            className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${mode === 'dark' ? 'bg-[var(--card-bg)] text-[var(--accent-color)] shadow-sm' : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'}`}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                            Dark
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => setWorkspace(p => ({ ...p, viewMode: p.viewMode === 'chat' ? 'node' : 'chat' }))}
                    className={`flex items-center gap-3 px-5 py-2 rounded-xl transition-all duration-300 border ${workspace.viewMode === 'chat'
                      ? 'bg-[var(--card-bg)] border-[var(--border-color)] text-[var(--app-text)] hover:border-[var(--accent-color)] shadow-sm'
                      : 'bg-[var(--accent-color)] border-[var(--accent-color)] text-white shadow-sm'
                      }`}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-widest">
                      {workspace.viewMode === 'chat' ? 'Map Overview' : 'Back to Chat'}
                    </span>
                  </button>
                </div>
              </header>

              <main className="flex-1 relative overflow-hidden">
                {isSwitching && (
                  <div className="absolute inset-0 z-[150] bg-[var(--app-bg)]/40 backdrop-blur-xl flex flex-col items-center justify-center">
                    <div className="w-16 h-16 rounded-full border-t-2 border-[var(--accent-color)] animate-spin" />
                  </div>
                )}
                <div className={`absolute inset-0 transition-all duration-300 ${workspace.viewMode === 'chat' ? 'blur-3xl grayscale opacity-10 pointer-events-none' : 'opacity-100'}`}>
                  <NodeView
                    nodes={workspace.nodes}
                    rootNodeId={workspace.rootNodeId}
                    currentNodeId={workspace.currentNodeId}
                    viewMode={workspace.viewMode}
                    onSelectNode={handleNodeSelect}
                    onBranchNode={handleNodeBranch}
                  />
                </div>

                <div className={`relative z-50 w-full h-full transition-all duration-500 ${workspace.viewMode === 'chat' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12 pointer-events-none'}`}>
                  <ChatView
                    history={getFullHistoryPath(workspace.currentNodeId)}
                    onSendMessage={handleSendMessage}
                    onSendMessageToNode={handleSendMessageToNode}
                    onSelectNode={handleNodeSelect}
                    branchLines={branchLines}
                    nodes={workspace.nodes}
                    onBranch={handleNodeBranch}
                    isGenerating={isGenerating}
                    generatingNodeId={generatingNodeId}
                    isBranching={!!workspace.branchingFromId}
                    onCancelBranch={() => setWorkspace(prev => ({ ...prev, branchingFromId: null }))}
                    currentNodeId={workspace.currentNodeId}
                    currentTitle={currentTitle}
                    selectedModel={selectedModel}
                    onModelSelect={setSelectedModel}
                    onStopGeneration={stopGeneration}
                  />
                </div>
              </main>
            </div>
          </div>
        } />
      </Routes>
    </div>
  );
};

export default App;