import { useEffect, useState } from 'react';
import { useStore } from '../store';

export function useKeybindings(scrollToBottom?: () => void, toggleGreyOutReadOnly?: () => void) {
  const {
    currentTree,
    setCurrentNode,
    deleteNode,
    mergeWithParent,
    massMerge,
    addNode,
    lockNode,
    unlockNode,
    settings,
    toggleBookmark,
    scouts,
    requestScoutStart,
    getNextBookmarkedNode,
    getNextBookmarkedNodeWithHierarchy,
    captureDecision,
    markNodeExpanded,
  } = useStore();

  const [scoutInvokeMode, setScoutInvokeMode] = useState(false);

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (!currentTree) return;

      const currentNode = currentTree.nodes.get(currentTree.currentNodeId);
      if (!currentNode) return;

      // Helper to check for control modifier (Ctrl on all platforms, including macOS)
      const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);
      const primaryModifier = e.ctrlKey || (!isMac && e.metaKey);

      // Handle plain arrow keys (without modifiers) to scroll to bottom
      // Only trigger if not in editor or input field
      if (
        scrollToBottom &&
        (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
        !e.altKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.shiftKey
      ) {
        const target = e.target as HTMLElement;
        const isInEditor = target && target.closest('.monaco-editor');
        const isInInput = target && (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable
        );

        if (!isInEditor && !isInInput) {
          e.preventDefault();
          scrollToBottom();
          return;
        }
      }

      // alt+shift+up: navigate to previous bookmark
      if (e.altKey && e.shiftKey && e.key === 'ArrowUp' && !primaryModifier) {
        e.preventDefault();
        const nextBookmarkId = getNextBookmarkedNode(currentTree.currentNodeId, 'up');
        if (nextBookmarkId) {
          setCurrentNode(nextBookmarkId);
        }
      }

      // alt+shift+down: navigate to next bookmark
      else if (e.altKey && e.shiftKey && e.key === 'ArrowDown' && !primaryModifier) {
        e.preventDefault();
        const nextBookmarkId = getNextBookmarkedNode(currentTree.currentNodeId, 'down');
        if (nextBookmarkId) {
          setCurrentNode(nextBookmarkId);
        }
      }

      // alt+shift+left: navigate to ancestor bookmark
      else if (e.altKey && e.shiftKey && e.key === 'ArrowLeft' && !primaryModifier) {
        e.preventDefault();
        const nextBookmarkId = getNextBookmarkedNodeWithHierarchy(currentTree.currentNodeId, 'left');
        if (nextBookmarkId) {
          setCurrentNode(nextBookmarkId);
        }
      }

      // alt+shift+right: navigate to descendant bookmark
      else if (e.altKey && e.shiftKey && e.key === 'ArrowRight' && !primaryModifier) {
        e.preventDefault();
        const nextBookmarkId = getNextBookmarkedNodeWithHierarchy(currentTree.currentNodeId, 'right');
        if (nextBookmarkId) {
          setCurrentNode(nextBookmarkId);
        }
      }

      // opt+left: navigate to parent
      else if (e.altKey && e.key === 'ArrowLeft' && !primaryModifier && !e.shiftKey && currentNode.parentId) {
        e.preventDefault();
        setCurrentNode(currentNode.parentId);
      }

      // opt+right: navigate to first child
      else if (e.altKey && e.key === 'ArrowRight' && !primaryModifier && !e.shiftKey && currentNode.childIds.length > 0) {
        e.preventDefault();
        setCurrentNode(currentNode.childIds[0]);
      }

      // opt+up/down: navigate siblings
      else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && !primaryModifier && !e.shiftKey) {
        e.preventDefault();
        if (currentNode.parentId) {
          const parent = currentTree.nodes.get(currentNode.parentId);
          if (parent) {
            const siblings = parent.childIds;
            const currentIndex = siblings.indexOf(currentNode.id);
            if (siblings.length === 0) return;

            if (e.key === 'ArrowUp') {
              const targetIndex = currentIndex > 0 ? currentIndex - 1 : siblings.length - 1;
              setCurrentNode(siblings[targetIndex]);
            } else if (e.key === 'ArrowDown') {
              const targetIndex = currentIndex < siblings.length - 1 && currentIndex !== -1 ? currentIndex + 1 : 0;
              setCurrentNode(siblings[targetIndex]);
            }
          }
        }
      }

      // opt+delete: delete node
      else if (e.altKey && e.key === 'Backspace' && !primaryModifier) {
        e.preventDefault();
        if (currentNode.id !== currentTree.rootId && !currentNode.locked) {
          if (currentNode.childIds.length > 0) {
            setCurrentNode(currentNode.childIds[0]);
          } else {
            // Check if parent is locked before capturing cull decision
            const parent = currentTree.nodes.get(currentNode.parentId!);
            const parentIsLocked = parent && parent.locked &&
              parent.lockReason !== 'witness-active' &&
              parent.lockReason !== 'copilot-deciding' &&
              parent.lockReason !== 'trident-active';

            // Only capture cull decision if the node can actually be culled
            if (!parentIsLocked && parent) {
              captureDecision('cull', currentNode.id);
            }
            deleteNode(currentNode.id);
          }
        }
      }

      // alt+shift+m (Windows) or ctrl+shift+m (Mac): mass merge single children upwards
      else if (
        e.shiftKey &&
        e.key.toLowerCase() === 'm' &&
        ((isMac && e.ctrlKey && !e.altKey) || (!isMac && e.altKey && !e.ctrlKey))
      ) {
        e.preventDefault();
        massMerge();
      }

      // ctrl+m (Mac) / alt+m (Windows): merge with parent
      else if (
        !e.shiftKey &&
        e.key.toLowerCase() === 'm' &&
        ((isMac && primaryModifier && !e.altKey) || (!isMac && e.altKey && !primaryModifier))
      ) {
        e.preventDefault();
        if (currentNode.id !== currentTree.rootId && !currentNode.locked) {
          mergeWithParent(currentNode.id);
        }
      }

      // ctrl+b (Mac) / alt+b (Windows): toggle bookmark
      else if (
        !e.shiftKey &&
        e.key.toLowerCase() === 'b' &&
        ((isMac && primaryModifier && !e.altKey) || (!isMac && e.altKey && !primaryModifier))
      ) {
        e.preventDefault();
        toggleBookmark(currentTree.currentNodeId);
      }

      // ctrl+. (Mac) / alt+. (Windows): toggle grey out read-only text
      else if (
        !e.shiftKey &&
        e.key === '.' &&
        ((isMac && primaryModifier && !e.altKey) || (!isMac && e.altKey && !primaryModifier))
      ) {
        e.preventDefault();
        if (toggleGreyOutReadOnly) {
          toggleGreyOutReadOnly();
        }
      }

      // ctrl+n: create child
      else if (primaryModifier && e.key === 'n' && !e.altKey && !e.shiftKey) {
        const target = e.target as HTMLElement | null;
        if (target && target.closest('.monaco-editor')) {
          return;
        }

        e.preventDefault();
        if (!currentNode.locked) {
          const newChildId = addNode(currentNode.id, '');
          setCurrentNode(newChildId);
        }
      }

      // ctrl+space (Mac) / alt+enter (Windows): expand node (generate continuations)
      else if (
        !e.shiftKey &&
        ((isMac && e.ctrlKey && e.key === ' ' && !e.altKey) ||
         (!isMac && e.altKey && e.key === 'Enter' && !e.ctrlKey))
      ) {
        e.preventDefault();
        if (!currentNode.locked) {
          // Capture expand decision IMMEDIATELY at keybind press, before any async operations
          // Don't capture if we're on the root node
          if (currentNode.id !== currentTree.rootId) {
            captureDecision('expand', currentNode.id);
            markNodeExpanded(currentNode.id);
          }

          (async () => {
            if (!settings.apiKey) {
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
                // Automatically focus the first generated child when the user stayed on the parent
                latestState.setCurrentNode(childIds[0]);
              }

              // Run copilot on newly created children if enabled
              const currentCopilot = latestState.copilot;
              if (currentCopilot.enabled && childIds.length > 0 && currentCopilot.instructions) {
                const freshTree = useStore.getState().currentTree;
                if (!freshTree) return;

                // Create getTree callback for Copilot
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
          })();
        }
      }

      // ctrl+x: invoke agent
      else if (primaryModifier && e.key === 'x' && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        setScoutInvokeMode(true);
      }

      // Handle agent selection (1, 2, 3, etc.)
      else if (scoutInvokeMode && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const buttonNumber = parseInt(e.key);
        const scout = scouts.find((s) => s.buttonNumber === buttonNumber);
        if (scout) {
          requestScoutStart(scout.id);
        } else {
          console.log(`No agent assigned to button ${buttonNumber}`);
        }
        setScoutInvokeMode(false);
      }

      // Escape: cancel agent invoke mode
      else if (e.key === 'Escape' && scoutInvokeMode) {
        e.preventDefault();
        setScoutInvokeMode(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    currentTree,
    setCurrentNode,
    deleteNode,
    mergeWithParent,
    massMerge,
    addNode,
    lockNode,
    unlockNode,
    settings,
    toggleBookmark,
    scouts,
    requestScoutStart,
    getNextBookmarkedNode,
    getNextBookmarkedNodeWithHierarchy,
    scoutInvokeMode,
    scrollToBottom,
    toggleGreyOutReadOnly,
    captureDecision,
  ]);

  return { scoutInvokeMode };
}
