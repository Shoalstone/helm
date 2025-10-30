import { create } from 'zustand';
import {
  Tree,
  TreeNode,
  ScoutConfig,
  CopilotConfig,
  Settings,
  PanelConfig,
  TuningConfig,
} from './types';
import { saveTree, loadTree, createNewTree, deleteTree as deleteTreeFromFS, renameTree as renameTreeFromFS, extractSubtree as extractSubtreeFromFS, getTreeListAsync } from './utils/fileSystem';

const SETTINGS_STORAGE_KEY = 'helm-settings';
const SCOUTS_STORAGE_KEY = 'helm-scouts';
const COPILOT_STORAGE_KEY = 'helm-copilot';
const UI_STATE_STORAGE_KEY = 'helm-ui-state';
const AUTOMATIC_BOOKMARK_STORAGE_KEY = 'helm-automatic-bookmark';
const CURRENT_TREE_STORAGE_KEY = 'helm-current-tree';
const TUNING_STORAGE_KEY = 'helm-tuning';
const TREE_SAVE_DEBOUNCE_MS = 500;
let treeSaveBeforeUnloadRegistered = false;

const DEFAULT_LEFT_PANEL: PanelConfig = {
  top: 'Agents',
  bottom: 'Copilot',
};

const DEFAULT_RIGHT_PANEL: PanelConfig = {
  top: 'Tree',
  bottom: 'Graph',
};

const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  continuations: {
    modelName: 'meta-llama/llama-3.1-405b',
    temperature: 1.0,
    topP: 1.0,
    maxTokens: 100,
    branchingFactor: 2,
    assistantMode: false,
    savedModels: [],
  },
  assistant: {
    modelName: 'openai/gpt-oss-20b',
    temperature: 1.0,
    topP: 1.0,
    maxTokens: 2000,
    savedModels: [],
  },
};

const loadSettings = (): Settings => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return { ...DEFAULT_SETTINGS };
  }

  try {
    const stored = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!stored) {
      return { ...DEFAULT_SETTINGS };
    }

    const parsed = JSON.parse(stored) as Partial<Settings>;

    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      continuations: {
        ...DEFAULT_SETTINGS.continuations,
        ...(parsed.continuations ?? {}),
      },
      assistant: {
        ...DEFAULT_SETTINGS.assistant,
        ...(parsed.assistant ?? {}),
      },
    };
  } catch (error) {
    console.error('Failed to load settings from storage', error);
    return { ...DEFAULT_SETTINGS };
  }
};

const persistSettings = (settings: Settings) => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save settings to storage', error);
  }
};

const loadScouts = (): ScoutConfig[] => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return [];
  }

  try {
    const stored = window.localStorage.getItem(SCOUTS_STORAGE_KEY);
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored) as Partial<ScoutConfig>[];
    // Mark all scouts as inactive on load since no operations survive a restart
    return parsed.map(scout => ({
      ...scout,
      type: scout.type ?? 'Scout',
      active: false,
      activeNodeId: null,
      campaignScoutInstructions: scout.campaignScoutInstructions ?? scout.instructions ?? '',
      campaignWitnessInstructions: scout.campaignWitnessInstructions ?? scout.instructions ?? '',
    })) as ScoutConfig[];
  } catch (error) {
    console.error('Failed to load scouts from storage', error);
    return [];
  }
};

const persistScouts = (scouts: ScoutConfig[]) => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(SCOUTS_STORAGE_KEY, JSON.stringify(scouts));
  } catch (error) {
    console.error('Failed to save scouts to storage', error);
  }
};

const DEFAULT_COPILOT: CopilotConfig = {
  enabled: false,
  expansionEnabled: false,
  instructions: 'Choose to expand nodes that are interesting, and cull nodes that are boring.',
  vision: 4,
  range: 2,
  depth: 2,
  outputs: [],
};

const loadCopilot = (): CopilotConfig => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return { ...DEFAULT_COPILOT };
  }

  try {
    const stored = window.localStorage.getItem(COPILOT_STORAGE_KEY);
    if (!stored) {
      return { ...DEFAULT_COPILOT };
    }

    const parsed = JSON.parse(stored) as Partial<CopilotConfig>;
    return {
      ...DEFAULT_COPILOT,
      ...parsed,
      // Disable copilot on load since no operations survive a restart
      enabled: false,
    };
  } catch (error) {
    console.error('Failed to load copilot from storage', error);
    return { ...DEFAULT_COPILOT };
  }
};

const persistCopilot = (copilot: CopilotConfig) => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(COPILOT_STORAGE_KEY, JSON.stringify(copilot));
  } catch (error) {
    console.error('Failed to save copilot to storage', error);
  }
};

export type RibbonWindow = 'None' | 'Help' | 'Graph';

interface UIState {
  bottomPanelHeight: number;
  ribbonWindow: RibbonWindow;
  leftPanel: PanelConfig;
  rightPanel: PanelConfig;
}

const DEFAULT_UI_STATE: UIState = {
  bottomPanelHeight: 50,
  ribbonWindow: 'Help',
  leftPanel: { ...DEFAULT_LEFT_PANEL },
  rightPanel: { ...DEFAULT_RIGHT_PANEL },
};

