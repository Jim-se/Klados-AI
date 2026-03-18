import React, { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import ReactFlow, {
    Background,
    Controls,
    MiniMap,
    Node,
    Edge,
    Position,
    MarkerType,
    useReactFlow,
    ReactFlowProvider,
    BackgroundVariant,
    Panel
} from 'reactflow';
import { ChatNode } from '../types';
import { NodeCard } from './NodeCard';
import { NodeDataContext } from '../src/contexts/NodeDataContext';
import { buildNodeMessageSummaries, estimateNodeCardHeight } from './nodeViewUtils';

interface NodeViewProps {
    nodes: Record<string, ChatNode>;
    rootNodeId: string | null;
    currentNodeId: string | null;
    viewMode: 'chat' | 'node';
    onSelectNode: (id: string, messageOrdinal?: number) => void;
    onBranchNode: (id: string, messageOrdinal?: number) => void;
}



const CameraController: React.FC<{ viewMode: 'chat' | 'node'; rootNodeId: string | null }> = ({ viewMode, rootNodeId }) => {
    const { fitView } = useReactFlow();
    const hasFittedRootRef = React.useRef<string | null>(null);
    const lastViewModeRef = React.useRef<'chat' | 'node'>(viewMode);

    useEffect(() => {
        const enteringNodeView = lastViewModeRef.current !== 'node' && viewMode === 'node';
        lastViewModeRef.current = viewMode;

        if (viewMode !== 'node' || !rootNodeId) {
            return;
        }

        if (!enteringNodeView && hasFittedRootRef.current === rootNodeId) {
            return;
        }

        const rafId = window.requestAnimationFrame(() => {
            fitView({ duration: 0, padding: 1.2 });
        });

        const timeoutId = window.setTimeout(() => {
            fitView({ duration: 0, padding: 1.2 });
        }, 50);

        hasFittedRootRef.current = rootNodeId;

        return () => {
            window.cancelAnimationFrame(rafId);
            window.clearTimeout(timeoutId);
        };
    }, [fitView, rootNodeId, viewMode]);

    return null;
};

export const NodeView: React.FC<NodeViewProps> = (props) => {
    const nodeTypes = useMemo(() => ({
        chatNode: NodeCard,
    }), []);


    const { nodes, rootNodeId, currentNodeId, viewMode, onSelectNode, onBranchNode } = props;
    const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(() => new Set());
    const [measuredNodeLayouts, setMeasuredNodeLayouts] = useState<Record<string, { height: number; branchTops: Record<string, number> }>>({});
    const rootCenterRef = useRef<number>(0);

    const toggleCollapse = useCallback((id: string) => {
        setCollapsedNodeIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const reportBranchLayout = useCallback((id: string, layout: { height: number; branchTops: Record<string, number> }) => {
        setMeasuredNodeLayouts((prev) => {
            const existing = prev[id];
            const nextKey = `${Math.round(layout.height)}|${Object.entries(layout.branchTops)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([childId, top]) => `${childId}:${Math.round(top)}`)
                .join(',')}`;
            const prevKey = existing
                ? `${Math.round(existing.height)}|${Object.entries(existing.branchTops)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([childId, top]) => `${childId}:${Math.round(top)}`)
                    .join(',')}`
                : '';

            if (nextKey === prevKey) {
                return prev;
            }

            return { ...prev, [id]: layout };
        });
    }, []);

    // Derive a compact layout dependency string so positions refresh only when
    // tree structure, selection, or stacked message height meaningfully changes.
    const layoutDeps = useMemo(() => {
        if (!rootNodeId || !nodes[rootNodeId]) return '';
        const shape: string[] = [];
        const traverse = (id: string) => {
            const n = nodes[id];
            if (!n) return;
            const collapsed = collapsedNodeIds.has(id);
            shape.push(`${id}:${collapsed ? 'c' : 'e'}:${n.childrenIds.join(',')}:${estimateNodeCardHeight(n.messages)}`);
            n.childrenIds.forEach(traverse);
        };
        traverse(rootNodeId);
        const collapsedKey = [...collapsedNodeIds].sort().join(',');
        return `${rootNodeId}|${currentNodeId}|${collapsedKey}|${shape.join('|')}`;
    }, [nodes, rootNodeId, currentNodeId, collapsedNodeIds]);

    const { flowNodes, flowEdges } = useMemo(() => {
        if (!rootNodeId) {
            return { flowNodes: [], flowEdges: [] };
        }

        if (!nodes[rootNodeId]) {
            return { flowNodes: [], flowEdges: [] };
        }
        const flowNodes: Node[] = [];
        const flowEdges: Edge[] = [];

        const BASE_HORIZONTAL_SPACING = 440;
        const BASE_VERTICAL_SPACING = 36;

        const visited = new Set<string>();

        const COLLAPSED_HEIGHT = 76;

        const parseBranchSourceOrdinal = (parentId: string, branchMessageId: string | null | undefined, maxOrdinal: number) => {
            if (!branchMessageId) return null;

            const colonIndex = branchMessageId.lastIndexOf(':');
            if (colonIndex > -1) {
                const prefixNodeId = branchMessageId.slice(0, colonIndex);
                if (prefixNodeId !== parentId) return null;
                const maybeOrdinal = Number(branchMessageId.slice(colonIndex + 1));
                return Number.isFinite(maybeOrdinal) ? maybeOrdinal : null;
            }

            const legacyPrefix = `${parentId}-`;
            if (branchMessageId.startsWith(legacyPrefix)) {
                const suffix = branchMessageId.slice(legacyPrefix.length);
                const maybeOrdinal = Number(suffix);
                if (Number.isFinite(maybeOrdinal) && maybeOrdinal >= 0 && maybeOrdinal <= maxOrdinal) {
                    return maybeOrdinal;
                }
            }

            return null;
        };

        const estimateBranchSourceOffsetPx = (parentNode: ChatNode, childNode: ChatNode, parentHeight: number) => {
            if (!childNode.isBranch) return parentHeight / 2;
            if (collapsedNodeIds.has(parentNode.id)) return parentHeight / 2;

            const measuredTop = measuredNodeLayouts[parentNode.id]?.branchTops?.[childNode.id];
            if (typeof measuredTop === 'number' && measuredTop > 0) {
                return measuredTop;
            }

            const maxOrdinal = parentNode.messages.reduce((max, message) => Math.max(max, message.ordinal), -1);
            const sourceOrdinal = parseBranchSourceOrdinal(parentNode.id, childNode.branchMessageId, maxOrdinal);
            if (sourceOrdinal == null) return parentHeight / 2;

            const summaries = buildNodeMessageSummaries(parentNode.messages);
            if (summaries.length === 0) return parentHeight / 2;

            const SUMMARY_GAP = 10;
            const BASE_OFFSET = 118;
            let yCursor = BASE_OFFSET;

            for (const summary of summaries) {
                const summaryHeight = 86 + summary.headings.length * 18;
                const matches = summary.promptOrdinal === sourceOrdinal ||
                    summary.responseOrdinal === sourceOrdinal ||
                    summary.anchorOrdinal === sourceOrdinal;

                if (matches) {
                    return yCursor + (summaryHeight / 2);
                }

                yCursor += summaryHeight + SUMMARY_GAP;
            }

            return parentHeight / 2;
        };

        const getNodeHeight = (node: ChatNode) => {
            if (collapsedNodeIds.has(node.id)) {
                return COLLAPSED_HEIGHT;
            }

            const measured = measuredNodeLayouts[node.id]?.height;
            return typeof measured === 'number' && measured > 0 ? measured : estimateNodeCardHeight(node.messages);
        };

        const getNodeScale = (node: ChatNode) => {
            const depth = (node.hierarchicalID.match(/\./g) || []).length;
            return Math.max(0.5, Math.pow(0.88, depth));
        };

        const subtreeHeightCache = new Map<string, number>();

        const getSubtreeHeight = (nodeId: string): number => {
            const cachedHeight = subtreeHeightCache.get(nodeId);
            if (cachedHeight != null) {
                return cachedHeight;
            }

            const node = nodes[nodeId];
            if (!node) {
                return 0;
            }

            const ownHeight = getNodeHeight(node);
            const childHeights = node.childrenIds
                .map((childId) => getSubtreeHeight(childId))
                .filter((height) => height > 0);
            const stackedChildrenHeight = childHeights.length > 0
                ? childHeights.reduce((total, height) => total + height, 0) + BASE_VERTICAL_SPACING * (childHeights.length - 1)
                : 0;
            const subtreeHeight = Math.max(ownHeight, stackedChildrenHeight);

            subtreeHeightCache.set(nodeId, subtreeHeight);
            return subtreeHeight;
        };

        const distributeChildCenters = <T extends {
            desiredCenterY: number;
            subtreeHeight: number;
        },>(entries: T[]) => {
            if (entries.length <= 1) {
                return entries.map((entry) => ({ ...entry, centerY: entry.desiredCenterY }));
            }

            const sortedEntries = [...entries].sort((left, right) => left.desiredCenterY - right.desiredCenterY);

            let arranged = sortedEntries.map((entry) => ({ ...entry, centerY: entry.desiredCenterY }));

            for (let index = 1; index < arranged.length; index += 1) {
                const previous = arranged[index - 1];
                const current = arranged[index];
                const minCenterY = previous.centerY + (previous.subtreeHeight / 2) + BASE_VERTICAL_SPACING + (current.subtreeHeight / 2);
                if (current.centerY < minCenterY) {
                    current.centerY = minCenterY;
                }
            }

            const desiredMidpoint = (sortedEntries[0].desiredCenterY + sortedEntries[sortedEntries.length - 1].desiredCenterY) / 2;
            const actualMidpoint = (arranged[0].centerY + arranged[arranged.length - 1].centerY) / 2;
            const shift = desiredMidpoint - actualMidpoint;
            arranged = arranged.map((entry) => ({ ...entry, centerY: entry.centerY + shift }));

            for (let index = 1; index < arranged.length; index += 1) {
                const previous = arranged[index - 1];
                const current = arranged[index];
                const minCenterY = previous.centerY + (previous.subtreeHeight / 2) + BASE_VERTICAL_SPACING + (current.subtreeHeight / 2);
                if (current.centerY < minCenterY) {
                    current.centerY = minCenterY;
                }
            }

            for (let index = arranged.length - 2; index >= 0; index -= 1) {
                const current = arranged[index];
                const next = arranged[index + 1];
                const maxCenterY = next.centerY - (next.subtreeHeight / 2) - BASE_VERTICAL_SPACING - (current.subtreeHeight / 2);
                if (current.centerY > maxCenterY) {
                    current.centerY = maxCenterY;
                }
            }

            return arranged;
        };

        const hasChildPlacementOverlap = (entries: Array<{
            sourceCenterY: number;
            nodeHeight: number;
        }>) => {
            if (entries.length <= 1) {
                return false;
            }

            const sortedEntries = [...entries].sort((left, right) => left.sourceCenterY - right.sourceCenterY);

            for (let index = 1; index < sortedEntries.length; index += 1) {
                const previous = sortedEntries[index - 1];
                const current = sortedEntries[index];
                const minCenterGap = (previous.nodeHeight / 2) + BASE_VERTICAL_SPACING + (current.nodeHeight / 2);

                if ((current.sourceCenterY - previous.sourceCenterY) < minCenterGap) {
                    return true;
                }
            }

            return false;
        };

        const layout = (id: string, x: number, centerY: number) => {
            if (visited.has(id)) return;
            visited.add(id);

            const node = nodes[id];
            if (!node) return;

            const scale = getNodeScale(node);
            const ownHeight = getNodeHeight(node);
            const topY = centerY - (ownHeight / 2);

            if (id === rootNodeId) {
                rootCenterRef.current = centerY;
            }

            flowNodes.push({
                id: node.id,
                type: 'chatNode',
                position: { x, y: topY },
                sourcePosition: Position.Right,
                targetPosition: Position.Left,
                // PASS ONLY NON-VOLATILE DATA to prevent full re-renders
                // Content will be fetched from NodeDataContext directly by NodeCard 
                data: {
                    id: node.id,
                    onBranch: onBranchNode,
                    onSelect: onSelectNode,
                    onToggleCollapse: toggleCollapse,
                    onReportBranchLayout: reportBranchLayout,
                    collapsed: collapsedNodeIds.has(node.id),
                    scale
                },
                selected: node.id === currentNodeId,
            });

            const rawChildPlacements = node.childrenIds.map((childId, childIndex) => {
                const childNode = nodes[childId];
                if (!childNode) {
                    return null;
                }

                const depth = (node.hierarchicalID.match(/\./g) || []).length;
                const spacingAdjustment = Math.max(0.7, Math.pow(0.95, depth));
                const horizontalOffset = BASE_HORIZONTAL_SPACING * spacingAdjustment;
                const sourceOffsetPx = estimateBranchSourceOffsetPx(node, childNode, ownHeight);
                const sourceCenterY = centerY + ((sourceOffsetPx - (ownHeight / 2)) * scale);

                    return {
                        childId,
                        childIndex,
                        childNode,
                        horizontalOffset,
                        nodeHeight: getNodeHeight(childNode),
                        sourceCenterY,
                        desiredCenterY: sourceCenterY,
                        subtreeHeight: getSubtreeHeight(childId),
                    };
                }).filter(Boolean) as Array<{
                    childId: string;
                    childIndex: number;
                    childNode: ChatNode;
                    horizontalOffset: number;
                    nodeHeight: number;
                    sourceCenterY: number;
                    desiredCenterY: number;
                    subtreeHeight: number;
                }>;

            const needsCollisionLayout = hasChildPlacementOverlap(rawChildPlacements);
            const useForkedEdges = (collapsedNodeIds.has(node.id) && rawChildPlacements.length > 1) || needsCollisionLayout;
            const childPlacements = (useForkedEdges
                ? distributeChildCenters(rawChildPlacements)
                : rawChildPlacements.map((placement) => ({
                    ...placement,
                    centerY: placement.sourceCenterY,
                }))
            ).sort((left, right) => left.childIndex - right.childIndex);

            childPlacements.forEach(({ childId, childNode, horizontalOffset, centerY: childCenterY }) => {
                const sourceHandle = childNode.isBranch ? `branch-${childId}` : 'source';

                flowEdges.push({
                    id: `e-${id}-${childId}`,
                    source: id,
                    sourceHandle,
                    target: childId,
                    targetHandle: 'target',
                    type: useForkedEdges ? 'smoothstep' : 'straight',
                    animated: childId === currentNodeId,
                    style: {
                        stroke: childId === currentNodeId ? 'var(--accent-color)' : 'var(--border-color)',
                        strokeWidth: 2 * scale, // Lines get thinner as tree gets deeper
                        opacity: 0.8
                    },
                    markerEnd: {
                        type: MarkerType.ArrowClosed,
                        color: childId === currentNodeId ? 'var(--accent-color)' : 'var(--border-color)'
                    },
                    ...(useForkedEdges ? {
                        pathOptions: {
                            borderRadius: 18,
                            offset: 20,
                        },
                    } : {}),
                });

                layout(childId, x + horizontalOffset, childCenterY);
            });
        };

        layout(rootNodeId, 0, rootCenterRef.current);

        return { flowNodes, flowEdges };
    }, [layoutDeps, nodes, rootNodeId, currentNodeId, onBranchNode, onSelectNode, collapsedNodeIds, measuredNodeLayouts, reportBranchLayout, toggleCollapse]);

    const reachableNodeIds = useMemo(() => {
        if (!rootNodeId || !nodes[rootNodeId]) return [];
        const ids: string[] = [];
        const visitedIds = new Set<string>();
        const walk = (id: string) => {
            if (visitedIds.has(id)) return;
            visitedIds.add(id);
            const node = nodes[id];
            if (!node) return;
            ids.push(id);
            node.childrenIds.forEach(walk);
        };
        walk(rootNodeId);
        return ids;
    }, [nodes, rootNodeId]);

    if (!rootNodeId) return null;

    return (
        <div className="h-full w-full bg-[var(--app-bg)] relative transition-colors duration-300">
            <NodeDataContext.Provider value={nodes}>
                <ReactFlowProvider>
                    <ReactFlow
                        nodes={flowNodes}
                        edges={flowEdges}
                        nodeTypes={nodeTypes}
                        onNodeClick={(_, node) => onSelectNode(node.id)}
                        minZoom={0.1}
                        maxZoom={2}
                        zoomOnScroll={viewMode === 'node'}
                        panOnDrag={viewMode === 'node'}
                    >
                        <Background
                            variant={BackgroundVariant.Dots}
                            color="var(--border-color)"
                            gap={20}
                            size={1}
                        />
                        <Controls position="bottom-right" className="!bg-[var(--card-bg)] !border-[var(--border-color)] !shadow-xl" />
                        <Panel position="bottom-right" style={{ marginBottom: 86 }}>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setCollapsedNodeIds(new Set(reachableNodeIds))}
                                    className="px-3 py-2 rounded-xl bg-[var(--card-bg)] border border-[var(--border-color)]/60 text-[12px] text-[var(--app-text)] shadow-sm hover:bg-[var(--card-hover)] transition-colors"
                                    title="Collapse all nodes"
                                >
                                    Collapse all
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCollapsedNodeIds(new Set())}
                                    className="px-3 py-2 rounded-xl bg-[var(--card-bg)] border border-[var(--border-color)]/60 text-[12px] text-[var(--app-text)] shadow-sm hover:bg-[var(--card-hover)] transition-colors"
                                    title="Expand all nodes"
                                >
                                    Expand all
                                </button>
                            </div>
                        </Panel>
                        <MiniMap
                            nodeColor={(n: any) => (n.selected ? 'var(--accent-color)' : 'var(--border-color)')}
                            maskColor="rgba(0, 0, 0, 0.1)"
                            className="!hidden md:!block !bg-[var(--card-bg)] !border-[var(--border-color)] !rounded-2xl"
                            style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '16px' }}
                        />
                        <CameraController viewMode={viewMode} rootNodeId={rootNodeId} />
                    </ReactFlow>
                </ReactFlowProvider>
            </NodeDataContext.Provider>
        </div>
    );
};
