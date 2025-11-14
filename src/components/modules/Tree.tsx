import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../../store';

const Tree: React.FC = () => {
  const { currentTree, setCurrentNode, scouts } = useStore();
  const [zoom, setZoom] = useState(1);
  const [showBookmarkDropdown, setShowBookmarkDropdown] = useState(false);
  const currentNodeRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentNodeRef.current && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const element = currentNodeRef.current;

      // Use getBoundingClientRect to get accurate positions
      const containerRect = container.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();

      // Calculate element position relative to container's content (accounting for current scroll)
      const elementTop = elementRect.top - containerRect.top + container.scrollTop;
      const elementLeft = elementRect.left - containerRect.left + container.scrollLeft;

      const containerHeight = container.clientHeight;
      const containerWidth = container.clientWidth;
      const elementHeight = elementRect.height;

      // Scroll to center the element vertically
      const scrollToTop = elementTop - (containerHeight / 2) + (elementHeight / 2);

      // Scroll horizontally based on the left edge of the node only
      // Center the left edge of the node in the viewport
      const desiredScrollLeft = elementLeft - (containerWidth / 2);

      // Limit to left edge (0) - this naturally creates the "halfway" behavior
      const scrollToLeft = Math.max(0, desiredScrollLeft);

      container.scrollTo({
        top: scrollToTop,
        left: scrollToLeft,
        behavior: 'smooth',
      });
    }
  }, [currentTree?.currentNodeId]);

  // Close bookmark dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.relative')) {
        setShowBookmarkDropdown(false);
      }
    };

    if (showBookmarkDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showBookmarkDropdown]);

  if (!currentTree) {
    return (
      <div className="h-full flex items-center justify-center bg-sky-light text-gray-500 text-sm">
        No tree selected
      </div>
    );
  }

  const renderNode = (nodeId: string, depth: number = 0): JSX.Element | null => {
    const node = currentTree.nodes.get(nodeId);
    if (!node) return null;

    const isCurrentNode = nodeId === currentTree.currentNodeId;
    const hasChildren = node.childIds.length > 0;
    const nodeText = typeof node.text === 'string' ? node.text : '';
    const truncatedText = nodeText.substring(0, 30) + (nodeText.length > 30 ? '...' : '');
    const isBookmarked = currentTree.bookmarkedNodeIds.includes(nodeId);

    // Check if this node is the starting point of an active Campaign
    const activeCampaign = scouts.find(
      (s) => s.type === 'Campaign' && s.active && s.activeNodeId === nodeId
    );

    return (
      <div key={nodeId} style={{ paddingLeft: depth > 0 ? '16px' : '0' }}>
        <div
          ref={isCurrentNode ? currentNodeRef : null}
          className={`
            px-2 py-1 my-1 rounded cursor-pointer inline-block
            ${isCurrentNode ? 'bg-sky-medium text-gray-900 font-semibold' : 'bg-sky-accent hover:bg-sky-medium'}
            transition-colors
          `}
          style={{ minWidth: '5em' }}
          onClick={() => setCurrentNode(nodeId)}
        >
          <div className="flex items-center gap-1 whitespace-nowrap">
            {isBookmarked && <span>☆</span>}
            {activeCampaign && <span>⚓</span>}
            {node.locked && <span>🔒</span>}
            {node.lockReason === 'scout-active' && <span>🔍</span>}
            {node.lockReason === 'witness-active' && <span>👁️</span>}
            {node.lockReason === 'trident-active' && <span>🔱</span>}
            {node.lockReason === 'copilot-deciding' && <span>🧭</span>}
            <span>{truncatedText || '<empty>'}</span>
          </div>
        </div>

        {hasChildren && (
          <div>
            {node.childIds.map((childId) => renderNode(childId, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-sky-light">
      {/* Ribbon */}
      <div className="h-8 bg-sky-medium flex items-center justify-between px-3">
        <span className="text-xs font-semibold text-gray-800">Tree View</span>
        <div className="flex items-center gap-2">
          {/* Bookmark dropdown button */}
          <div className="relative">
            <button
              onClick={() => setShowBookmarkDropdown(!showBookmarkDropdown)}
              className="w-6 h-6 rounded bg-sky-accent hover:bg-sky-light text-sm transition-colors flex items-center justify-center"
              title="Show bookmarked nodes"
            >
              ☆
            </button>

            {/* Bookmark dropdown */}
            {showBookmarkDropdown && (
              <div className="absolute top-full right-0 mt-1 bg-white border border-sky-dark rounded shadow-lg z-50 min-w-[200px] max-h-[300px] overflow-y-auto">
                {currentTree.bookmarkedNodeIds.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-gray-500">No bookmarks</div>
                ) : (
                  currentTree.bookmarkedNodeIds.map((nodeId) => {
                    const node = currentTree.nodes.get(nodeId);
                    if (!node) return null;
                    const nodeText = typeof node.text === 'string' ? node.text : '';
                    const truncatedText = nodeText.substring(0, 40) + (nodeText.length > 40 ? '...' : '');
                    const isCurrentNode = nodeId === currentTree.currentNodeId;
                    return (
                      <button
                        key={nodeId}
                        onClick={() => {
                          setCurrentNode(nodeId);
                          setShowBookmarkDropdown(false);
                        }}
                        className={`block w-full text-left px-3 py-2 hover:bg-sky-light transition-colors text-xs ${
                          isCurrentNode ? 'bg-sky-accent font-semibold' : ''
                        }`}
                      >
                        {truncatedText || '<empty>'}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <button
            onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}
            className="px-2 py-1 rounded bg-sky-accent hover:bg-sky-light text-xs transition-colors"
          >
            −
          </button>
          <span className="text-xs text-gray-700">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom(Math.min(2, zoom + 0.1))}
            className="px-2 py-1 rounded bg-sky-accent hover:bg-sky-light text-xs transition-colors"
          >
            +
          </button>
        </div>
      </div>

      {/* Tree content */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-auto p-2"
        style={{ fontSize: `${zoom * 12}px` }}
      >
        <div style={{ display: 'inline-block', minWidth: '100%' }}>
          {renderNode(currentTree.rootId)}
        </div>
      </div>
    </div>
  );
};

export default Tree;
