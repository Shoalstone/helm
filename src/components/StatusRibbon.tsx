import React, { useState, useEffect, useRef } from 'react';
import { useStore, RibbonWindow } from '../store';
import { GraphContentHandle } from './modules/Graph';
import { getCurrentNodeStartPosition } from '../utils/fileSystem';
import { TextEditorHandle } from './TextEditor';

// Type definition for Local Font Access API
interface FontData {
  family: string;
  fullName: string;
  postscriptName: string;
  style: string;
}

declare global {
  interface Window {
    queryLocalFonts?: () => Promise<FontData[]>;
  }
}

// Fallback fonts if Local Font Access API isn't available
const FALLBACK_FONTS = [
  { name: 'Monospace (System Default)', value: "monospace" },
  { name: 'Consolas / Courier New', value: "'Consolas', 'Courier New', monospace" },
  { name: 'Menlo / Monaco', value: "'Menlo', 'Monaco', 'Courier New', monospace" },
  { name: 'System UI', value: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  { name: 'Arial / Helvetica', value: "'Arial', 'Helvetica', sans-serif" },
  { name: 'Verdana', value: "'Verdana', sans-serif" },
  { name: 'Georgia', value: "'Georgia', serif" },
  { name: 'Times New Roman', value: "'Times New Roman', 'Times', serif" },
];

const FONT_SIZES = [10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32];

interface StatusRibbonProps {
  fontFamily: string;
  setFontFamily: (family: string) => void;
  fontSize: number;
  setFontSize: (size: number) => void;
  onShowHelp: () => void;
  graphBottomRef: React.RefObject<GraphContentHandle>;
  textEditorRef: React.RefObject<TextEditorHandle>;
}

const RIBBON_WINDOWS: RibbonWindow[] = ['None', 'Help', 'Graph', 'Terminal'];

const StatusRibbon: React.FC<StatusRibbonProps> = ({
  fontFamily,
  setFontFamily,
  fontSize,
  setFontSize,
  onShowHelp,
  graphBottomRef,
  textEditorRef,
}) => {
  const {
    currentTree,
    ribbonWindow,
    setRibbonWindow,
    setCurrentNode,
    addNode,
    splitNodeAt,
    deleteNode,
    mergeWithParent,
    massMerge,
    toggleBookmark,
    lockNode,
    unlockNode,
    settings,
    captureDecision,
    markNodeExpanded,
  } = useStore();
  const [showFontDropdown, setShowFontDropdown] = useState(false);
  const [showSizeDropdown, setShowSizeDropdown] = useState(false);
  const [showWindowDropdown, setShowWindowDropdown] = useState(false);
  const [fontFamilies, setFontFamilies] = useState<{ name: string; value: string }[]>(FALLBACK_FONTS);
  const [isLoadingFonts, setIsLoadingFonts] = useState(true);
  const [commandsExpanded, setCommandsExpanded] = useState(false);
  const [showLeftGradient, setShowLeftGradient] = useState(false);
  const [showRightGradient, setShowRightGradient] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

  // Drag-to-scroll state
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const draggedRef = useRef(false);

  const currentNode = currentTree?.nodes.get(currentTree.currentNodeId);
  const isLocked = currentNode?.locked || false;
  const lockReason = currentNode?.lockReason || null;
  const lockReasonLabels: Record<string, string> = {
    expanding: 'Generating new continuations',
    'scout-active': 'Scout running',
    'witness-active': 'Witness deciding',
    'trident-active': 'Trident running',
    'copilot-deciding': 'Copilot deciding',
  };
  const lockReasonLabel = lockReason ? lockReasonLabels[lockReason] || lockReason : '';
  const currentFontName = fontFamilies.find(f => f.value === fontFamily)?.name || 'Menlo / Monaco';

  // Load available fonts from system
  useEffect(() => {
    const loadSystemFonts = async () => {
      try {
        if (!window.queryLocalFonts) {
          console.log('Local Font Access API not available, using fallback fonts');
          setIsLoadingFonts(false);
          return;
        }

        const fonts = await window.queryLocalFonts();
        const familySet = new Set<string>();
        fonts.forEach(font => familySet.add(font.family));
        const families = Array.from(familySet).sort();

        const fontList = families.map(family => ({
          name: family,
          value: `'${family}'`,
        }));

        console.log(`Loaded ${fontList.length} system fonts`);
        setFontFamilies(fontList);
        setIsLoadingFonts(false);
      } catch (error) {
        console.error('Failed to load system fonts:', error);
        console.log('Using fallback fonts');
        setIsLoadingFonts(false);
      }
    };

    loadSystemFonts();
  }, []);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.font-dropdown-container')) {
        setShowFontDropdown(false);
        setShowSizeDropdown(false);
        setShowWindowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Update scroll gradient visibility
  const updateScrollGradients = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollLeft, scrollWidth, clientWidth } = container;
    const maxScroll = scrollWidth - clientWidth;

    setShowLeftGradient(scrollLeft > 1); // Show left gradient if scrolled right
    setShowRightGradient(scrollLeft < maxScroll - 1); // Show right gradient if not at end
  };

  // Check scroll state when buttons expand or content changes
  useEffect(() => {
    if (commandsExpanded) {
      // Small delay to ensure content is rendered
      setTimeout(updateScrollGradients, 0);
    } else {
      setShowLeftGradient(false);
      setShowRightGradient(false);
    }
  }, [commandsExpanded]);

  // Drag-to-scroll handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Only handle left mouse button or touch
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    setIsDragging(true);
    setStartX(e.pageX - container.offsetLeft);
    setScrollLeft(container.scrollLeft);
    draggedRef.current = false; // Reset dragged flag
    container.style.cursor = 'grabbing';
    container.style.userSelect = 'none';

    // Prevent any default drag behavior
    e.preventDefault();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;

    const container = scrollContainerRef.current;
    if (!container) return;

    const x = e.pageX - container.offsetLeft;
    const walk = (x - startX) * 1.5; // Multiply for faster scroll

    // If moved more than a few pixels, consider it a drag
    if (Math.abs(walk) > 3) {
      e.preventDefault();
      draggedRef.current = true;
      container.scrollLeft = scrollLeft - walk;
    }
  };

  const handlePointerUp = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    setIsDragging(false);
    container.style.cursor = 'grab';
    container.style.userSelect = '';

    // Reset dragged flag after a short delay to prevent clicks
    if (draggedRef.current) {
      setTimeout(() => {
        draggedRef.current = false;
      }, 100);
    }
  };

  const handlePointerLeave = () => {
    if (isDragging) {
      handlePointerUp();
    }
  };

  // Helper to prevent button clicks during/after drag
  const handleButtonClick = (callback: () => void) => (e: React.MouseEvent) => {
    if (draggedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    callback();
  };

  // Command button handlers
  const handleGenerate = async () => {
    if (!currentTree) return;
    const currentNode = currentTree.nodes.get(currentTree.currentNodeId);
    if (!currentNode || currentNode.locked) return;

    // Capture expand decision IMMEDIATELY, before async operations
    if (currentNode.id !== currentTree.rootId) {
      captureDecision('expand', currentNode.id);
      markNodeExpanded(currentNode.id);
    }

    // Skip API key check for custom endpoints (e.g., local llama.cpp)
    if (!settings.continuations.useCustomEndpoint && !settings.apiKey) {
      alert('Please set your OpenRouter API key in Settings');
      return;
    }

    try {
      const { expandNode, runCopilotOnNode } = await import('../utils/agents');
      const childIds = await expandNode(
        currentTree,
        currentNode.id,
        settings.continuations.branchingFactor,
        settings.apiKey,
        settings,
        (id) => lockNode(id, 'expanding'),
        unlockNode,
        addNode
      );

      const latestState = useStore.getState();

      if (childIds.length > 0 && latestState.currentTree?.currentNodeId === currentNode.id) {
        latestState.setCurrentNode(childIds[0]);
      }

      // Run copilot on newly created children if enabled
      const currentCopilot = latestState.copilot;
      if (currentCopilot.enabled && childIds.length > 0 && currentCopilot.instructions) {
        const freshTree = useStore.getState().currentTree;
        if (!freshTree) return;

        const getTree = () => useStore.getState().currentTree!;

        for (const childId of childIds) {
          const store = useStore.getState();
          if (!store.copilot.enabled) break;

          try {
            await runCopilotOnNode(
              freshTree,
              childId,
              currentCopilot,
              settings.apiKey,
              settings,
              (id) => store.lockNode(id, 'copilot-deciding'),
              store.unlockNode,
              store.addNode,
              store.deleteNode,
              () => !useStore.getState().copilot.enabled,
              getTree,
              (output) => store.addCopilotOutput(output)
            );
          } catch (error) {
            console.error('Copilot error:', error);
          }
        }
      }
    } catch (error) {
      console.error('Expansion error:', error);
      alert('Failed to expand node. Check console for details.');
    }
  };

  const handleCull = () => {
    if (!currentTree) return;
    const currentNode = currentTree.nodes.get(currentTree.currentNodeId);
    if (!currentNode || currentNode.id === currentTree.rootId || currentNode.locked) return;

    if (currentNode.childIds.length > 0) {
      setCurrentNode(currentNode.childIds[0]);
    } else {
      const parent = currentTree.nodes.get(currentNode.parentId!);
      const parentIsLocked = parent && parent.locked &&
        parent.lockReason !== 'witness-active' &&
        parent.lockReason !== 'copilot-deciding' &&
        parent.lockReason !== 'trident-active';

      if (!parentIsLocked && parent) {
        captureDecision('cull', currentNode.id);
      }
      deleteNode(currentNode.id);
    }
  };

  const handleSplit = () => {
    if (!currentTree) return;
    const currentNode = currentTree.nodes.get(currentTree.currentNodeId);
    if (!currentNode || currentNode.locked) return;

    const editor = textEditorRef.current?.getEditorInstance?.();
    if (!editor) {
      const newChildId = addNode(currentNode.id, '');
      if (newChildId) {
        setCurrentNode(newChildId);
      }
      return;
    }

    const model = editor.getModel();
    const position = editor.getPosition();
    let handled = false;

    if (model && position) {
      const absoluteOffset = model.getOffsetAt(position);
      const nodeStartOffset = getCurrentNodeStartPosition(currentTree, currentNode.id);
      const relativeOffset = absoluteOffset - nodeStartOffset;

      if (relativeOffset >= 0 && relativeOffset < currentNode.text.length) {
        const splitResult = splitNodeAt(currentNode.id, relativeOffset, { requireUnlockedChildren: true });
        if (splitResult) {
          handled = true;
        } else {
          handled = true;
        }
      }
    }

    if (!handled) {
      const newChildId = addNode(currentNode.id, '');
      if (newChildId) {
        setCurrentNode(newChildId);
      }
    }
  };

  const handleMerge = () => {
    if (!currentTree) return;
    const currentNode = currentTree.nodes.get(currentTree.currentNodeId);
    if (!currentNode || currentNode.id === currentTree.rootId || currentNode.locked) return;

    mergeWithParent(currentNode.id);
  };

  const handleMass = () => {
    if (!currentTree) return;
    massMerge();
  };

  const handleMark = () => {
    if (!currentTree) return;
    toggleBookmark(currentTree.currentNodeId);
  };

  const handleTrail = () => {
    textEditorRef.current?.toggleGreyOutReadOnly();
  };

  return (
    <div className="h-8 bg-sky-medium flex items-center justify-between px-2 text-xs text-gray-800 relative">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {/* Command toggle button */}
        <button
          onClick={() => setCommandsExpanded(!commandsExpanded)}
          className="px-2 py-1 rounded bg-sky-accent hover:bg-sky-light text-xs transition-colors"
          title="Toggle command buttons"
        >
          ⌘
        </button>

        {/* Command buttons with fade gradients when expanded */}
        {commandsExpanded && (
          <div className="relative" style={{ width: '256px' }}>
            <div
              ref={scrollContainerRef}
              onScroll={updateScrollGradients}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerLeave}
              className="flex items-center gap-2 overflow-x-auto scrollbar-hide"
              style={{
                cursor: isDragging ? 'grabbing' : 'grab',
                touchAction: 'pan-x' // Only allow horizontal panning
              }}
            >
              <button
                onClick={handleButtonClick(handleGenerate)}
                disabled={isLocked}
                className="px-2 py-1 rounded bg-sky-accent hover:bg-sky-light text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                title={`Generate continuations (${isMac ? 'Ctrl+Space' : 'Alt+Enter'})`}
              >
                Generate
              </button>

              <button
                onClick={handleButtonClick(handleCull)}
                disabled={isLocked || !currentNode || currentNode.id === currentTree?.rootId}
                className="px-2 py-1 rounded bg-sky-accent hover:bg-sky-light text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                title="Cull node (Alt+Backspace)"
              >
                Cull
              </button>

              <button
                onClick={handleButtonClick(handleSplit)}
                disabled={isLocked}
                className="px-2 py-1 rounded bg-sky-accent hover:bg-sky-light text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                title={`Split at cursor or create new (${isMac ? 'Ctrl+N' : 'Alt+N'})`}
              >
                Split
              </button>

              <button
                onClick={handleButtonClick(handleMerge)}
                disabled={isLocked || !currentNode || currentNode.id === currentTree?.rootId}
                className="px-2 py-1 rounded bg-sky-accent hover:bg-sky-light text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                title={`Merge with parent (${isMac ? 'Ctrl+M' : 'Alt+M'})`}
              >
                Merge
              </button>

              <button
                onClick={handleButtonClick(handleMass)}
                disabled={!currentTree}
                className="px-2 py-1 rounded bg-sky-accent hover:bg-sky-light text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                title={`Mass merge single children (${isMac ? 'Ctrl+Shift+M' : 'Alt+Shift+M'})`}
              >
                Mass
              </button>

              <button
                onClick={handleButtonClick(handleMark)}
                disabled={!currentTree}
                className="px-2 py-1 rounded bg-sky-accent hover:bg-sky-light text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                title={`Toggle bookmark (${isMac ? 'Ctrl+B' : 'Alt+B'})`}
              >
                Mark
              </button>

              <button
                onClick={handleButtonClick(handleTrail)}
                className="px-2 py-1 rounded bg-sky-accent hover:bg-sky-light text-xs transition-colors whitespace-nowrap"
                title={`Toggle grey read-only text (${isMac ? 'Ctrl+.' : 'Alt+.'})`}
              >
                Trail
              </button>
            </div>
            {/* Fade gradients - opacity changes smoothly based on scroll position */}
            <div
              className="absolute left-0 top-0 bottom-0 w-4 pointer-events-none bg-gradient-to-r from-sky-medium to-transparent transition-opacity duration-75"
              style={{ opacity: showLeftGradient ? 1 : 0 }}
            />
            <div
              className="absolute right-0 top-0 bottom-0 w-4 pointer-events-none bg-gradient-to-l from-sky-medium to-transparent transition-opacity duration-75"
              style={{ opacity: showRightGradient ? 1 : 0 }}
            />
          </div>
        )}

        {/* Status indicator */}
        {isLocked && (
          <span className="px-2 py-1 rounded bg-sky-dark text-white whitespace-nowrap">
            🔒 {lockReasonLabel}
          </span>
        )}
        {!isLocked && <span className="text-gray-600">Ready</span>}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Graph zoom controls - only shown when Graph window is active */}
        {ribbonWindow === 'Graph' && (
          <>
            <button
              type="button"
              onClick={() => graphBottomRef.current?.zoomOut()}
              className="px-2 py-1 rounded bg-sky-accent hover:bg-sky-light text-xs transition-colors"
              aria-label="Zoom out"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => graphBottomRef.current?.zoomIn()}
              className="px-2 py-1 rounded bg-sky-accent hover:bg-sky-light text-xs transition-colors"
              aria-label="Zoom in"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => graphBottomRef.current?.resetZoom()}
              className="px-2 py-1 rounded bg-sky-accent hover:bg-sky-light text-xs transition-colors"
              aria-label="Reset zoom"
            >
              ↺
            </button>
          </>
        )}

        {/* Window selection dropdown */}
        <div className="relative font-dropdown-container">
          {showWindowDropdown && (
            <div className="absolute bottom-full right-0 mb-1 bg-white border border-sky-dark rounded shadow-lg z-50 min-w-[100px]">
              {RIBBON_WINDOWS.map((window) => (
                <button
                  key={window}
                  onClick={() => {
                    setRibbonWindow(window);
                    setShowWindowDropdown(false);
                  }}
                  className={`block w-full text-left px-3 py-2 hover:bg-sky-light transition-colors whitespace-nowrap ${
                    ribbonWindow === window ? 'bg-sky-accent' : ''
                  }`}
                >
                  {window}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => {
              setShowWindowDropdown(!showWindowDropdown);
              setShowFontDropdown(false);
              setShowSizeDropdown(false);
            }}
            className="px-2 py-1 rounded bg-sky-accent hover:bg-sky-light transition-colors"
            title="Select ribbon window"
          >
            {ribbonWindow}
          </button>
        </div>

        {/* Font family dropdown */}
        <div className="relative font-dropdown-container">
          {showFontDropdown && (
            <div className="absolute bottom-full right-0 mb-1 bg-white border border-sky-dark rounded shadow-lg max-h-64 overflow-y-auto z-50 min-w-[160px]">
              {isLoadingFonts ? (
                <div className="px-3 py-2 text-gray-600 text-xs">Loading fonts...</div>
              ) : (
                fontFamilies.map((font) => (
                  <button
                    key={font.value}
                    onClick={() => {
                      setFontFamily(font.value);
                      setShowFontDropdown(false);
                    }}
                    className={`block w-full text-left px-3 py-2 hover:bg-sky-light transition-colors whitespace-nowrap ${
                      fontFamily === font.value ? 'bg-sky-accent' : ''
                    }`}
                    style={{ fontFamily: font.value }}
                  >
                    {font.name}
                  </button>
                ))
              )}
            </div>
          )}
          <button
            onClick={() => {
              setShowFontDropdown(!showFontDropdown);
              setShowSizeDropdown(false);
              setShowWindowDropdown(false);
            }}
            className="px-2 py-1 rounded bg-sky-accent hover:bg-sky-light transition-colors"
            title="Select font family"
            disabled={isLoadingFonts}
          >
            {isLoadingFonts ? 'Loading...' : currentFontName}
          </button>
        </div>

        {/* Font size dropdown */}
        <div className="relative font-dropdown-container">
          {showSizeDropdown && (
            <div className="absolute bottom-full right-0 mb-1 bg-white border border-sky-dark rounded shadow-lg max-h-64 overflow-y-auto z-50 min-w-[80px]">
              {FONT_SIZES.map((size) => (
                <button
                  key={size}
                  onClick={() => {
                    setFontSize(size);
                    setShowSizeDropdown(false);
                  }}
                  className={`block w-full text-left px-3 py-2 hover:bg-sky-light transition-colors whitespace-nowrap ${
                    fontSize === size ? 'bg-sky-accent' : ''
                  }`}
                >
                  {size}px
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => {
              setShowSizeDropdown(!showSizeDropdown);
              setShowFontDropdown(false);
              setShowWindowDropdown(false);
            }}
            className="px-2 py-1 rounded bg-sky-accent hover:bg-sky-light transition-colors"
            title="Select font size"
          >
            {fontSize}px
          </button>
        </div>

        <button
          onClick={onShowHelp}
          className="px-2 py-1 rounded bg-sky-accent hover:bg-sky-light transition-colors"
          title="Click for keybindings help"
        >
          ?
        </button>
      </div>
    </div>
  );
};

export default StatusRibbon;
