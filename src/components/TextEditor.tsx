import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import Editor, { Monaco } from '@monaco-editor/react';
import { editor } from 'monaco-editor';
import { useStore } from '../store';
import { getBranchText, getCurrentNodeStartPosition } from '../utils/fileSystem';

interface TextEditorProps {
  fontFamily: string;
  fontSize: number;
}

export interface TextEditorHandle {
  showHelp: () => void;
  scrollToBottom: () => void;
  toggleGreyOutReadOnly: () => void;
}

const TextEditor = forwardRef<TextEditorHandle, TextEditorProps>(({ fontFamily, fontSize }, ref) => {
  const { currentTree, updateNodeText } = useStore();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const [text, setText] = useState('');
  const [readOnlyEndPosition, setReadOnlyEndPosition] = useState(0);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [greyOutReadOnly, setGreyOutReadOnly] = useState(true);
  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);
  const isWindows = !isMac && (typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('win'));
  const ctrlKeyLabel = isMac ? '⌃' : 'Ctrl';
  const shiftKeyLabel = isMac ? '⇧' : 'Shift';
  const altKeyLabel = isMac ? '⌥' : 'Alt';
  const backspaceLabel = isMac ? '⌫' : 'Backspace';

  // Platform-specific keybinding labels
  const newNodeLabel = isWindows ? `${altKeyLabel} N` : `${ctrlKeyLabel} N`;
  const mergeLabel = isWindows ? `${altKeyLabel} M` : `${ctrlKeyLabel} M`;
  const massMergeLabel = isWindows ? `${altKeyLabel} ${shiftKeyLabel} M` : `${ctrlKeyLabel} ${shiftKeyLabel} M`;
  const expandLabel = isWindows ? `${altKeyLabel} Enter` : `${ctrlKeyLabel} Space`;
  const ctrlSpaceRuleRef = useRef<(() => void) | null>(null);
  const readOnlyDecorationsRef = useRef<string[]>([]);
  const lastValidTextRef = useRef<string>('');

  // Expose showHelp, scrollToBottom, and toggleGreyOutReadOnly methods to parent
  useImperativeHandle(ref, () => ({
    showHelp: () => setShowHelpModal(true),
    scrollToBottom: () => {
      if (editorRef.current) {
        const model = editorRef.current.getModel();
        if (model) {
          const lineCount = model.getLineCount();
          editorRef.current.revealLine(lineCount);
          editorRef.current.setScrollTop(editorRef.current.getScrollHeight());
        }
      }
    },
    toggleGreyOutReadOnly: () => setGreyOutReadOnly((prev) => !prev),
  }));

  useEffect(() => {
    return () => {
      ctrlSpaceRuleRef.current?.();
      ctrlSpaceRuleRef.current = null;
    };
  }, []);

  // Update text when current node changes
  useEffect(() => {
    if (!currentTree) {
      setText('');
      setReadOnlyEndPosition(0);
      lastValidTextRef.current = '';
      return;
    }

    const branchText = getBranchText(currentTree, currentTree.currentNodeId);
    const startPos = getCurrentNodeStartPosition(currentTree, currentTree.currentNodeId);

    setText(branchText);
    setReadOnlyEndPosition(startPos);
    lastValidTextRef.current = branchText;
  }, [currentTree?.currentNodeId, currentTree?.nodes]);

  const handleEditorDidMount = (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Set up read-only regions
    updateReadOnlyDecorations();

    // Register custom keybindings directly with Monaco to override defaults
    // This prevents Monaco's built-in keybindings from interfering

    // Note: Monaco uses KeyMod and KeyCode constants
    // KeyMod.WinCtrl maps to the Control key on every platform (⌃ on macOS)
    const { KeyMod, KeyCode } = monaco;

    // Platform-specific keybindings
    // Mac: Ctrl+N, Ctrl+M, Ctrl+Space (Monaco commands work fine)
    // Windows: Alt+N, Alt+M, Alt+Enter (Monaco Ctrl commands don't fire reliably on Windows)
    const isWindows = !isMac && (typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('win'));

    const newNodeKey = isWindows ? (KeyMod.Alt | KeyCode.KeyN) : (KeyMod.WinCtrl | KeyCode.KeyN);
    const mergeKey = isWindows ? (KeyMod.Alt | KeyCode.KeyM) : (KeyMod.WinCtrl | KeyCode.KeyM);
    const expandKey = isWindows ? (KeyMod.Alt | KeyCode.Enter) : (KeyMod.WinCtrl | KeyCode.Space);
    const bookmarkKey = isWindows ? (KeyMod.Alt | KeyCode.KeyB) : (KeyMod.WinCtrl | KeyCode.KeyB);

    // Create new child
    editor.addCommand(newNodeKey, () => {
      const state = useStore.getState();
      const tree = state.currentTree;
      if (!tree) return;
      const node = tree.nodes.get(tree.currentNodeId);
      if (!node || node.locked) return;

      const model = editor.getModel();
      const position = editor.getPosition();
      let handled = false;

      if (model && position) {
        const absoluteOffset = model.getOffsetAt(position);
        const nodeStartOffset = getCurrentNodeStartPosition(tree, node.id);
        const relativeOffset = absoluteOffset - nodeStartOffset;

        if (relativeOffset >= 0 && relativeOffset < node.text.length) {
          const splitResult = state.splitNodeAt(node.id, relativeOffset, { requireUnlockedChildren: true });
          if (splitResult) {
            handled = true;
          } else {
            handled = true;
          }
        }
      }

      if (handled) {
        return;
      }

      const newChildId = state.addNode(node.id, '');
      if (newChildId) {
        state.setCurrentNode(newChildId);
      }
    });

    // Merge with parent
    editor.addCommand(mergeKey, () => {
      const state = useStore.getState();
      const tree = state.currentTree;
      if (!tree) return;
      const node = tree.nodes.get(tree.currentNodeId);
      if (!node || node.locked || node.id === tree.rootId) return;

      state.mergeWithParent(node.id);
    });

    // Mass merge single children upwards
    // Windows: Alt+Shift+M, Mac: Ctrl+Shift+M
    const massMergeKey = isWindows ? (KeyMod.Alt | KeyMod.Shift | KeyCode.KeyM) : (KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KeyM);
    editor.addCommand(massMergeKey, () => {
      const state = useStore.getState();
      const tree = state.currentTree;
      if (!tree) return;
      state.massMerge();
    });

    // Expand node: override Monaco's default behavior
    // On Mac, override Ctrl+Space (trigger suggest)
    // On Windows, Ctrl+Enter shouldn't conflict with anything
    if (!isWindows) {
      // Only need to remove Ctrl+Space binding on Mac
      ctrlSpaceRuleRef.current?.();
      const ctrlSpaceRuleDisposable = monaco.editor.addKeybindingRule({
        keybinding: KeyMod.WinCtrl | KeyCode.Space,
        command: null,
        when: null,
      });
      ctrlSpaceRuleRef.current = () => ctrlSpaceRuleDisposable.dispose();
    }

    // Add our custom command for expand
    editor.addCommand(expandKey, async () => {
      const state = useStore.getState();
      const tree = state.currentTree;
      if (!tree) return;
      const node = tree.nodes.get(tree.currentNodeId);
      if (!node || node.locked) return;

      // Capture expand decision IMMEDIATELY, before async operations
      // Don't capture if we're on the root node
      if (node.id !== tree.rootId) {
        state.captureDecision('expand', node.id);
        state.markNodeExpanded(node.id);
      }

      if (!state.settings.apiKey) {
        alert('Please set your OpenRouter API key in Settings');
        return;
      }

      try {
        const { expandNode, runCopilotOnNode } = await import('../utils/agents');
        const childIds = await expandNode(
          tree,
          node.id,
          state.settings.continuations.branchingFactor,
          state.settings.apiKey,
          state.settings,
          (id) => state.lockNode(id, 'expanding'),
          state.unlockNode,
          state.addNode
        );

        const latestState = useStore.getState();
        if (childIds.length > 0 && latestState.currentTree?.currentNodeId === node.id) {
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
                state.settings.apiKey,
                state.settings,
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
    });

    // Note: Ctrl + X for agent invocation is handled in useKeybindings hook
    // to access the scoutInvokeMode state properly

    // Alt/Option + Arrow keys for navigation
    // Note: These might still conflict with Monaco, so we'll keep window listeners as fallback

    // Alt + Left: Navigate to parent
    editor.addCommand(KeyMod.Alt | KeyCode.LeftArrow, () => {
      const state = useStore.getState();
      const tree = state.currentTree;
      if (!tree) return;
      const node = tree.nodes.get(tree.currentNodeId);
      if (!node || !node.parentId) return;
      state.setCurrentNode(node.parentId);
    });

    // Alt + Right: Navigate to first child
    editor.addCommand(KeyMod.Alt | KeyCode.RightArrow, () => {
      const state = useStore.getState();
      const tree = state.currentTree;
      if (!tree) return;
      const node = tree.nodes.get(tree.currentNodeId);
      if (!node || node.childIds.length === 0) return;
      state.setCurrentNode(node.childIds[0]);
    });

    // Alt + Up: Navigate to upper sibling
    editor.addCommand(KeyMod.Alt | KeyCode.UpArrow, () => {
      const state = useStore.getState();
      const tree = state.currentTree;
      if (!tree) return;
      const node = tree.nodes.get(tree.currentNodeId);
      if (!node || !node.parentId) return;

      const parent = tree.nodes.get(node.parentId);
      if (!parent) return;

      const siblings = parent.childIds;
      const currentIndex = siblings.indexOf(node.id);
      if (siblings.length === 0) return;

      if (currentIndex > 0) {
        state.setCurrentNode(siblings[currentIndex - 1]);
      } else {
        state.setCurrentNode(siblings[siblings.length - 1]);
      }
    });

    // Alt + Down: Navigate to lower sibling
    editor.addCommand(KeyMod.Alt | KeyCode.DownArrow, () => {
      const state = useStore.getState();
      const tree = state.currentTree;
      if (!tree) return;
      const node = tree.nodes.get(tree.currentNodeId);
      if (!node || !node.parentId) return;

      const parent = tree.nodes.get(node.parentId);
      if (!parent) return;

      const siblings = parent.childIds;
      const currentIndex = siblings.indexOf(node.id);
      if (siblings.length === 0) return;

      if (currentIndex < siblings.length - 1) {
        state.setCurrentNode(siblings[currentIndex + 1]);
      } else {
        state.setCurrentNode(siblings[0]);
      }
    });

    // Alt + Backspace: Delete node
    editor.addCommand(KeyMod.Alt | KeyCode.Backspace, () => {
      const state = useStore.getState();
      const tree = state.currentTree;
      if (!tree) return;
      const node = tree.nodes.get(tree.currentNodeId);
      if (!node || node.locked || node.id === tree.rootId) return;
      if (node.childIds.length > 0) {
        state.setCurrentNode(node.childIds[0]);
      } else {
        // Check if parent is locked before capturing cull decision
        const parent = tree.nodes.get(node.parentId!);
        const parentIsLocked = parent && parent.locked &&
          parent.lockReason !== 'witness-active' &&
          parent.lockReason !== 'copilot-deciding' &&
          parent.lockReason !== 'trident-active';

        // Only capture cull decision if the node can actually be culled
        if (!parentIsLocked && parent) {
          state.captureDecision('cull', node.id);
        }
        state.deleteNode(node.id);
      }
    });

    // Bookmark toggle: Ctrl+B (Mac) / Alt+B (Windows)
    editor.addCommand(bookmarkKey, () => {
      const state = useStore.getState();
      const tree = state.currentTree;
      if (!tree) return;
      state.toggleBookmark(tree.currentNodeId);
    });

    // Navigate to previous bookmark: Option+Shift+Up (Mac) / Alt+Shift+Up (Windows)
    const prevBookmarkKey = KeyMod.Alt | KeyMod.Shift | KeyCode.UpArrow;
    editor.addCommand(prevBookmarkKey, () => {
      const state = useStore.getState();
      const tree = state.currentTree;
      if (!tree) return;
      const nextBookmarkId = state.getNextBookmarkedNode(tree.currentNodeId, 'up');
      if (nextBookmarkId) {
        state.setCurrentNode(nextBookmarkId);
      }
    });

    // Navigate to next bookmark: Option+Shift+Down (Mac) / Alt+Shift+Down (Windows)
    const nextBookmarkKey = KeyMod.Alt | KeyMod.Shift | KeyCode.DownArrow;
    editor.addCommand(nextBookmarkKey, () => {
      const state = useStore.getState();
      const tree = state.currentTree;
      if (!tree) return;
      const nextBookmarkId = state.getNextBookmarkedNode(tree.currentNodeId, 'down');
      if (nextBookmarkId) {
        state.setCurrentNode(nextBookmarkId);
      }
    });

    // Navigate to bookmark up in hierarchy: Option+Shift+Left (Mac) / Alt+Shift+Left (Windows)
    const leftBookmarkKey = KeyMod.Alt | KeyMod.Shift | KeyCode.LeftArrow;
    editor.addCommand(leftBookmarkKey, () => {
      const state = useStore.getState();
      const tree = state.currentTree;
      if (!tree) return;
      const nextBookmarkId = state.getNextBookmarkedNodeWithHierarchy(tree.currentNodeId, 'left');
      if (nextBookmarkId) {
        state.setCurrentNode(nextBookmarkId);
      }
    });

    // Navigate to bookmark down in hierarchy: Option+Shift+Right (Mac) / Alt+Shift+Right (Windows)
    const rightBookmarkKey = KeyMod.Alt | KeyMod.Shift | KeyCode.RightArrow;
    editor.addCommand(rightBookmarkKey, () => {
      const state = useStore.getState();
      const tree = state.currentTree;
      if (!tree) return;
      const nextBookmarkId = state.getNextBookmarkedNodeWithHierarchy(tree.currentNodeId, 'right');
      if (nextBookmarkId) {
        state.setCurrentNode(nextBookmarkId);
      }
    });

    // Toggle grey out read-only text: Ctrl+. (Mac) / Alt+. (Windows)
    const toggleGreyKey = isWindows ? (KeyMod.Alt | KeyCode.Period) : (KeyMod.WinCtrl | KeyCode.Period);
    editor.addCommand(toggleGreyKey, () => {
      setGreyOutReadOnly((prev) => !prev);
    });
  };

  const clearReadOnlyDecorations = () => {
    if (!editorRef.current || readOnlyDecorationsRef.current.length === 0) return;
    readOnlyDecorationsRef.current = editorRef.current.deltaDecorations(
      readOnlyDecorationsRef.current,
      []
    );
  };

  const updateReadOnlyDecorations = () => {
    if (!editorRef.current || !monacoRef.current || !currentTree) {
      clearReadOnlyDecorations();
      return;
    }

    const model = editorRef.current.getModel();
    if (!model) {
      clearReadOnlyDecorations();
      return;
    }

    const currentNode = currentTree.nodes.get(currentTree.currentNodeId);
    if (!currentNode) {
      clearReadOnlyDecorations();
      return;
    }

    if (readOnlyEndPosition <= 0) {
      clearReadOnlyDecorations();
      return;
    }

    // Calculate line/column for read-only boundary
    const readOnlyText = text.substring(0, readOnlyEndPosition);
    const lines = readOnlyText.split('\n');
    const endLine = lines.length;
    const endColumn = lines[lines.length - 1].length + 1;

    readOnlyDecorationsRef.current = editorRef.current.deltaDecorations(
      readOnlyDecorationsRef.current,
      [
        {
          range: new monacoRef.current.Range(1, 1, endLine, endColumn),
          options: {
            isWholeLine: false,
            className: 'read-only-line',
            inlineClassName: 'read-only-inline',
          },
        },
      ]
    );
  };

  useEffect(() => {
    updateReadOnlyDecorations();
  }, [text, readOnlyEndPosition, currentTree?.currentNodeId]);

  const handleEditorChange = (value: string | undefined) => {
    if (value === undefined || !currentTree) return;

    const currentNode = currentTree.nodes.get(currentTree.currentNodeId);
    if (!currentNode || currentNode.locked) return;

    // Only update if the change is in the editable region
    // Use ref instead of state to avoid stale closure issues with rapid typing
    const readOnlyPart = value.substring(0, readOnlyEndPosition);
    const originalReadOnlyPart = lastValidTextRef.current.substring(0, readOnlyEndPosition);

    if (readOnlyPart === originalReadOnlyPart) {
      const newNodeText = value.substring(readOnlyEndPosition);
      setText(value);
      lastValidTextRef.current = value; // Update ref synchronously
      updateNodeText(currentTree.currentNodeId, newNodeText);
    }
  };

  const currentNode = currentTree?.nodes.get(currentTree.currentNodeId);
  const isLocked = currentNode?.locked || false;

  return (
    <>
      <div className="flex-1 overflow-hidden bg-white">
        <Editor
          height="100%"
          defaultLanguage="plaintext"
          value={text}
          onChange={handleEditorChange}
          onMount={handleEditorDidMount}
          options={{
            readOnly: isLocked,
            wordWrap: 'on',
            wrappingStrategy: 'advanced',
            disableMonospaceOptimizations: true,
            minimap: { enabled: false },
            lineNumbers: 'off',
            glyphMargin: false,
            folding: false,
            scrollBeyondLastLine: false,
            renderLineHighlight: 'none',
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            overviewRulerBorder: false,
            scrollbar: {
              vertical: 'auto',
              horizontal: 'auto',
            },
            fontFamily: fontFamily,
            fontSize: fontSize,
            // Add small top padding for visual breathing room
            padding: { top: 6, bottom: 6 },
            // Disable autocomplete and suggestions completely
            quickSuggestions: false,
            suggestOnTriggerCharacters: false,
            acceptSuggestionOnEnter: 'off',
            tabCompletion: 'off',
            wordBasedSuggestions: 'off',
            parameterHints: {
              enabled: false,
            },
            suggest: {
              showWords: false,
              showSnippets: false,
            },
            // Disable Ctrl+Space trigger for suggestions
            quickSuggestionsDelay: 0,
            // Disable all automatic highlighting features
            matchBrackets: 'never',
            selectionHighlight: false,
            occurrencesHighlight: 'off',
            links: false,
            renderValidationDecorations: 'off',
            // Disable bracket pair colorization and guides
            bracketPairColorization: {
              enabled: false,
            },
            guides: {
              bracketPairs: false,
              bracketPairsHorizontal: false,
              highlightActiveBracketPair: false,
              indentation: false,
              highlightActiveIndentation: false,
            },
            unicodeHighlight: {
              ambiguousCharacters: false,
              invisibleCharacters: false,
              includeComments: false,
              includeStrings: false,
            },
            renderControlCharacters: false,
            // Increase tokenization line length to prevent warning on long lines
            maxTokenizationLineLength: 100000,
          }}
          theme="vs-light"
        />
      </div>

      {/* Help Modal */}
      {showHelpModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setShowHelpModal(false)}
        >
          <div
            className="bg-sky-light p-6 rounded-xl shadow-2xl max-w-2xl w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-800">Keybindings</h2>
              <button
                onClick={() => setShowHelpModal(false)}
                className="px-3 py-1 rounded-lg bg-sky-dark text-white hover:bg-sky-medium transition-colors"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-lg">
                <h3 className="font-semibold text-gray-800 mb-2">Navigation</h3>
                <ul className="space-y-1 text-sm text-gray-700">
                  <li><kbd className="px-2 py-1 bg-gray-200 rounded text-xs">{`${altKeyLabel} ←`}</kbd> Navigate to parent</li>
                  <li><kbd className="px-2 py-1 bg-gray-200 rounded text-xs">{`${altKeyLabel} →`}</kbd> Navigate to first child</li>
                  <li><kbd className="px-2 py-1 bg-gray-200 rounded text-xs">{`${altKeyLabel} ↑`}</kbd> Navigate to upper sibling</li>
                  <li><kbd className="px-2 py-1 bg-gray-200 rounded text-xs">{`${altKeyLabel} ↓`}</kbd> Navigate to lower sibling</li>
                </ul>
              </div>

              <div className="bg-white p-4 rounded-lg">
                <h3 className="font-semibold text-gray-800 mb-2">Node Operations</h3>
                <ul className="space-y-1 text-sm text-gray-700">
                  <li><kbd className="px-2 py-1 bg-gray-200 rounded text-xs">{`${altKeyLabel} ${backspaceLabel}`}</kbd> Delete current node</li>
                  <li><kbd className="px-2 py-1 bg-gray-200 rounded text-xs">{massMergeLabel}</kbd> Mass merge single children</li>
                  <li><kbd className="px-2 py-1 bg-gray-200 rounded text-xs">{mergeLabel}</kbd> Merge with parent</li>
                  <li><kbd className="px-2 py-1 bg-gray-200 rounded text-xs">{newNodeLabel}</kbd> Create new child</li>
                </ul>
              </div>

              <div className="bg-white p-4 rounded-lg">
                <h3 className="font-semibold text-gray-800 mb-2">Generation</h3>
                <ul className="space-y-1 text-sm text-gray-700">
                  <li><kbd className="px-2 py-1 bg-gray-200 rounded text-xs">{expandLabel}</kbd> Expand node (generate continuations)</li>
                </ul>
              </div>

              <div className="bg-white p-4 rounded-lg">
                <h3 className="font-semibold text-gray-800 mb-2">Agents</h3>
                <ul className="space-y-1 text-sm text-gray-700">
                  <li><kbd className="px-2 py-1 bg-gray-200 rounded text-xs">{`${ctrlKeyLabel} X`}</kbd> Invoke agent (then press 1, 2, 3...)</li>
                </ul>
              </div>

              <div className="bg-white p-4 rounded-lg">
                <h3 className="font-semibold text-gray-800 mb-2">Bookmarks</h3>
                <ul className="space-y-1 text-sm text-gray-700">
                  <li><kbd className="px-2 py-1 bg-gray-200 rounded text-xs">{isWindows ? `${altKeyLabel} B` : `${ctrlKeyLabel} B`}</kbd> Toggle bookmark on current node</li>
                  <li><kbd className="px-2 py-1 bg-gray-200 rounded text-xs">{`${altKeyLabel} ${shiftKeyLabel} ↑`}</kbd> Navigate to previous bookmark</li>
                  <li><kbd className="px-2 py-1 bg-gray-200 rounded text-xs">{`${altKeyLabel} ${shiftKeyLabel} ↓`}</kbd> Navigate to next bookmark</li>
                  <li><kbd className="px-2 py-1 bg-gray-200 rounded text-xs">{`${altKeyLabel} ${shiftKeyLabel} ←`}</kbd> Navigate to ancestor bookmark</li>
                  <li><kbd className="px-2 py-1 bg-gray-200 rounded text-xs">{`${altKeyLabel} ${shiftKeyLabel} →`}</kbd> Navigate to descendant bookmark</li>
                </ul>
              </div>

              <div className="bg-white p-4 rounded-lg">
                <h3 className="font-semibold text-gray-800 mb-2">View</h3>
                <ul className="space-y-1 text-sm text-gray-700">
                  <li><kbd className="px-2 py-1 bg-gray-200 rounded text-xs">{isWindows ? `${altKeyLabel} .` : `${ctrlKeyLabel} .`}</kbd> Toggle grey out previous nodes</li>
                </ul>
              </div>
            </div>

            <div className="mt-4 p-3 bg-sky-accent rounded-lg text-sm text-gray-700">
              <p className="font-semibold mb-1">Note:</p>
              <p>
                {`${altKeyLabel} = ${isMac ? 'Option' : 'Alt'} key, ${ctrlKeyLabel} = Control key`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* CSS for read-only styling */}
      <style>{`
        .read-only-line {
          background-color: transparent;
        }
        .read-only-inline {
          color: ${greyOutReadOnly ? '#94a3b8' : 'inherit'}; /* text-slate-400 or normal */
        }
      `}</style>
    </>
  );
});

TextEditor.displayName = 'TextEditor';

export default TextEditor;