const loadUIState = (): UIState => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return { ...DEFAULT_UI_STATE };
  }

  try {
    const stored = window.localStorage.getItem(UI_STATE_STORAGE_KEY);
    if (!stored) {
      return { ...DEFAULT_UI_STATE };
    }

    const parsed = JSON.parse(stored) as Partial<UIState>;
    return {
      bottomPanelHeight: parsed.bottomPanelHeight ?? DEFAULT_UI_STATE.bottomPanelHeight,
      ribbonWindow: parsed.ribbonWindow ?? DEFAULT_UI_STATE.ribbonWindow,
      leftPanel: {
        ...DEFAULT_LEFT_PANEL,
        ...(parsed.leftPanel ?? {}),
      },
      rightPanel: {
        ...DEFAULT_RIGHT_PANEL,
        ...(parsed.rightPanel ?? {}),
      },
    };
  } catch (error) {
    console.error('Failed to load UI state from storage', error);
    return {
      bottomPanelHeight: DEFAULT_UI_STATE.bottomPanelHeight,
      ribbonWindow: DEFAULT_UI_STATE.ribbonWindow,
      leftPanel: { ...DEFAULT_LEFT_PANEL },
      rightPanel: { ...DEFAULT_RIGHT_PANEL },
    };
  }
};

const persistUIState = (uiState: UIState) => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(UI_STATE_STORAGE_KEY, JSON.stringify(uiState));
  } catch (error) {
    console.error('Failed to save UI state to storage', error);
  }
};

interface AutomaticBookmarkConfig {
  parentsToInclude: string;
  criteria: string;
}

const DEFAULT_AUTOMATIC_BOOKMARK_CONFIG: AutomaticBookmarkConfig = {
  parentsToInclude: '3',
  criteria: '',
};

const loadAutomaticBookmarkConfig = (): AutomaticBookmarkConfig => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return { ...DEFAULT_AUTOMATIC_BOOKMARK_CONFIG };
  }

  try {
    const stored = window.localStorage.getItem(AUTOMATIC_BOOKMARK_STORAGE_KEY);
    if (!stored) {
      return { ...DEFAULT_AUTOMATIC_BOOKMARK_CONFIG };
    }

    const parsed = JSON.parse(stored) as Partial<AutomaticBookmarkConfig>;
    return {
      ...DEFAULT_AUTOMATIC_BOOKMARK_CONFIG,
      ...parsed,
    };
  } catch (error) {
    console.error('Failed to load automatic bookmark config from storage', error);
    return { ...DEFAULT_AUTOMATIC_BOOKMARK_CONFIG };
  }
};

const persistAutomaticBookmarkConfig = (config: AutomaticBookmarkConfig) => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(AUTOMATIC_BOOKMARK_STORAGE_KEY, JSON.stringify(config));
  } catch (error) {
    console.error('Failed to save automatic bookmark config to storage', error);
  }
};

const loadCurrentTreeId = (): string | null => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(CURRENT_TREE_STORAGE_KEY);
    return stored || null;
  } catch (error) {
    console.error('Failed to load current tree id from storage', error);
    return null;
  }
};

const persistCurrentTreeId = (treeId: string | null) => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }

  try {
    if (!treeId) {
      window.localStorage.removeItem(CURRENT_TREE_STORAGE_KEY);
    } else {
      window.localStorage.setItem(CURRENT_TREE_STORAGE_KEY, treeId);
    }
  } catch (error) {
    console.error('Failed to save current tree id to storage', error);
  }
};

const DEFAULT_TUNING: TuningConfig = {
  captureDecisions: false,
  trainingData: [],
  externalDataSource: null,
  openaiApiKey: '',
  fineTunedModelName: '',
  fineTunes: [],
  uploadedFileId: null,
  uploadStatus: null,
  currentJobId: null,
  outputs: [],
  contextDepth: 4,
  epochs: 2,
  batchSize: 6,
  learningRate: 'auto',
};

const loadTuning = (): TuningConfig => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return { ...DEFAULT_TUNING };
  }

  try {
    const stored = window.localStorage.getItem(TUNING_STORAGE_KEY);
    if (!stored) {
      return { ...DEFAULT_TUNING };
    }

    const parsed = JSON.parse(stored) as Partial<TuningConfig>;
    return {
      ...DEFAULT_TUNING,
      ...parsed,
    };
  } catch (error) {
    console.error('Failed to load tuning from storage', error);
    return { ...DEFAULT_TUNING };
  }
};

const persistTuning = (tuning: TuningConfig) => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(TUNING_STORAGE_KEY, JSON.stringify(tuning));
  } catch (error) {
    console.error('Failed to save tuning to storage', error);
  }
};

interface AppState {
  // Tree state
  trees: string[];
  currentTree: Tree | null;

  // UI state
  leftPanel: PanelConfig;
  rightPanel: PanelConfig;
  bottomPanelHeight: number; // Height as percentage of available space below ribbon
  ribbonWindow: RibbonWindow; // Which window is displayed below the ribbon

  // Agent state
  scouts: ScoutConfig[];
  copilot: CopilotConfig;
  scoutStartRequest: string | null; // Scout ID to start

  // Settings
  settings: Settings;

  // Tuning
  tuning: TuningConfig;

  // Actions
  loadTreeList: () => Promise<void>;
  selectTree: (treeId: string) => Promise<void>;
  createTree: (name: string) => Promise<void>;
  renameTree: (newName: string) => Promise<void>;
  deleteTree: (treeId: string) => Promise<void>;
  extractSubtree: (name: string) => Promise<void>;
  setCurrentNode: (nodeId: string) => void;
  updateNodeText: (nodeId: string, text: string) => void;
  lockNode: (
    nodeId: string,
    reason: 'expanding' | 'scout-active' | 'witness-active' | 'copilot-deciding' | 'trident-active'
  ) => boolean;
  unlockNode: (nodeId: string) => void;
  addNode: (parentId: string, text: string) => string;
  splitNodeAt: (nodeId: string, splitIndex: number, options?: { requireUnlockedChildren?: boolean }) => string | null;
  deleteNode: (nodeId: string) => void;
  mergeWithParent: (nodeId: string) => void;
  massMerge: () => void;
  cullAndMergeToBookmarks: () => void;
  updateSettings: (settings: Partial<Settings>) => void;
  updatePanels: (side: 'left' | 'right', config: Partial<PanelConfig>) => void;
  setBottomPanelHeight: (height: number) => void;
  setRibbonWindow: (window: RibbonWindow) => void;

