import React, { useState, useEffect, useMemo, useCallback, useRef, useImperativeHandle, forwardRef } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  useReactFlow,
  ReactFlowProvider,
  Position,
} from 'reactflow';
import dagre from 'dagre';
import { useStore } from '../../store';
import 'reactflow/dist/style.css';

const nodeWidth = 120;
const nodeHeight = 60;
const MIN_VIEWPORT_ZOOM = 0.05;
const MAX_VIEWPORT_ZOOM = 1.4;
const MANUAL_BIAS_MIN = 0.5;
const MANUAL_BIAS_MAX = 1.8;
const ZOOM_BUTTON_MULTIPLIER = 1.15;
const AUTO_CENTER_DELAY_MS = 35;
const AUTO_CENTER_ANIMATION_MS = 500;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'LR') => {
  // Create a fresh graph for each layout to avoid accumulation
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    nodesep: 80,
    ranksep: 150,
  });

  nodes.forEach((node) => {
    g.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = g.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

interface GraphContentProps {
  isMaximized?: boolean;
  isBottomPanel?: boolean;
  onClose?: () => void;
  onBackgroundClick?: () => void;
}

export interface GraphContentHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
}

export const GraphContent = forwardRef<GraphContentHandle, GraphContentProps>(({
  isMaximized = false,
  isBottomPanel = false,
  onClose,
  onBackgroundClick,
}, ref) => {
  const { currentTree, setCurrentNode, scouts } = useStore();
  const reactFlowInstance = useReactFlow();
  const manualZoomBiasRef = useRef(1);
  const adjustTimeoutRef = useRef<number | null>(null);
  const lastViewportKeyRef = useRef<string>('');
  const lastCurrentNodeIdRef = useRef<string | null>(null);

  const { nodes, edges } = useMemo(() => {
    if (!currentTree) return { nodes: [], edges: [] };

    const flowNodes: Node[] = [];
    const flowEdges: Edge[] = [];

    currentTree.nodes.forEach((node) => {
      const nodeText = typeof node.text === 'string' ? node.text : '';
      const truncatedText = nodeText.substring(0, 30) + (nodeText.length > 30 ? '...' : '');
      const isCurrentNode = node.id === currentTree.currentNodeId;

      // Check if this node is the starting point of an active Campaign
      const activeCampaign = scouts.find(
        (s) => s.type === 'Campaign' && s.active && s.activeNodeId === node.id
      );

      const labelPrefix = activeCampaign ? '⚓ ' : '';

      flowNodes.push({
        id: node.id,
        data: { label: labelPrefix + (truncatedText || '<empty>') },
        position: { x: 0, y: 0 }, // Will be set by layout
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        style: {
          background: isCurrentNode ? 'var(--color-sky-medium)' : 'var(--color-sky-accent)',
          border: `2px solid ${isCurrentNode ? 'var(--color-sky-medium)' : 'var(--color-sky-accent)'}`,
          borderRadius: '8px',
          padding: '8px',
          fontSize: '10px',
          width: nodeWidth,
          height: nodeHeight,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
        },
      });

      // Parent-child edges (horizontal, left to right)
      node.childIds.forEach((childId, index) => {
        flowEdges.push({
          id: `${node.id}-${childId}`,
          source: node.id,
          target: childId,
          sourceHandle: 'right',
          targetHandle: 'left',
          type: 'straight',
          style: { stroke: 'var(--color-sky-accent)', strokeWidth: 2 },
          // Add rank to preserve sibling order (first child on top)
          data: { rank: index },
        });
      });
    });

    return getLayoutedElements(flowNodes, flowEdges);
  }, [currentTree]);

  const focusNodes = useMemo(() => {
    if (!currentTree) return [] as Node[];
    const currentNode = currentTree.nodes.get(currentTree.currentNodeId);
    if (!currentNode) return [] as Node[];

    const focusNodeSet = new Set<string>([currentNode.id]);

    if (currentNode.parentId) {
      focusNodeSet.add(currentNode.parentId);
      const parent = currentTree.nodes.get(currentNode.parentId);
      if (parent) {
        parent.childIds.forEach((id) => focusNodeSet.add(id));
      }
    }

    currentNode.childIds.forEach((id) => focusNodeSet.add(id));

    const nodesForFocus = nodes.filter((n) => focusNodeSet.has(n.id));
    return nodesForFocus.length > 0 ? nodesForFocus : nodes;
  }, [currentTree, nodes]);

  const autoAdjustViewport = useCallback((force = false) => {
    if (!currentTree || nodes.length === 0 || !reactFlowInstance) return;

    const currentNodeFlow = nodes.find((n) => n.id === currentTree.currentNodeId);
    if (!currentNodeFlow) return;

    const currentNode = currentTree.nodes.get(currentTree.currentNodeId);
    if (!currentNode) return;

    // Only recenter when the current node actually changes (or when forced)
    const currentNodeId = currentTree.currentNodeId;
    const nodeHasChanged = lastCurrentNodeIdRef.current !== currentNodeId;

    if (!force && !nodeHasChanged) {
      // Current node hasn't changed, so don't recenter
      return;
    }

    lastCurrentNodeIdRef.current = currentNodeId;

    const nodesToFit = isMaximized ? nodes : focusNodes;
    if (nodesToFit.length === 0) return;

    const focusSignature = nodesToFit
      .map((n) => `${n.id}:${Math.round(n.position.x)}:${Math.round(n.position.y)}`)
      .sort()
      .join('|');
    const viewportKey = `${isMaximized ? 'max' : 'mini'}:${currentTree.currentNodeId}:${focusSignature}`;

    if (!force && lastViewportKeyRef.current === viewportKey) {
      return;
    }

    lastViewportKeyRef.current = viewportKey;

    const focusCount = nodesToFit.length;
    const familyBias = (() => {
      if (isMaximized) {
        if (focusCount <= 4) return 1.2;
        if (focusCount <= 8) return 1.05;
        if (focusCount <= 16) return 0.95;
        return 0.85;
      }

      if (focusCount <= 2) return 1.4;
      if (focusCount <= 4) return 1.1;
      if (focusCount <= 6) return 0.9;
      if (focusCount <= 10) return 0.7;
      return 0.6;
    })();

    if (adjustTimeoutRef.current) {
      clearTimeout(adjustTimeoutRef.current);
      adjustTimeoutRef.current = null;
    }

    adjustTimeoutRef.current = window.setTimeout(() => {
      // Instead of trying to fit all nodes, pick a comfortable zoom based on family size
      // The familyBias already encodes the right zoom level for each family size
      const baseZoom = isMaximized ? 0.8 : 0.75;

      // Apply family bias and manual zoom bias
      const desiredZoom = baseZoom * familyBias * manualZoomBiasRef.current;
      const targetZoom = clamp(desiredZoom, MIN_VIEWPORT_ZOOM, MAX_VIEWPORT_ZOOM);

      // Target center is the current node's center
      const centerX = currentNodeFlow.position.x + nodeWidth / 2;
      const centerY = currentNodeFlow.position.y + nodeHeight / 2;

      // Smoothly transition to target position and zoom
      reactFlowInstance.setCenter(centerX, centerY, {
        zoom: targetZoom,
        duration: AUTO_CENTER_ANIMATION_MS,
      });

      adjustTimeoutRef.current = null;
    }, AUTO_CENTER_DELAY_MS);
  }, [currentTree, nodes, focusNodes, isMaximized, reactFlowInstance]);

  useEffect(() => {
    autoAdjustViewport();
  }, [autoAdjustViewport]);

  useEffect(() => {
    return () => {
      if (adjustTimeoutRef.current) {
        clearTimeout(adjustTimeoutRef.current);
      }
    };
  }, []);

  const handleManualZoom = useCallback(
    (multiplier: number) => {
      if (!reactFlowInstance) return;

      manualZoomBiasRef.current = clamp(
        manualZoomBiasRef.current * multiplier,
        MANUAL_BIAS_MIN,
        MANUAL_BIAS_MAX
      );

      const currentZoom = reactFlowInstance.getZoom();
      const nextZoom = clamp(currentZoom * multiplier, MIN_VIEWPORT_ZOOM, MAX_VIEWPORT_ZOOM);
      reactFlowInstance.zoomTo(nextZoom, { duration: 160 });
    },
    [reactFlowInstance]
  );

  const handleZoomIn = useCallback(() => {
    handleManualZoom(ZOOM_BUTTON_MULTIPLIER);
  }, [handleManualZoom]);

  const handleZoomOut = useCallback(() => {
    handleManualZoom(1 / ZOOM_BUTTON_MULTIPLIER);
  }, [handleManualZoom]);

  const handleResetZoom = useCallback(() => {
    manualZoomBiasRef.current = 1;
    autoAdjustViewport(true);
  }, [autoAdjustViewport]);

  // Expose zoom functions via ref for bottom panel controls
  useImperativeHandle(ref, () => ({
    zoomIn: handleZoomIn,
    zoomOut: handleZoomOut,
    resetZoom: handleResetZoom,
  }), [handleZoomIn, handleZoomOut, handleResetZoom]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setCurrentNode(node.id);
      if (isMaximized && onClose) {
        onClose();
      }
    },
    [setCurrentNode, isMaximized, onClose]
  );

  if (!currentTree) {
    return (
      <div className="h-full flex items-center justify-center bg-sky-light text-gray-500 text-sm">
        No tree selected
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {!isMaximized && !isBottomPanel && (
        <div className="h-8 bg-sky-medium flex items-center justify-between px-3">
          <span className="text-xs font-semibold text-gray-800">Graph View</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleZoomOut}
              className="px-2 py-1 rounded bg-sky-accent hover:bg-sky-light text-xs transition-colors"
              aria-label="Zoom out"
            >
              −
            </button>
            <button
              type="button"
              onClick={handleZoomIn}
              className="px-2 py-1 rounded bg-sky-accent hover:bg-sky-light text-xs transition-colors"
              aria-label="Zoom in"
            >
              +
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              className="px-2 py-1 rounded bg-sky-accent hover:bg-sky-light text-xs transition-colors"
              aria-label="Reset zoom"
            >
              ↺
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodeClick={handleNodeClick}
          fitView
          minZoom={MIN_VIEWPORT_ZOOM}
          maxZoom={MAX_VIEWPORT_ZOOM}
          onPaneClick={() => {
            if (!isMaximized && onBackgroundClick) {
              onBackgroundClick();
            }
          }}
          attributionPosition="bottom-left"
        >
          {isMaximized && <Controls />}
        </ReactFlow>
      </div>
    </div>
  );
});

GraphContent.displayName = 'GraphContent';

const Graph: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);

  return (
    <>
      <div
        className="h-full cursor-pointer"
      >
        <ReactFlowProvider>
          <GraphContent onBackgroundClick={() => setIsMaximized(true)} />
        </ReactFlowProvider>
      </div>

      {isMaximized && (
        <div
          className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50"
          onClick={() => setIsMaximized(false)}
        >
          <div
            className="w-[90%] h-[90%] bg-sky-light rounded-xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <ReactFlowProvider>
              <GraphContent isMaximized={true} onClose={() => setIsMaximized(false)} />
            </ReactFlowProvider>
          </div>
        </div>
      )}
    </>
  );
};

export default Graph;

// Bottom panel version that exposes controls via ref
export const GraphBottom = forwardRef<GraphContentHandle, {}>((_props, ref) => {
  const [isMaximized, setIsMaximized] = useState(false);

  return (
    <>
      <div className="h-full">
        <ReactFlowProvider>
          <GraphContent ref={ref} isBottomPanel={true} onBackgroundClick={() => setIsMaximized(true)} />
        </ReactFlowProvider>
      </div>

      {isMaximized && (
        <div
          className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50"
          onClick={() => setIsMaximized(false)}
        >
          <div
            className="w-[90%] h-[90%] bg-sky-light rounded-xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <ReactFlowProvider>
              <GraphContent isMaximized={true} onClose={() => setIsMaximized(false)} />
            </ReactFlowProvider>
          </div>
        </div>
      )}
    </>
  );
});

GraphBottom.displayName = 'GraphBottom';
