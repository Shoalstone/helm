import { Tree, TreeNode } from '../types';

// Check if we're in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI;

// LocalStorage key prefix for browser mode
const LOCALSTORAGE_TREES_KEY = 'helm-trees';
const LOCALSTORAGE_TREE_PREFIX = 'helm-tree-';

// Get the trees directory path
async function getTreesDir(): Promise<string> {
  if (!isElectron) {
    throw new Error('File system not available');
  }
  const userDataPath = await window.electronAPI.getUserDataPath();
  return window.electronAPI.joinPath(userDataPath, 'trees');
}

// Ensure trees directory exists
export async function ensureTreesDirectory() {
  if (!isElectron) return;

  const treesDir = await getTreesDir();
  const exists = await window.electronAPI.exists(treesDir);
  if (!exists) {
    await window.electronAPI.mkdir(treesDir);
  }
}

// Get list of all tree IDs
export async function getTreeListAsync(): Promise<string[]> {
  if (!isElectron) {
    // Use localStorage in browser mode
    try {
      const stored = localStorage.getItem(LOCALSTORAGE_TREES_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error reading tree list from localStorage:', error);
      return [];
    }
  }

  await ensureTreesDirectory();
  const treesDir = await getTreesDir();

  try {
    const files = await window.electronAPI.readDir(treesDir);
    const directories: string[] = [];

    for (const file of files) {
      const treePath = await window.electronAPI.joinPath(treesDir, file);
      const stat = await window.electronAPI.stat(treePath);
      if (stat.isDirectory) {
        directories.push(file);
      }
    }

    return directories;
  } catch (error) {
    console.error('Error reading trees directory:', error);
    return [];
  }
}

// Load a tree from disk
export async function loadTree(treeId: string): Promise<Tree> {
  if (!isElectron) {
    // Use localStorage in browser mode
    try {
      const key = LOCALSTORAGE_TREE_PREFIX + treeId;
      const data = localStorage.getItem(key);
      if (!data) {
        throw new Error(`Tree "${treeId}" not found`);
      }
      const parsed = JSON.parse(data);

      // Convert nodes array to Map
      const nodesMap = new Map<string, TreeNode>();
      parsed.nodes.forEach((node: TreeNode) => {
        // Unlock all nodes on load since no operations survive a restart
        node.locked = false;
        node.lockReason = undefined;
        nodesMap.set(node.id, node);
      });

      return {
        ...parsed,
        nodes: nodesMap,
        bookmarkedNodeIds: parsed.bookmarkedNodeIds || [],
      };
    } catch (error) {
      console.error('Error loading tree from localStorage:', error);
      throw error;
    }
  }

  const treesDir = await getTreesDir();
  const treePath = await window.electronAPI.joinPath(treesDir, treeId, 'tree.json');

  try {
    const data = await window.electronAPI.readFile(treePath);
    const parsed = JSON.parse(data);

    // Convert nodes array to Map
    const nodesMap = new Map<string, TreeNode>();
    parsed.nodes.forEach((node: TreeNode) => {
      // Unlock all nodes on load since no operations survive a restart
      node.locked = false;
      node.lockReason = undefined;
      nodesMap.set(node.id, node);
    });

    return {
      ...parsed,
      nodes: nodesMap,
      bookmarkedNodeIds: parsed.bookmarkedNodeIds || [], // Default to empty array if not present
    };
  } catch (error) {
    console.error('Error loading tree:', error);
    throw error;
  }
}

// Save a tree to disk
export async function saveTree(tree: Tree) {
  if (!isElectron) {
    // Use localStorage in browser mode
    try {
      const key = LOCALSTORAGE_TREE_PREFIX + tree.id;
      const nodesArray = Array.from(tree.nodes.values());
      const data = JSON.stringify({
        ...tree,
        nodes: nodesArray,
      });
      localStorage.setItem(key, data);
    } catch (error) {
      console.error('Error saving tree to localStorage:', error);
    }
    return;
  }

  const treesDir = await getTreesDir();
  const treePath = await window.electronAPI.joinPath(treesDir, tree.id);

  try {
    const exists = await window.electronAPI.exists(treePath);
    if (!exists) {
      await window.electronAPI.mkdir(treePath);
    }

    // Convert Map to array for JSON serialization
    const nodesArray = Array.from(tree.nodes.values());

    const data = JSON.stringify(
      {
        ...tree,
        nodes: nodesArray,
      },
      null,
      2
    );

    const treeFilePath = await window.electronAPI.joinPath(treePath, 'tree.json');
    await window.electronAPI.writeFile(treeFilePath, data);
  } catch (error) {
    console.error('Error saving tree:', error);
  }
}

// Create a new tree
export async function createNewTree(name: string): Promise<Tree> {
  const treeId = name.trim();

  if (!isElectron) {
    // Use localStorage in browser mode
    try {
      // Get existing tree list
      const treeList = await getTreeListAsync();

      // Check if tree already exists
      if (treeList.includes(treeId)) {
        throw new Error(`A tree named "${name}" already exists`);
      }

      const rootId = `node_${crypto.randomUUID()}`;

      const rootNode: TreeNode = {
        id: rootId,
        text: '',
        parentId: null,
        childIds: [],
        locked: false,
      };

      const tree: Tree = {
        id: treeId,
        name,
        nodes: new Map([[rootId, rootNode]]),
        rootId,
        currentNodeId: rootId,
        bookmarkedNodeIds: [],
      };

      // Save the tree
      await saveTree(tree);

      // Update the tree list
      const updatedTreeList = [...treeList, treeId];
      localStorage.setItem(LOCALSTORAGE_TREES_KEY, JSON.stringify(updatedTreeList));

      return tree;
    } catch (error) {
      console.error('Error creating tree in localStorage:', error);
      throw error;
    }
  }

  // Check if tree already exists
  await ensureTreesDirectory();
  const treesDir = await getTreesDir();
  const treePath = await window.electronAPI.joinPath(treesDir, treeId);
  const exists = await window.electronAPI.exists(treePath);

  if (exists) {
    throw new Error(`A tree named "${name}" already exists`);
  }

  const rootId = `node_${crypto.randomUUID()}`;

  const rootNode: TreeNode = {
    id: rootId,
    text: '',
    parentId: null,
    childIds: [],
    locked: false,
  };

  const tree: Tree = {
    id: treeId,
    name,
    nodes: new Map([[rootId, rootNode]]),
    rootId,
    currentNodeId: rootId,
    bookmarkedNodeIds: [],
  };

  await saveTree(tree);
  return tree;
}

// Delete a tree
export async function deleteTree(treeId: string): Promise<void> {
  if (!isElectron) {
    // Use localStorage in browser mode
    try {
      const key = LOCALSTORAGE_TREE_PREFIX + treeId;
      const treeList = await getTreeListAsync();

      if (!treeList.includes(treeId)) {
        throw new Error(`Tree "${treeId}" does not exist`);
      }

      // Remove the tree data
      localStorage.removeItem(key);

      // Update the tree list
      const updatedTreeList = treeList.filter(id => id !== treeId);
      localStorage.setItem(LOCALSTORAGE_TREES_KEY, JSON.stringify(updatedTreeList));
    } catch (error) {
      console.error('Error deleting tree from localStorage:', error);
      throw error;
    }
    return;
  }

  const treesDir = await getTreesDir();
  const treePath = await window.electronAPI.joinPath(treesDir, treeId);

  const exists = await window.electronAPI.exists(treePath);
  if (!exists) {
    throw new Error(`Tree "${treeId}" does not exist`);
  }

  await window.electronAPI.rmdir(treePath);
}

// Rename a tree
export async function renameTree(oldTreeId: string, newTreeName: string): Promise<Tree> {
  const newTreeId = newTreeName.trim();

  if (!isElectron) {
    // Use localStorage in browser mode
    try {
      const treeList = await getTreeListAsync();

      // Check if old tree exists
      if (!treeList.includes(oldTreeId)) {
        throw new Error(`Tree "${oldTreeId}" does not exist`);
      }

      // Check if new tree name already exists
      if (treeList.includes(newTreeId)) {
        throw new Error(`A tree named "${newTreeName}" already exists`);
      }

      // Load the tree
      const tree = await loadTree(oldTreeId);

      // Update tree properties
      tree.id = newTreeId;
      tree.name = newTreeName;

      // Save to new location
      await saveTree(tree);

      // Delete old tree
      const oldKey = LOCALSTORAGE_TREE_PREFIX + oldTreeId;
      localStorage.removeItem(oldKey);

      // Update the tree list
      const updatedTreeList = treeList.map(id => id === oldTreeId ? newTreeId : id);
      localStorage.setItem(LOCALSTORAGE_TREES_KEY, JSON.stringify(updatedTreeList));

      return tree;
    } catch (error) {
      console.error('Error renaming tree in localStorage:', error);
      throw error;
    }
  }

  const treesDir = await getTreesDir();
  const oldTreePath = await window.electronAPI.joinPath(treesDir, oldTreeId);

  // Check if old tree exists
  const exists = await window.electronAPI.exists(oldTreePath);
  if (!exists) {
    throw new Error(`Tree "${oldTreeId}" does not exist`);
  }

  // Check if new tree name already exists
  const newTreePath = await window.electronAPI.joinPath(treesDir, newTreeId);
  const newExists = await window.electronAPI.exists(newTreePath);
  if (newExists) {
    throw new Error(`A tree named "${newTreeName}" already exists`);
  }

  // Load the tree
  const tree = await loadTree(oldTreeId);

  // Update tree properties
  tree.id = newTreeId;
  tree.name = newTreeName;

  // Save to new location
  await saveTree(tree);

  // Delete old tree
  await window.electronAPI.rmdir(oldTreePath);

  return tree;
}

// Extract a subtree starting from a specific node
export async function extractSubtree(tree: Tree, nodeId: string, newTreeName: string): Promise<Tree> {
  const node = tree.nodes.get(nodeId);
  if (!node) {
    throw new Error('Node not found');
  }

  const treeId = newTreeName.trim();

  if (!isElectron) {
    // Use localStorage in browser mode
    try {
      const treeList = await getTreeListAsync();

      // Check if tree already exists
      if (treeList.includes(treeId)) {
        throw new Error(`A tree named "${newTreeName}" already exists`);
      }

      // Create new tree with the node as root
      const newNodes = new Map<string, TreeNode>();

      // Recursively copy nodes
      const copyNode = (oldNodeId: string, newParentId: string | null): string => {
        const oldNode = tree.nodes.get(oldNodeId);
        if (!oldNode) return oldNodeId;

        const newNode: TreeNode = {
          id: oldNode.id,
          text: oldNode.text,
          parentId: newParentId,
          childIds: [],
          locked: false,
        };

        newNodes.set(newNode.id, newNode);

        // Copy children
        oldNode.childIds.forEach(childId => {
          const newChildId = copyNode(childId, newNode.id);
          newNode.childIds.push(newChildId);
        });

        return newNode.id;
      };

      // Start copying from the selected node (which becomes the new root)
      const newRootId = copyNode(nodeId, null);

      const newTree: Tree = {
        id: treeId,
        name: newTreeName,
        nodes: newNodes,
        rootId: newRootId,
        currentNodeId: newRootId,
        bookmarkedNodeIds: [],
      };

      await saveTree(newTree);

      // Update the tree list
      const updatedTreeList = [...treeList, treeId];
      localStorage.setItem(LOCALSTORAGE_TREES_KEY, JSON.stringify(updatedTreeList));

      return newTree;
    } catch (error) {
      console.error('Error extracting subtree in localStorage:', error);
      throw error;
    }
  }

  // Check if tree already exists
  await ensureTreesDirectory();
  const treesDir = await getTreesDir();
  const treePath = await window.electronAPI.joinPath(treesDir, treeId);
  const exists = await window.electronAPI.exists(treePath);

  if (exists) {
    throw new Error(`A tree named "${newTreeName}" already exists`);
  }

  // Create new tree with the node as root
  const newNodes = new Map<string, TreeNode>();

  // Recursively copy nodes
  const copyNode = (oldNodeId: string, newParentId: string | null): string => {
    const oldNode = tree.nodes.get(oldNodeId);
    if (!oldNode) return oldNodeId;

    const newNode: TreeNode = {
      id: oldNode.id,
      text: oldNode.text,
      parentId: newParentId,
      childIds: [],
      locked: false,
    };

    newNodes.set(newNode.id, newNode);

    // Copy children
    oldNode.childIds.forEach(childId => {
      const newChildId = copyNode(childId, newNode.id);
      newNode.childIds.push(newChildId);
    });

    return newNode.id;
  };

  // Start copying from the selected node (which becomes the new root)
  const newRootId = copyNode(nodeId, null);

  const newTree: Tree = {
    id: treeId,
    name: newTreeName,
    nodes: newNodes,
    rootId: newRootId,
    currentNodeId: newRootId,
    bookmarkedNodeIds: [],
  };

  await saveTree(newTree);
  return newTree;
}

// Get the full branch text (from root to current node)
export function getBranchText(tree: Tree, nodeId: string): string {
  const branch: string[] = [];
  let currentId: string | null = nodeId;

  while (currentId) {
    const node = tree.nodes.get(currentId);
    if (!node) break;

    branch.unshift(node.text);
    currentId = node.parentId;
  }

  return branch.join('');
}

// Get the position where the current node's text starts in the full branch
export function getCurrentNodeStartPosition(tree: Tree, nodeId: string): number {
  let position = 0;
  let currentId: string | null = nodeId;
  const nodesToCurrent: TreeNode[] = [];

  // Collect nodes from current to root
  while (currentId) {
    const node = tree.nodes.get(currentId);
    if (!node) break;

    nodesToCurrent.unshift(node);
    currentId = node.parentId;
  }

  // Calculate position (all text before current node)
  for (let i = 0; i < nodesToCurrent.length - 1; i++) {
    position += nodesToCurrent[i].text.length;
  }

  return position;
}

// Export entire tree as JSON file
export async function exportTree(tree: Tree): Promise<string | null> {
  if (!isElectron) {
    throw new Error('File system not available');
  }

  // Convert Map to array for JSON serialization
  const nodesArray = Array.from(tree.nodes.values());

  const treeData = {
    ...tree,
    nodes: nodesArray,
  };

  const treeJson = JSON.stringify(treeData, null, 2);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const defaultFilename = `tree_${tree.name}_${timestamp}.json`;

  // Show save dialog
  const filepath = await window.electronAPI.showSaveDialog({
    defaultPath: defaultFilename,
    filters: [
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  // If user cancelled, return null
  if (!filepath) {
    return null;
  }

  await window.electronAPI.writeFile(filepath, treeJson);

  return filepath;
}

// Import tree from JSON file
export async function importTree(): Promise<Tree | null> {
  if (!isElectron) {
    throw new Error('File system not available');
  }

  // Show open dialog
  const filepath = await window.electronAPI.showOpenDialog({
    filters: [
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });

  // If user cancelled, return null
  if (!filepath) {
    return null;
  }

  // Read and parse the file
  const fileContent = await window.electronAPI.readFile(filepath);
  const parsed = JSON.parse(fileContent);

  // Convert nodes array to Map
  const nodesMap = new Map<string, TreeNode>();
  parsed.nodes.forEach((node: TreeNode) => {
    // Unlock all nodes on import
    node.locked = false;
    node.lockReason = undefined;
    nodesMap.set(node.id, node);
  });

  // Check if tree with this name already exists
  await ensureTreesDirectory();
  const treesDir = await getTreesDir();
  const treeId = parsed.name.trim();
  const treePath = await window.electronAPI.joinPath(treesDir, treeId);
  const exists = await window.electronAPI.exists(treePath);

  if (exists) {
    // Generate a unique name by appending a number
    let counter = 1;
    let newTreeId = `${treeId}_${counter}`;
    let newTreePath = await window.electronAPI.joinPath(treesDir, newTreeId);
    let newExists = await window.electronAPI.exists(newTreePath);

    while (newExists) {
      counter++;
      newTreeId = `${treeId}_${counter}`;
      newTreePath = await window.electronAPI.joinPath(treesDir, newTreeId);
      newExists = await window.electronAPI.exists(newTreePath);
    }

    parsed.id = newTreeId;
    parsed.name = newTreeId;
  }

  const tree: Tree = {
    ...parsed,
    nodes: nodesMap,
    bookmarkedNodeIds: parsed.bookmarkedNodeIds || [],
  };

  // Save the imported tree
  await saveTree(tree);

  return tree;
}

// Unroll tree branches (leaf nodes with their parent chains)
export async function unrollTreeBranches(tree: Tree): Promise<string | null> {
  if (!isElectron) {
    throw new Error('File system not available');
  }

  // Helper function to find all leaf nodes
  const findLeafNodes = (nodeId: string): string[] => {
    const node = tree.nodes.get(nodeId);
    if (!node) return [];

    // If node has no children, it's a leaf
    if (node.childIds.length === 0) {
      return [nodeId];
    }

    // Otherwise, recurse to find leaves in children
    const leaves: string[] = [];
    node.childIds.forEach(childId => {
      leaves.push(...findLeafNodes(childId));
    });

    return leaves;
  };

  // Helper function to get full branch text from root to a specific node
  const getBranchNodes = (nodeId: string): TreeNode[] => {
    const nodes: TreeNode[] = [];
    let currentId: string | null = nodeId;

    while (currentId) {
      const node = tree.nodes.get(currentId);
      if (!node) break;

      nodes.unshift(node);
      currentId = node.parentId;
    }

    return nodes;
  };

  // Find all leaf nodes
  const leafNodeIds = findLeafNodes(tree.rootId);

  let output = '';
  output += 'TREE BRANCHES (Leaf Nodes with Full Context)\n';
  output += '=============================================\n\n';
  output += `Total branches: ${leafNodeIds.length}\n\n`;

  // Output each branch
  leafNodeIds.forEach((leafId, index) => {
    const branchNodes = getBranchNodes(leafId);

    output += `BRANCH ${index + 1} of ${leafNodeIds.length}\n`;
    output += '─'.repeat(40) + '\n\n';

    // Show path labels
    const pathLabels = branchNodes.map(node =>
      node.text.substring(0, 50).replace(/\n/g, ' ') || '(empty)'
    );
    output += `[Path: ${pathLabels.join(' > ')}]\n`;
    output += `[Leaf Node ID: ${leafId}]\n\n`;

    // Output full text of the branch
    branchNodes.forEach((node) => {
      output += node.text || '(empty)';
    });

    // Add separator between branches (but not after the last one)
    if (index < leafNodeIds.length - 1) {
      output += '\n\n' + '═'.repeat(40) + '\n\n';
    }
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const defaultFilename = `tree_${tree.name}_branches_${timestamp}.txt`;

  // Show save dialog
  const filepath = await window.electronAPI.showSaveDialog({
    defaultPath: defaultFilename,
    filters: [
      { name: 'Text Files', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  // If user cancelled, return null
  if (!filepath) {
    return null;
  }

  await window.electronAPI.writeFile(filepath, output);

  return filepath;
}

// Unroll tree into a human-readable format
export async function unrollTree(tree: Tree): Promise<string | null> {
  if (!isElectron) {
    throw new Error('File system not available');
  }

  // Helper function to build tree structure visualization
  const buildTreeIndex = (nodeId: string, prefix: string = '', isLast: boolean = true): string[] => {
    const node = tree.nodes.get(nodeId);
    if (!node) return [];

    const lines: string[] = [];
    const connector = isLast ? '└─ ' : '├─ ';
    const nodeLabel = node.text.substring(0, 50).replace(/\n/g, ' ') || '(empty)';

    lines.push(prefix + connector + nodeLabel);

    const childCount = node.childIds.length;
    node.childIds.forEach((childId, index) => {
      const isLastChild = index === childCount - 1;
      const childPrefix = prefix + (isLast ? '   ' : '│  ');
      lines.push(...buildTreeIndex(childId, childPrefix, isLastChild));
    });

    return lines;
  };

  // Helper function to get node path
  const getNodePath = (nodeId: string): string[] => {
    const path: string[] = [];
    let currentId: string | null = nodeId;

    while (currentId) {
      const node = tree.nodes.get(currentId);
      if (!node) break;

      const label = node.text.substring(0, 50).replace(/\n/g, ' ') || '(empty)';
      path.unshift(label);
      currentId = node.parentId;
    }

    return path;
  };

  // Helper function to collect all nodes in depth-first order
  const collectNodes = (nodeId: string): string[] => {
    const node = tree.nodes.get(nodeId);
    if (!node) return [];

    const nodes: string[] = [nodeId];
    node.childIds.forEach(childId => {
      nodes.push(...collectNodes(childId));
    });

    return nodes;
  };

  // Build the tree structure index
  const rootNode = tree.nodes.get(tree.rootId);
  const rootLabel = rootNode?.text.substring(0, 50).replace(/\n/g, ' ') || '(empty)';

  let output = '';
  output += 'TREE STRUCTURE INDEX\n';
  output += '====================\n\n';
  output += rootLabel + '\n';

  if (rootNode) {
    rootNode.childIds.forEach((childId, index) => {
      const isLast = index === rootNode.childIds.length - 1;
      output += buildTreeIndex(childId, '', isLast).join('\n') + '\n';
    });
  }

  output += '\n\n';
  output += 'FULL TREE CONTENT\n';
  output += '=================\n\n';

  // Collect all nodes in depth-first order
  const allNodeIds = collectNodes(tree.rootId);

  // Output each node with its path and content
  allNodeIds.forEach((nodeId, index) => {
    const node = tree.nodes.get(nodeId);
    if (!node) return;

    const path = getNodePath(nodeId);
    output += `[Path: ${path.join(' > ')}]\n`;
    output += `[Node ID: ${nodeId}]\n`;
    output += node.text || '(empty)';

    // Add separator between nodes (but not after the last one)
    if (index < allNodeIds.length - 1) {
      output += '\n\n────────────────────────────────────────\n\n';
    }
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const defaultFilename = `tree_${tree.name}_unrolled_${timestamp}.txt`;

  // Show save dialog
  const filepath = await window.electronAPI.showSaveDialog({
    defaultPath: defaultFilename,
    filters: [
      { name: 'Text Files', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  // If user cancelled, return null
  if (!filepath) {
    return null;
  }

  await window.electronAPI.writeFile(filepath, output);

  return filepath;
}
