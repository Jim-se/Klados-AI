import React, { useMemo, useEffect } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  MarkerType,
  useReactFlow,
  ReactFlowProvider,
  BackgroundVariant
} from 'reactflow';
import { ChatNode } from '../types';
import { NodeCard } from './NodeCard';
import { NodeDataContext } from '../src/contexts/NodeDataContext';

interface NodeViewProps {
  nodes: Record<string, ChatNode>;
  rootNodeId: string | null;
  currentNodeId: string | null;
  viewMode: 'chat' | 'node';
  onSelectNode: (id: string) => void;
  onBranchNode: (id: string) => void;
}



const CameraController: React.FC<{ currentNodeId: string | null; viewMode: 'chat' | 'node' }> = ({
  currentNodeId,
  viewMode
}) => {
  const { fitView, setCenter, getNode } = useReactFlow();

  useEffect(() => {
    if (viewMode === 'chat' && currentNodeId) {
      const node = getNode(currentNodeId);
      if (node) {
        // Shift camera slightly based on scale to keep node well-framed
        const targetX = node.position.x + 120;
        const targetY = node.position.y + 60;

        setCenter(targetX, targetY, { zoom: 1.1, duration: 1200 });
      }
    } else if (viewMode === 'node') {
      fitView({ duration: 0, padding: 0.3 });
    }
  }, [viewMode, currentNodeId, setCenter, fitView, getNode]);

  return null;
};

export const NodeView: React.FC<NodeViewProps> = (props) => {
  // ADD THIS HERE:
  const nodeTypes = useMemo(() => ({
    chatNode: NodeCard,
  }), []);


  const { nodes, rootNodeId, currentNodeId, viewMode, onSelectNode, onBranchNode } = props;

  // Derive a topology dependency string that uniquely identifies the SHAPE of the graph
  // This prevents Reactflow from recalculating when only text inside the nodes changes
  const topologyDeps = useMemo(() => {
    if (!rootNodeId || !nodes[rootNodeId]) return '';
    const shape: string[] = [];
    const traverse = (id: string) => {
      const n = nodes[id];
      if (!n) return;
      shape.push(`${id}:${n.childrenIds.join(',')}`);
      n.childrenIds.forEach(traverse);
    };
    traverse(rootNodeId);
    return `${rootNodeId}|${currentNodeId}|${shape.join('|')}`;
  }, [nodes, rootNodeId, currentNodeId]);

  const { flowNodes, flowEdges } = useMemo(() => {
    console.log('🔍 NodeView recalculating topology', {
      rootNodeId,
      hasRootInNodes: !!nodes[rootNodeId],
      timestamp: Date.now()
    });
    if (!rootNodeId) {
      console.warn('NodeView: rootNodeId is null');
      return { flowNodes: [], flowEdges: [] };
    }

    if (!nodes[rootNodeId]) {
      console.error('NodeView: root node not found in nodes!', rootNodeId, 'Available:', Object.keys(nodes));
      return { flowNodes: [], flowEdges: [] };
    }
    const flowNodes: Node[] = [];
    const flowEdges: Edge[] = [];

    const BASE_HORIZONTAL_SPACING = 380;
    const BASE_VERTICAL_SPACING = 180;

    const nodeSubtreeHeights: Record<string, number> = {};

    // First pass: calculate how much vertical space each node's children need
    const calculateSubtreeHeight = (id: string): number => {
      const node = nodes[id];
      if (!node || node.childrenIds.length === 0) {
        nodeSubtreeHeights[id] = BASE_VERTICAL_SPACING;
        return BASE_VERTICAL_SPACING;
      }

      let totalHeight = 0;
      node.childrenIds.forEach(childId => {
        totalHeight += calculateSubtreeHeight(childId);
      });

      const height = Math.max(BASE_VERTICAL_SPACING, totalHeight);
      nodeSubtreeHeights[id] = height;
      return height;
    };

    calculateSubtreeHeight(rootNodeId);

    const visited = new Set<string>();

    const layout = (id: string, x: number, y: number) => {
      if (visited.has(id)) return;
      visited.add(id);

      const node = nodes[id];
      if (!node) return;

      // Calculate depth and scale
      // ID "1" = Depth 0, ID "1.a" = Depth 1, ID "1.a.1" = Depth 2
      const depth = (node.hierarchicalID.match(/\./g) || []).length;
      //const depth = (node.id.match(/\./g) || []).length;
      const scale = Math.max(0.5, Math.pow(0.88, depth));

      flowNodes.push({
        id: node.id,
        type: 'chatNode',
        position: { x, y },
        // PASS ONLY NON-VOLATILE DATA to prevent full re-renders
        // Content will be fetched from NodeDataContext directly by NodeCard 
        data: {
          id: node.id,
          onBranch: onBranchNode,
          onSelect: onSelectNode,
          scale
        },
        selected: node.id === currentNodeId,
      });

      let currentY = y - (nodeSubtreeHeights[id] / 2) + (BASE_VERTICAL_SPACING / 2);

      node.childrenIds.forEach((childId) => {
        const childHeight = nodeSubtreeHeights[childId];
        const nextY = currentY + (childHeight / 2) - (BASE_VERTICAL_SPACING / 2);

        // We adjust horizontal spacing slightly for deeper nodes to keep the tree compact
        const childDepth = depth + 1;
        const spacingAdjustment = Math.max(0.7, Math.pow(0.95, depth));
        const horizontalOffset = BASE_HORIZONTAL_SPACING * spacingAdjustment;

        flowEdges.push({
          id: `e-${id}-${childId}`,
          source: id,
          target: childId,
          type: 'step',
          animated: childId === currentNodeId,
          style: {
            stroke: childId === currentNodeId ? '#3b82f6' : 'rgba(255,255,255,0.06)',
            strokeWidth: 2 * scale, // Lines get thinner as tree gets deeper
            opacity: childId === currentNodeId ? 1 : 0.5
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: childId === currentNodeId ? '#3b82f6' : '#27272a'
          }
        });

        layout(childId, x + horizontalOffset, nextY);
        currentY += childHeight;
      });
    };

    layout(rootNodeId, 0, 0);

    return { flowNodes, flowEdges };
  }, [topologyDeps, onBranchNode, onSelectNode]);

  if (!rootNodeId) return null;

  return (
    <div className="h-full w-full bg-[#020203] relative">
      <NodeDataContext.Provider value={nodes}>
        <ReactFlowProvider>
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => onSelectNode(node.id)}
            minZoom={0.5}
            maxZoom={2}
            zoomOnScroll={viewMode === 'node'}
            panOnDrag={viewMode === 'node'}
          >
            <Background
              variant={BackgroundVariant.Dots}
              color="#9b9b9b"
              gap={20}
              size={1}
              className=""
            />
            <Controls position="bottom-right" className="bg-zinc-900 border-zinc-800 shadow-2xl" />
            <MiniMap
              nodeColor={(n) => (n.selected ? '#3b82f6' : '#18181b')}
              maskColor="rgba(0, 0, 0, 0.9)"
              style={{ backgroundColor: '#020203', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px' }}
            />
            <CameraController currentNodeId={currentNodeId} viewMode={viewMode} />
          </ReactFlow>
        </ReactFlowProvider>
      </NodeDataContext.Provider>
    </div>
  );
};