  // Scout actions
  addScout: (scout: ScoutConfig) => void;
  updateScout: (scoutId: string, updates: Partial<ScoutConfig>) => void;
  deleteScout: (scoutId: string) => void;
  addScoutOutput: (scoutId: string, output: string) => void;
  requestScoutStart: (scoutId: string) => void;
  clearScoutStartRequest: () => void;

  // Copilot actions
  updateCopilot: (updates: Partial<CopilotConfig>) => void;
  addCopilotOutput: (output: string) => void;

  // Bookmark actions
  toggleBookmark: (nodeId: string) => void;
  getNextBookmarkedNode: (currentNodeId: string, direction: 'up' | 'down') => string | null;
  getNextBookmarkedNodeWithHierarchy: (currentNodeId: string, direction: 'left' | 'right') => string | null;

  // Automatic bookmark config
  automaticBookmarkConfig: AutomaticBookmarkConfig;
  updateAutomaticBookmarkConfig: (updates: Partial<AutomaticBookmarkConfig>) => void;

  // Tuning actions
  updateTuning: (updates: Partial<TuningConfig>) => void;
  addTuningOutput: (output: string) => void;
  captureDecision: (decision: 'expand' | 'cull', nodeId?: string) => void;
}

export const useStore = create<AppState>((set, get) => {
  const uiState = loadUIState();
  const persistedAutomaticBookmarkConfig = loadAutomaticBookmarkConfig();
  const storedTreeId = loadCurrentTreeId();
  let treeSaveTimeout: ReturnType<typeof setTimeout> | null = null;

  const performTreeSave = () => {
    const tree = get().currentTree;
    if (tree) {
      saveTree(tree);
    }
  };

  const flushTreeSave = () => {
    if (treeSaveTimeout) {
      clearTimeout(treeSaveTimeout);
      treeSaveTimeout = null;
    }
    performTreeSave();
  };

  const scheduleTreeSave = () => {
    if (treeSaveTimeout) {
      clearTimeout(treeSaveTimeout);
    }
    treeSaveTimeout = setTimeout(() => {
      performTreeSave();
      treeSaveTimeout = null;
    }, TREE_SAVE_DEBOUNCE_MS);
  };

  if (typeof window !== 'undefined' && !treeSaveBeforeUnloadRegistered) {
    window.addEventListener('beforeunload', () => {
      flushTreeSave();
    });
    treeSaveBeforeUnloadRegistered = true;
  }

  const persistCurrentUIState = (overrides?: Partial<UIState>) => {
    const state = get();
    persistUIState({
      bottomPanelHeight: overrides?.bottomPanelHeight ?? state.bottomPanelHeight,
      ribbonWindow: overrides?.ribbonWindow ?? state.ribbonWindow,
      leftPanel: overrides?.leftPanel ?? state.leftPanel,
      rightPanel: overrides?.rightPanel ?? state.rightPanel,
    });
  };

  // Load the tree list on initialization
  getTreeListAsync()
    .then((treeList) => {
      set({ trees: treeList });
    })
    .catch((error) => {
      console.error('Failed to load tree list', error);
    });

  if (storedTreeId) {
    loadTree(storedTreeId)
      .then((tree) => {
        // Keep the saved currentNodeId instead of resetting to root
        set({ currentTree: tree });
      })
      .catch((error) => {
        console.error(`Failed to load stored tree ${storedTreeId}`, error);
        persistCurrentTreeId(null);
      });
  }

  return {
    trees: [],
    currentTree: null,

    leftPanel: uiState.leftPanel,
    rightPanel: uiState.rightPanel,

    bottomPanelHeight: uiState.bottomPanelHeight,
    ribbonWindow: uiState.ribbonWindow,

    scouts: loadScouts(),

    copilot: loadCopilot(),

    scoutStartRequest: null,

    settings: loadSettings(),

    automaticBookmarkConfig: persistedAutomaticBookmarkConfig,

    tuning: loadTuning(),

  loadTreeList: async () => {
    const treeList = await getTreeListAsync();
    set({ trees: treeList });
  },

  selectTree: async (treeId: string) => {
    flushTreeSave();
    try {
      const tree = await loadTree(treeId);
      // Keep the saved currentNodeId instead of resetting to root
      set({ currentTree: tree });
      persistCurrentTreeId(treeId);
    } catch (error) {
      console.error(`Failed to select tree ${treeId}`, error);
      set({ currentTree: null });
      persistCurrentTreeId(null);
    } finally {
      flushTreeSave();
    }
  },

  createTree: async (name: string) => {
    flushTreeSave();
    const tree = await createNewTree(name);
    const trees = get().trees;
    set({ trees: [...trees, tree.id], currentTree: tree });
    persistCurrentTreeId(tree.id);
  },

  renameTree: async (newName: string) => {
    const currentTree = get().currentTree;
    if (!currentTree) {
      throw new Error('No tree selected');
    }

    const oldTreeId = currentTree.id;
    flushTreeSave();
    const renamedTree = await renameTreeFromFS(oldTreeId, newName);

    // Update the trees list
    const trees = get().trees.map(id => id === oldTreeId ? renamedTree.id : id);

    set({ trees, currentTree: renamedTree });
    persistCurrentTreeId(renamedTree.id);
  },

  deleteTree: async (treeId: string) => {
    await deleteTreeFromFS(treeId);
    const trees = get().trees.filter(id => id !== treeId);
    const currentTree = get().currentTree;

    // If we deleted the current tree, clear it
    if (currentTree?.id === treeId) {
      set({ trees, currentTree: null });
      persistCurrentTreeId(null);
    } else {
      set({ trees });
    }
  },

  extractSubtree: async (name: string) => {
    const currentTree = get().currentTree;
    if (!currentTree) {
      throw new Error('No tree selected');
    }

    const newTree = await extractSubtreeFromFS(currentTree, currentTree.currentNodeId, name);
    const trees = get().trees;
    set({ trees: [...trees, newTree.id] });
  },

  setCurrentNode: (nodeId: string) => {
    const tree = get().currentTree;
    if (!tree) return;

    set({
      currentTree: {
        ...tree,
        nodes: new Map(tree.nodes),
        currentNodeId: nodeId,
      },
    });

    flushTreeSave();
  },

  updateNodeText: (nodeId: string, text: string) => {
    const tree = get().currentTree;
    if (!tree) return;

    const node = tree.nodes.get(nodeId);
    if (!node || node.locked) return;

    node.text = text;
    tree.nodes.set(nodeId, node);

    set({ currentTree: { ...tree, nodes: new Map(tree.nodes) } });
    scheduleTreeSave();
  },

  lockNode: (
    nodeId: string,
    reason: 'expanding' | 'scout-active' | 'witness-active' | 'copilot-deciding' | 'trident-active'
  ) => {
    const tree = get().currentTree;
    if (!tree) return false;

    const node = tree.nodes.get(nodeId);
    if (!node) return false;

    // Don't overwrite locks from other agents
    if (node.locked && node.lockReason !== reason) {
      console.warn(`[Lock Conflict] Cannot lock node ${nodeId.substring(0, 16)} with ${reason} - already locked with ${node.lockReason}`);
      return false;
    }

    // Already locked for the same reason - treat as success
    if (node.locked) {
      return true;
    }

    node.locked = true;
    node.lockReason = reason;
    tree.nodes.set(nodeId, node);

    set({ currentTree: { ...tree, nodes: new Map(tree.nodes) } });
    return true;
  },

  unlockNode: (nodeId: string) => {
    const tree = get().currentTree;
    if (!tree) return;

    const node = tree.nodes.get(nodeId);
    if (!node) return;

    node.locked = false;
    node.lockReason = undefined;
    tree.nodes.set(nodeId, node);

    set({ currentTree: { ...tree, nodes: new Map(tree.nodes) } });
  },

  addNode: (parentId: string, text: string) => {
    const tree = get().currentTree;
    if (!tree) return '';

    const parent = tree.nodes.get(parentId);
    if (!parent) return '';

    if (
      parent.locked &&
      parent.lockReason !== 'expanding' &&
      parent.lockReason !== 'scout-active' &&
      parent.lockReason !== 'witness-active' &&
      parent.lockReason !== 'copilot-deciding' &&
      parent.lockReason !== 'trident-active'
    ) {
      return '';
    }

    const nodeId = `node_${crypto.randomUUID()}`;
    const newNode: TreeNode = {
      id: nodeId,
      text,
      parentId,
      childIds: [],
      locked: false,
    };

    parent.childIds.push(nodeId);
    tree.nodes.set(nodeId, newNode);
    tree.nodes.set(parentId, parent);

    set({ currentTree: { ...tree, nodes: new Map(tree.nodes) } });
    flushTreeSave();

    return nodeId;
  },

  splitNodeAt: (nodeId: string, splitIndex: number, options) => {
    const tree = get().currentTree;
    if (!tree) return null;

    const node = tree.nodes.get(nodeId);
    if (!node) return null;

    if (node.locked || splitIndex < 0 || splitIndex > node.text.length) {
      return null;
    }

    const requireUnlockedChildren = options?.requireUnlockedChildren ?? false;
    const originalChildren = [...node.childIds];

    if (requireUnlockedChildren) {
      for (const childId of originalChildren) {
        const child = tree.nodes.get(childId);
        if (child?.locked) {
          return null;
        }
      }
    }

    const textBefore = node.text.slice(0, splitIndex);
    const textAfter = node.text.slice(splitIndex);

    const newChildId = `node_${crypto.randomUUID()}`;
    const newChild: TreeNode = {
      id: newChildId,
      text: textAfter,
      parentId: nodeId,
      childIds: originalChildren,
      locked: false,
    };

    node.text = textBefore;
    node.childIds = [newChildId];
    tree.nodes.set(nodeId, node);

    for (const childId of originalChildren) {
      const child = tree.nodes.get(childId);
      if (!child) continue;
      child.parentId = newChildId;
      tree.nodes.set(childId, child);
    }

    tree.nodes.set(newChildId, newChild);

    set({
      currentTree: {
        ...tree,
        nodes: new Map(tree.nodes),
      },
    });
    flushTreeSave();

    return newChildId;
  },

  deleteNode: (nodeId: string) => {
    const tree = get().currentTree;
    if (!tree || nodeId === tree.rootId) return;

    const node = tree.nodes.get(nodeId);
    if (!node || (node.locked && node.lockReason !== 'witness-active' && node.lockReason !== 'copilot-deciding' && node.lockReason !== 'trident-active')) return;

    const parent = tree.nodes.get(node.parentId!);
    if (!parent || (parent.locked && parent.lockReason !== 'witness-active' && parent.lockReason !== 'copilot-deciding' && parent.lockReason !== 'trident-active')) return;

    // Don't delete if the node is bookmarked (bookmarked nodes are anchors)
    const nodeIsBookmarked = tree.bookmarkedNodeIds.includes(nodeId);
    if (nodeIsBookmarked) {
      return;
    }

    // Get the index before removing from parent's children
    const deletedIndex = parent.childIds.indexOf(nodeId);

    // Remove from parent's children
    parent.childIds = parent.childIds.filter(id => id !== nodeId);
    tree.nodes.set(node.parentId!, parent);

    // Collect all node IDs that will be deleted (for bookmark cleanup)
    const deletedNodeIds = new Set<string>();
    const collectDeletedIds = (id: string) => {
      deletedNodeIds.add(id);
      const n = tree.nodes.get(id);
      if (n) {
        n.childIds.forEach(collectDeletedIds);
      }
    };
    collectDeletedIds(nodeId);

    // Recursively delete all children
    const deleteRecursive = (id: string) => {
      const n = tree.nodes.get(id);
      if (!n) return;
      n.childIds.forEach(deleteRecursive);
      tree.nodes.delete(id);
    };
    deleteRecursive(nodeId);

    // Remove deleted nodes from bookmarks
    const updatedBookmarks = tree.bookmarkedNodeIds.filter(id => !deletedNodeIds.has(id));
    tree.bookmarkedNodeIds = updatedBookmarks;

    // Navigate to sibling or parent (only if deleted node was current)
    let newCurrentId = tree.currentNodeId;
    if (tree.currentNodeId === nodeId) {
      const siblings = parent.childIds; // Already filtered
      if (deletedIndex > 0 && siblings.length >= deletedIndex) {
        // Navigate to previous sibling
        newCurrentId = siblings[deletedIndex - 1];
      } else if (siblings.length > 0) {
        // Navigate to first remaining sibling
        newCurrentId = siblings[0];
      } else {
        // Navigate to parent if no siblings remain
        newCurrentId = node.parentId!;
      }
    }

    set({
      currentTree: {
        ...tree,
        nodes: new Map(tree.nodes),
        currentNodeId: newCurrentId,
        bookmarkedNodeIds: updatedBookmarks,
      }
    });
    flushTreeSave();
  },

  mergeWithParent: (nodeId: string) => {
    const tree = get().currentTree;
    if (!tree || nodeId === tree.rootId) return;

    const node = tree.nodes.get(nodeId);
    if (!node || (node.locked && node.lockReason !== 'witness-active')) return;

    const parent = tree.nodes.get(node.parentId!);
    if (!parent || (parent.locked && parent.lockReason !== 'witness-active')) return;

    const siblingIds = parent.childIds.filter(id => id !== nodeId && tree.nodes.has(id));
    if (siblingIds.length > 0) {
      return;
    }

    // Don't merge if the node is bookmarked (bookmarked nodes are anchors)
    const nodeIsBookmarked = tree.bookmarkedNodeIds.includes(nodeId);
    if (nodeIsBookmarked) {
      return;
    }

    // Append node text to parent (no trimming!)
    parent.text = parent.text + node.text;

    // Move children to parent
    parent.childIds = parent.childIds.filter(id => id !== nodeId).concat(node.childIds);

    // Update children's parent reference
    node.childIds.forEach(childId => {
      const child = tree.nodes.get(childId);
      if (child) {
        child.parentId = parent.id;
        tree.nodes.set(childId, child);
      }
    });

    tree.nodes.set(parent.id, parent);
    tree.nodes.delete(nodeId);

    // Remove merged node from bookmarks
    const updatedBookmarks = tree.bookmarkedNodeIds.filter(id => id !== nodeId);
    tree.bookmarkedNodeIds = updatedBookmarks;

    // Only switch to parent if the merged node was the current node
    const newCurrentId = tree.currentNodeId === nodeId ? parent.id : tree.currentNodeId;
    set({
      currentTree: {
        ...tree,
        nodes: new Map(tree.nodes),
        currentNodeId: newCurrentId,
        bookmarkedNodeIds: updatedBookmarks,
      }
    });
    flushTreeSave();
  },

  massMerge: () => {
    const tree = get().currentTree;
    if (!tree) return;

    const rootId = tree.rootId;
    const nodesWithDepth: { id: string; depth: number }[] = [];
    const bookmarkedSet = new Set(tree.bookmarkedNodeIds);

    const traverse = (nodeId: string, depth: number) => {
      const node = tree.nodes.get(nodeId);
      if (!node) return;
      nodesWithDepth.push({ id: nodeId, depth });
      node.childIds.forEach(childId => traverse(childId, depth + 1));
    };

    traverse(rootId, 0);
    nodesWithDepth.sort((a, b) => b.depth - a.depth);

    let currentNodeId = tree.currentNodeId;
    let mergedAny = false;
    const deletedBookmarkIds = new Set<string>();

    for (const { id } of nodesWithDepth) {
      if (id === rootId || !tree.nodes.has(id)) {
        continue;
      }

      const node = tree.nodes.get(id);
      if (!node || (node.locked && node.lockReason !== 'witness-active')) {
        continue;
      }

      const parent = node.parentId ? tree.nodes.get(node.parentId) : null;
      if (!parent || (parent.locked && parent.lockReason !== 'witness-active')) {
        continue;
      }

      const siblingIds = parent.childIds.filter(childId => childId !== id && tree.nodes.has(childId));
      if (siblingIds.length > 0) {
        continue;
      }

      // Don't merge if the child is bookmarked (bookmarked nodes are anchors)
      const nodeIsBookmarked = bookmarkedSet.has(id);
      if (nodeIsBookmarked) {
        continue;
      }

      parent.text = parent.text + node.text;
      parent.childIds = parent.childIds.filter(childId => childId !== id);
      node.childIds.forEach(childId => {
        const child = tree.nodes.get(childId);
        if (child) {
          child.parentId = parent.id;
          tree.nodes.set(childId, child);
          parent.childIds.push(childId);
        }
      });

      tree.nodes.set(parent.id, parent);
      tree.nodes.delete(id);
      deletedBookmarkIds.add(id);

      if (currentNodeId === id) {
        currentNodeId = parent.id;
      }

      mergedAny = true;
    }

    if (!mergedAny) {
      return;
    }

    if (deletedBookmarkIds.size > 0) {
      const updatedBookmarks = tree.bookmarkedNodeIds.filter(id => !deletedBookmarkIds.has(id));
      tree.bookmarkedNodeIds = updatedBookmarks;
    }

    set({
      currentTree: {
        ...tree,
        nodes: new Map(tree.nodes),
        currentNodeId,
        bookmarkedNodeIds: tree.bookmarkedNodeIds,
      }
    });
    flushTreeSave();
  },

  cullAndMergeToBookmarks: () => {
    const tree = get().currentTree;
    if (!tree || tree.bookmarkedNodeIds.length === 0) return;

    const bookmarkedSet = new Set(tree.bookmarkedNodeIds);
    const nodesToKeep = new Set<string>();

    // Add all bookmarked nodes
    bookmarkedSet.forEach(id => nodesToKeep.add(id));

    // Add all ancestors of bookmarked nodes
    bookmarkedSet.forEach(bookmarkId => {
      let currentId: string | null = bookmarkId;
      while (currentId) {
        nodesToKeep.add(currentId);
        const node = tree.nodes.get(currentId);
        if (!node) break;
        currentId = node.parentId;
      }
    });

    // Check if a subtree contains any bookmarks
    const hasBookmarkInSubtree = (nodeId: string): boolean => {
      if (bookmarkedSet.has(nodeId)) return true;
      const node = tree.nodes.get(nodeId);
      if (!node) return false;
      return node.childIds.some(childId => hasBookmarkInSubtree(childId));
    };

    // Add descendants of bookmarked nodes with special logic
    const addDescendantsOfBookmark = (bookmarkId: string) => {
      const node = tree.nodes.get(bookmarkId);
      if (!node) return;

      // Check if this bookmark's subtree contains other bookmarks
      const hasNestedBookmarks = node.childIds.some(childId => hasBookmarkInSubtree(childId));

      if (!hasNestedBookmarks) {
        // No nested bookmarks: keep ALL descendants
        const addAllDescendants = (nodeId: string) => {
          nodesToKeep.add(nodeId);
          const n = tree.nodes.get(nodeId);
          if (!n) return;
          n.childIds.forEach(childId => addAllDescendants(childId));
        };
        node.childIds.forEach(childId => addAllDescendants(childId));
      } else {
        // Has nested bookmarks: only keep paths to those bookmarks
        const addPathsToBookmarks = (nodeId: string) => {
          const n = tree.nodes.get(nodeId);
          if (!n) return;

          // If this node or its subtree has bookmarks, keep it and continue
          if (hasBookmarkInSubtree(nodeId)) {
            nodesToKeep.add(nodeId);
            n.childIds.forEach(childId => addPathsToBookmarks(childId));
          }
          // Otherwise, don't keep this branch
        };
        node.childIds.forEach(childId => addPathsToBookmarks(childId));
      }
    };

    bookmarkedSet.forEach(bookmarkId => addDescendantsOfBookmark(bookmarkId));

    // Delete all nodes not in nodesToKeep
    const nodesToDelete: string[] = [];
    tree.nodes.forEach((_node, nodeId) => {
      if (!nodesToKeep.has(nodeId)) {
        nodesToDelete.push(nodeId);
      }
    });

    // Remove deleted nodes from their parents' childIds
    nodesToDelete.forEach(nodeId => {
      const node = tree.nodes.get(nodeId);
      if (!node || !node.parentId) return;

      const parent = tree.nodes.get(node.parentId);
      if (parent) {
        parent.childIds = parent.childIds.filter(id => id !== nodeId);
        tree.nodes.set(node.parentId, parent);
      }
    });

    // Delete the nodes
    nodesToDelete.forEach(nodeId => {
      tree.nodes.delete(nodeId);
    });

    // Now perform custom mass merge that respects bookmark boundaries
    const rootId = tree.rootId;
    const nodesWithDepth: { id: string; depth: number }[] = [];

    const traverse = (nodeId: string, depth: number) => {
      const node = tree.nodes.get(nodeId);
      if (!node) return;
      nodesWithDepth.push({ id: nodeId, depth });
      node.childIds.forEach(childId => traverse(childId, depth + 1));
    };

    traverse(rootId, 0);
    nodesWithDepth.sort((a, b) => b.depth - a.depth);

    let currentNodeId = tree.currentNodeId;
    const updatedBookmarks = new Set(tree.bookmarkedNodeIds);

    for (const { id } of nodesWithDepth) {
      if (id === rootId || !tree.nodes.has(id)) {
        continue;
      }

      const node = tree.nodes.get(id);
      if (!node || node.locked) {
        continue;
      }

      const parent = node.parentId ? tree.nodes.get(node.parentId) : null;
      if (!parent || parent.locked) {
        continue;
      }

      // Check if node has siblings
      const siblingIds = parent.childIds.filter(childId => childId !== id && tree.nodes.has(childId));
      if (siblingIds.length > 0) {
        continue;
      }

      // Don't merge if the child is bookmarked (bookmarked nodes are anchors)
      const nodeIsBookmarked = updatedBookmarks.has(id);
      if (nodeIsBookmarked) {
        continue;
      }

      // Merge node into parent
      parent.text = parent.text + node.text;
      parent.childIds = parent.childIds.filter(childId => childId !== id);
      node.childIds.forEach(childId => {
        const child = tree.nodes.get(childId);
        if (child) {
          child.parentId = parent.id;
          tree.nodes.set(childId, child);
          parent.childIds.push(childId);
        }
      });

      tree.nodes.set(parent.id, parent);
      tree.nodes.delete(id);

      if (currentNodeId === id) {
        currentNodeId = parent.id;
      }
    }

    // Update current node if it was deleted
    if (!tree.nodes.has(currentNodeId)) {
      currentNodeId = tree.rootId;
    }

    set({
      currentTree: {
        ...tree,
        nodes: new Map(tree.nodes),
        currentNodeId,
        bookmarkedNodeIds: Array.from(updatedBookmarks),
      }
    });
    flushTreeSave();
  },

  updateSettings: (newSettings: Partial<Settings>) => {
    const settings = get().settings;
    const merged: Settings = {
      ...settings,
      ...newSettings,
      continuations: {
        ...settings.continuations,
        ...(newSettings.continuations ?? {}),
      },
      assistant: {
        ...settings.assistant,
        ...(newSettings.assistant ?? {}),
      },
    };

    set({ settings: merged });
    persistSettings(merged);
  },

  updatePanels: (side: 'left' | 'right', config: Partial<PanelConfig>) => {
    const panel = side === 'left' ? get().leftPanel : get().rightPanel;
    const updated = { ...panel, ...config };

    if (side === 'left') {
      set({ leftPanel: updated });
      persistCurrentUIState({ leftPanel: updated });
    } else {
      set({ rightPanel: updated });
      persistCurrentUIState({ rightPanel: updated });
    }
  },

  setBottomPanelHeight: (height: number) => {
    const newHeight = Math.max(0, Math.min(90, height));
    set({ bottomPanelHeight: newHeight });
    persistCurrentUIState({ bottomPanelHeight: newHeight });
  },

  setRibbonWindow: (window: RibbonWindow) => {
    set({ ribbonWindow: window });
    persistCurrentUIState({ ribbonWindow: window });
  },

  addScout: (scout: ScoutConfig) => {
    const scouts = get().scouts;
    const updated = [...scouts, scout];
    set({ scouts: updated });
    persistScouts(updated);
  },

  updateScout: (scoutId: string, updates: Partial<ScoutConfig>) => {
    const scouts = get().scouts;
    const updated = scouts.map((s) => (s.id === scoutId ? { ...s, ...updates } : s));
    set({ scouts: updated });
    persistScouts(updated);
  },

  deleteScout: (scoutId: string) => {
    const scouts = get().scouts;
    const updated = scouts.filter((s) => s.id !== scoutId);
    set({ scouts: updated });
    persistScouts(updated);
  },

  addScoutOutput: (scoutId: string, output: string) => {
    const scouts = get().scouts;
    const updated = scouts.map((s) =>
      s.id === scoutId ? { ...s, outputs: [...s.outputs, output] } : s
    );
    set({ scouts: updated });
    persistScouts(updated);
  },

  requestScoutStart: (scoutId: string) => {
    set({ scoutStartRequest: scoutId });
  },

  clearScoutStartRequest: () => {
    set({ scoutStartRequest: null });
  },

  updateCopilot: (updates: Partial<CopilotConfig>) => {
    const copilot = get().copilot;
    const updated = { ...copilot, ...updates };
    set({ copilot: updated });
    persistCopilot(updated);
  },

  addCopilotOutput: (output: string) => {
    const copilot = get().copilot;
    const updated = { ...copilot, outputs: [...copilot.outputs, output] };
    set({ copilot: updated });
    persistCopilot(updated);
  },

  toggleBookmark: (nodeId: string) => {
    const tree = get().currentTree;
    if (!tree) return;

    const bookmarkedNodeIds = [...tree.bookmarkedNodeIds];
    const index = bookmarkedNodeIds.indexOf(nodeId);

    if (index >= 0) {
      // Remove bookmark
      bookmarkedNodeIds.splice(index, 1);
    } else {
      // Add bookmark
      bookmarkedNodeIds.push(nodeId);
    }

    const updatedTree = {
      ...tree,
      nodes: new Map(tree.nodes),
      bookmarkedNodeIds,
    };

    set({ currentTree: updatedTree });
    flushTreeSave();
  },

  getNextBookmarkedNode: (currentNodeId: string, direction: 'up' | 'down') => {
    const tree = get().currentTree;
    if (!tree || tree.bookmarkedNodeIds.length === 0) return null;

    const bookmarkedNodeIds = tree.bookmarkedNodeIds;
    const currentIndex = bookmarkedNodeIds.indexOf(currentNodeId);

    if (currentIndex >= 0) {
      // Current node is bookmarked, navigate to next/previous bookmark
      if (direction === 'down') {
        const nextIndex = (currentIndex + 1) % bookmarkedNodeIds.length;
        return bookmarkedNodeIds[nextIndex];
      } else {
        const prevIndex = (currentIndex - 1 + bookmarkedNodeIds.length) % bookmarkedNodeIds.length;
        return bookmarkedNodeIds[prevIndex];
      }
    } else {
      // Current node is not bookmarked, find nearest bookmark
      // For simplicity, navigate to the first bookmark
      return bookmarkedNodeIds[0];
    }
  },

  getNextBookmarkedNodeWithHierarchy: (currentNodeId: string, direction: 'left' | 'right') => {
    const tree = get().currentTree;
    if (!tree || tree.bookmarkedNodeIds.length === 0) return null;

    const bookmarkedNodeIds = tree.bookmarkedNodeIds;

    // Helper function to check if targetId is a descendant of ancestorId
    const isDescendant = (ancestorId: string, targetId: string): boolean => {
      let currentId: string | null = targetId;
      while (currentId) {
        const node = tree.nodes.get(currentId);
        if (!node) return false;
        if (node.parentId === ancestorId) return true;
        if (currentId === ancestorId) return false;
        currentId = node.parentId;
      }
      return false;
    };

    // Helper function to check if targetId is an ancestor of descendantId
    const isAncestor = (targetId: string, descendantId: string): boolean => {
      return isDescendant(targetId, descendantId);
    };

    // Helper function to get depth of a node from current node
    const getDepthFromCurrent = (nodeId: string): number => {
      let depth = 0;
      let currentId: string | null = nodeId;
      while (currentId && currentId !== currentNodeId) {
        const node = tree.nodes.get(currentId);
        if (!node || !node.parentId) return Infinity;
        currentId = node.parentId;
        depth++;
      }
      return currentId === currentNodeId ? depth : Infinity;
    };

    if (direction === 'right') {
      // Prefer descendants (down in hierarchy)
      const descendants = bookmarkedNodeIds.filter(id => isDescendant(currentNodeId, id));
      if (descendants.length > 0) {
        // Find the closest descendant (minimum depth)
        let closestId = descendants[0];
        let minDepth = getDepthFromCurrent(closestId);
        for (const id of descendants) {
          const depth = getDepthFromCurrent(id);
          if (depth < minDepth) {
            minDepth = depth;
            closestId = id;
          }
        }
        return closestId;
      }
      // No descendants, cycle to next bookmark
      const currentIndex = bookmarkedNodeIds.indexOf(currentNodeId);
      if (currentIndex >= 0) {
        const nextIndex = (currentIndex + 1) % bookmarkedNodeIds.length;
        return bookmarkedNodeIds[nextIndex];
      }
      // Current node not bookmarked, return first bookmark
      return bookmarkedNodeIds[0];
    } else {
      // direction === 'left', prefer ancestors (up in hierarchy)
      const ancestors = bookmarkedNodeIds.filter(id => isAncestor(id, currentNodeId));
      if (ancestors.length > 0) {
        // Find the closest ancestor (the one that is most nested, i.e., nearest parent)
        // This means finding the ancestor with the maximum depth from root
        let closestId = ancestors[0];
        let maxDepth = -1;

        for (const id of ancestors) {
          // Calculate depth from root
          let depth = 0;
          let currentId: string | null = id;
          while (currentId) {
            const node = tree.nodes.get(currentId);
            if (!node || !node.parentId) break;
            currentId = node.parentId;
            depth++;
          }

          if (depth > maxDepth) {
            maxDepth = depth;
            closestId = id;
          }
        }
        return closestId;
      }
      // No ancestors, cycle to previous bookmark
      const currentIndex = bookmarkedNodeIds.indexOf(currentNodeId);
      if (currentIndex >= 0) {
        const prevIndex = (currentIndex - 1 + bookmarkedNodeIds.length) % bookmarkedNodeIds.length;
        return bookmarkedNodeIds[prevIndex];
      }
      // Current node not bookmarked, return first bookmark
      return bookmarkedNodeIds[0];
    }
  },

  updateAutomaticBookmarkConfig: (updates: Partial<AutomaticBookmarkConfig>) => {
    const current = get().automaticBookmarkConfig;
    const updated = { ...current, ...updates };
    set({ automaticBookmarkConfig: updated });
    persistAutomaticBookmarkConfig(updated);
  },

  updateTuning: (updates: Partial<TuningConfig>) => {
    const tuning = get().tuning;
    const updated = { ...tuning, ...updates };
    set({ tuning: updated });
    persistTuning(updated);
  },

  addTuningOutput: (output: string) => {
    const tuning = get().tuning;
    const updated = { ...tuning, outputs: [...tuning.outputs, output] };
    set({ tuning: updated });
    persistTuning(updated);
  },

  captureDecision: (decision: 'expand' | 'cull', nodeId?: string) => {
    const state = get();
    const tuning = state.tuning;
    const tree = state.currentTree;

    if (!tuning.captureDecisions || !tree) {
      return;
    }

    // Use provided nodeId or fall back to current node
    const targetNodeId = nodeId || tree.currentNodeId;
    const targetNode = tree.nodes.get(targetNodeId);
    if (!targetNode) {
      return;
    }

    // Build context from parent nodes, limited by contextDepth
    const contextNodes: string[] = [];
    let parentId = targetNode.parentId;
    let depth = 0;
    while (parentId && depth < tuning.contextDepth) {
      const parentNode = tree.nodes.get(parentId);
      if (parentNode) {
        contextNodes.unshift(parentNode.text);
        parentId = parentNode.parentId;
        depth++;
      } else {
        break;
      }
    }

    const context = contextNodes.join('');
    const trainingEntry = {
      context,
      currentNode: targetNode.text,
      decision,
    };

    // Update tuning state with new training data and output in one operation
    const updated = {
      ...tuning,
      trainingData: [...tuning.trainingData, trainingEntry],
      outputs: [...tuning.outputs, `Captured ${decision} decision`],
    };

    set({ tuning: updated });
    persistTuning(updated);
  },
  };
});
