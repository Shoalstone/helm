import { Tree, ScoutConfig, CopilotConfig, Settings } from '../types';
import { callContinuationModel, callAssistantModel } from './openrouter';
import { getBranchText } from './fileSystem';
import prompts from '../../prompts.json';

// Get context nodes for vision
function getContextNodes(tree: Tree, nodeId: string, vision: number): string[] {
  const context: string[] = [];
  let currentId: string | null = nodeId;
  let count = 0;

  while (currentId && count < vision) {
    const node = tree.nodes.get(currentId);
    if (!node) break;

    if (node.parentId) {
      const parent = tree.nodes.get(node.parentId);
      if (parent) {
        context.unshift(parent.text);
        count++;
      }
      currentId = node.parentId;
    } else {
      break;
    }
  }

  return context;
}

function buildParentBranchContext(tree: Tree, parentId: string, vision: number): string {
  const branchNodes: { id: string; text: string }[] = [];
  let currentId: string | null = parentId;
  let count = 0;

  // Collect up to `vision` parent nodes, starting from the direct parent upwards
  while (currentId && count < vision) {
    const node = tree.nodes.get(currentId);
    if (!node) break;

    // Prepend to maintain root-first ordering for the combined text
    branchNodes.unshift({
      id: node.id,
      text: node.text || '<empty>',
    });

    currentId = node.parentId;
    count++;
  }

  if (branchNodes.length === 0) {
    return 'No parent context available.';
  }

  const appendedText = branchNodes.map(node => node.text).join('');
  const lineageDetails = branchNodes
    .map((node, index) => {
      const distanceFromParent = branchNodes.length - index - 1;
      const label =
        distanceFromParent === 0
          ? 'Direct parent'
          : `Ancestor ${distanceFromParent} (further back in the branch)`;
      return `${label} (${node.id}):\n${node.text}`;
    })
    .join('\n\n');

  return `Appended parent branch text (root → current parent):\n${
    appendedText || '<empty>'
  }\n\nParent lineage with boundaries:\n${lineageDetails}`;
}

// Helper to check if a node or any of its descendants is bookmarked
function hasBookmarkedDescendant(
  tree: Tree,
  nodeId: string,
  bookmarkedSet: Set<string>
): boolean {
  if (bookmarkedSet.has(nodeId)) return true;

  const node = tree.nodes.get(nodeId);
  if (!node) return false;

  return node.childIds.some(childId =>
    hasBookmarkedDescendant(tree, childId, bookmarkedSet)
  );
}

// Expand a node by generating children
export async function expandNode(
  tree: Tree,
  nodeId: string,
  count: number,
  apiKey: string,
  settings: Settings,
  lockNode: (id: string, reason: 'expanding') => boolean,
  unlockNode: (id: string) => void,
  addNode: (parentId: string, text: string) => string
): Promise<string[]> {
  const acquired = lockNode(nodeId, 'expanding');
  if (!acquired) {
    return [];
  }

  try {
    const branchText = getBranchText(tree, nodeId);
    const childIds: string[] = [];

    // Generate continuations in parallel
    const promises = Array.from({ length: count }, async () => {
      try {
        const completion = await callContinuationModel(
          apiKey,
          branchText,
          settings.continuations,
          settings.continuations.assistantMode
        );
        return completion;
      } catch (error) {
        console.error('Error generating continuation:', error);
        return null;
      }
    });

    const results = await Promise.all(promises);

    // Add successful completions as children
    results.forEach((completion) => {
      if (completion) {
        const childId = addNode(nodeId, completion);
        if (childId) {
          childIds.push(childId);
        }
      }
    });

    return childIds;
  } finally {
    unlockNode(nodeId);
  }
}

// Scout decision: expand or cull
export async function scoutDecision(
  tree: Tree,
  nodeId: string,
  config: ScoutConfig,
  apiKey: string,
  settings: Settings
): Promise<{ decision: 'expand' | 'cull'; response: string }> {
  try {
    const node = tree.nodes.get(nodeId);
    if (!node) return { decision: 'cull', response: 'Node not found' };

    const context = getContextNodes(tree, nodeId, config.vision);
    const contextText = context.map((text, i) => `Node ${i + 1}:\n${text}`).join('\n\n');

    const userMessage = prompts.scout.userTemplate
      .replace('{instructions}', config.instructions)
      .replace('{context}', contextText || 'No previous context.')
      .replace('{currentNode}', node.text || '<empty>');

    const response = await callAssistantModel(
      apiKey,
      prompts.scout.system,
      userMessage,
      settings.assistant
    );

    // Parse for <decision>expand</decision> or <decision>cull</decision> tags
    const expandMatch = response.match(/<decision>\s*expand\s*<\/decision>/i);
    const cullMatch = response.match(/<decision>\s*cull\s*<\/decision>/i);

    let decision: 'expand' | 'cull';
    if (expandMatch) {
      decision = 'expand';
    } else if (cullMatch) {
      decision = 'cull';
    } else {
      // Fallback: check for plain text if tags not found
      const lowerResponse = response.toLowerCase();
      decision = lowerResponse.includes('expand') ? 'expand' : 'cull';
    }

    return {
      decision,
      response,
    };
  } catch (error) {
    console.error('Error making scout decision:', error);
    return { decision: 'cull', response: `Error: ${error}` }; // Default to cull on error
  }
}

async function witnessDecision(
  tree: Tree,
  parentId: string,
  candidateIds: string[],
  config: ScoutConfig,
  apiKey: string,
  settings: Settings
): Promise<{ selectedChildId: string | null; response: string }> {
  if (candidateIds.length === 0) {
    return { selectedChildId: null, response: 'No candidates available.' };
  }

  try {
    const parentContext = buildParentBranchContext(tree, parentId, config.vision);
    const choicesText = candidateIds
      .map((childId, index) => {
        const child = tree.nodes.get(childId);
        const body = child?.text || '<empty>';
        return `Choice ${index + 1} (Node ${childId}):\n${body}`;
      })
      .join('\n\n');

    const userMessage = prompts.witness.userTemplate
      .replace('{instructions}', config.instructions)
      .replace('{parentBranch}', parentContext)
      .replace('{choices}', choicesText || 'No sibling continuations.');

    const response = await callAssistantModel(
      apiKey,
      prompts.witness.system,
      userMessage,
      settings.assistant
    );

    // Parse for <choice>X</choice> tag
    const tagMatch = response.match(/<choice>\s*(\d+)\s*<\/choice>/i);
    if (tagMatch) {
      const index = parseInt(tagMatch[1], 10) - 1;
      if (!Number.isNaN(index) && index >= 0 && index < candidateIds.length) {
        return { selectedChildId: candidateIds[index], response };
      }
    }

    // Fallback: try plain text format "Choice X"
    const plainMatch = response.match(/choice\s*(\d+)/i);
    if (plainMatch) {
      const index = parseInt(plainMatch[1], 10) - 1;
      if (!Number.isNaN(index) && index >= 0 && index < candidateIds.length) {
        return { selectedChildId: candidateIds[index], response };
      }
    }

    // Default to the first option if parsing failed
    return { selectedChildId: candidateIds[0], response };
  } catch (error) {
    console.error('Error making witness decision:', error);
    return { selectedChildId: candidateIds[0] ?? null, response: `Error: ${error}` };
  }
}

// Copilot decision: expand or cull
export async function copilotDecision(
  tree: Tree,
  nodeId: string,
  config: CopilotConfig,
  apiKey: string,
  settings: Settings
): Promise<{ decision: 'expand' | 'cull'; response: string }> {
  try {
    const node = tree.nodes.get(nodeId);
    if (!node) return { decision: 'cull', response: 'Node not found' };

    const context = getContextNodes(tree, nodeId, config.vision);
    const contextText = context.map((text, i) => `Node ${i + 1}:\n${text}`).join('\n\n');

    const userMessage = prompts.copilot.userTemplate
      .replace('{instructions}', config.instructions)
      .replace('{context}', contextText || 'No previous context.')
      .replace('{currentNode}', node.text || '<empty>');

    const response = await callAssistantModel(
      apiKey,
      prompts.copilot.system,
      userMessage,
      settings.assistant
    );

    // Parse for <decision>expand</decision> or <decision>cull</decision> tags
    const expandMatch = response.match(/<decision>\s*expand\s*<\/decision>/i);
    const cullMatch = response.match(/<decision>\s*cull\s*<\/decision>/i);

    let decision: 'expand' | 'cull';
    if (expandMatch) {
      decision = 'expand';
    } else if (cullMatch) {
      decision = 'cull';
    } else {
      // Fallback: check for plain text if tags not found
      const lowerResponse = response.toLowerCase();
      decision = lowerResponse.includes('expand') ? 'expand' : 'cull';
    }

    return { decision, response };
  } catch (error) {
    console.error('Error making copilot decision:', error);
    return { decision: 'cull', response: `Error: ${error}` }; // Default to cull on error
  }
}

// Scout exploration process
export async function runScout(
  tree: Tree,
  startNodeId: string,
  config: ScoutConfig,
  apiKey: string,
  settings: Settings,
  lockNode: (id: string, reason: 'scout-active') => boolean,
  unlockNode: (id: string) => void,
  addNode: (parentId: string, text: string) => string,
  deleteNode: (id: string) => void,
  shouldStop: () => boolean,
  onOutput?: (output: string) => void,
  getTree?: () => Tree
): Promise<void> {
  const processNode = async (nodeId: string, depth: number) => {
    if (shouldStop() || depth > config.depth) return;

    const acquired = lockNode(nodeId, 'scout-active');
    if (!acquired) {
      return;
    }

    try {
      // Get fresh tree reference if available
      const currentTree = getTree ? getTree() : tree;

      // Determine the range to use based on shotgun settings
      let rangeToUse = config.range;
      if (config.shotgunEnabled && config.shotgunLayers && config.shotgunRanges) {
        // Check if current depth is within shotgun layers
        if (depth <= config.shotgunLayers) {
          // Use the shotgun range for this layer (depth is 1-indexed)
          rangeToUse = config.shotgunRanges[depth - 1] || config.range;
        }
      }

      // Expand the node
      const childIds = await expandNode(
        currentTree,
        nodeId,
        rangeToUse,
        apiKey,
        settings,
        (id) => lockNode(id, 'scout-active'),
        unlockNode,
        addNode
      );

      if (shouldStop()) {
        childIds.forEach((childId) => {
          try {
            deleteNode(childId);
          } catch (e) {
            // Ignore errors during cleanup
          }
        });
        return;
      }

      // Decide on each child
      const decisions = await Promise.all(
        childIds.map(async (childId) => {
          if (shouldStop()) return { childId, decision: 'cull' as const, response: '' };

          // Get fresh tree for each decision
          const freshTree = getTree ? getTree() : tree;
          const result = await scoutDecision(freshTree, childId, config, apiKey, settings);

          // Store the output if callback provided
          if (onOutput && result.response) {
            onOutput(result.response);
          }

          return { childId, decision: result.decision, response: result.response };
        })
      );

      // Process decisions
      for (const { childId, decision } of decisions) {
        if (shouldStop()) break;

        if (decision === 'cull') {
          try {
            deleteNode(childId);
          } catch (e) {
            // Node might already be deleted
          }
        } else if (depth < config.depth) {
          await processNode(childId, depth + 1);
        }
      }
    } catch (error) {
      console.error('Error in scout process:', error);
    } finally {
      if (acquired) {
        unlockNode(nodeId);
      }
    }
  };

  await processNode(startNodeId, 1);
}

// Trident exploration process
export async function runTrident(
  tree: Tree,
  startNodeId: string,
  config: ScoutConfig,
  apiKey: string,
  settings: Settings,
  lockNode: (id: string, reason: 'trident-active') => boolean,
  unlockNode: (id: string) => void,
  addNode: (parentId: string, text: string) => string,
  deleteNode: (id: string) => void,
  shouldStop: () => boolean,
  onOutput?: (output: string) => void,
  getTree?: () => Tree
): Promise<void> {
  const prongs = config.prongs || 2;
  const tries = config.tries || 3;

  // Process a single prong - attempts to extend depth times with retries
  const processProng = async (nodeId: string, depth: number): Promise<void> => {
    if (shouldStop() || depth > config.depth) return;

    const acquired = lockNode(nodeId, 'trident-active');
    if (!acquired) {
      return;
    }

    try {
      // Get fresh tree reference
      const currentTree = getTree ? getTree() : tree;

      // Evaluate current node
      const result = await scoutDecision(currentTree, nodeId, config, apiKey, settings);

      // Store the output if callback provided
      if (onOutput && result.response) {
        onOutput(result.response);
      }

      if (shouldStop()) return;

      if (result.decision === 'cull') {
        // Cull this node and stop this prong
        try {
          deleteNode(nodeId);
        } catch (e) {
          // Node might already be deleted
        }
        return;
      }

      // Decision is 'expand' - try to generate and expand a child
      // Attempt up to `tries` times to find an expandable child
      for (let attempt = 0; attempt < tries; attempt++) {
        if (shouldStop()) break;

        // Get fresh tree before expanding
        const freshTree = getTree ? getTree() : tree;

        // Generate ONE child
        const childIds = await expandNode(
          freshTree,
          nodeId,
          1, // Always generate exactly 1 child
          apiKey,
          settings,
          (id) => lockNode(id, 'trident-active'),
          unlockNode,
          addNode
        );

        if (shouldStop() || childIds.length === 0) {
          // Clean up if stopped
          childIds.forEach((childId) => {
            try {
              deleteNode(childId);
            } catch (e) {
              // Ignore
            }
          });
          break;
        }

        const childId = childIds[0];

        // Evaluate the child
        const childTree = getTree ? getTree() : tree;
        const childResult = await scoutDecision(childTree, childId, config, apiKey, settings);

        // Store the output if callback provided
        if (onOutput && childResult.response) {
          onOutput(childResult.response);
        }

        if (shouldStop()) {
          try {
            deleteNode(childId);
          } catch (e) {
            // Ignore
          }
          break;
        }

        if (childResult.decision === 'expand') {
          // Success! Continue with this child to next depth
          await processProng(childId, depth + 1);
          return; // Exit after successful expansion
        } else {
          // Cull this attempt
          try {
            deleteNode(childId);
          } catch (e) {
            // Node might already be deleted
          }

          // If this was not the last attempt, continue to next try
          if (attempt < tries - 1) {
            continue;
          } else {
            // Exhausted all tries, stop this prong
            return;
          }
        }
      }
    } catch (error) {
      console.error('Error in trident process:', error);
    } finally {
      if (acquired) {
        unlockNode(nodeId);
      }
    }
  };

  // Main Trident logic: generate initial prongs and process each
  try {
    const acquired = lockNode(startNodeId, 'trident-active');
    if (!acquired) {
      return;
    }

    try {
      // Get fresh tree reference
      const currentTree = getTree ? getTree() : tree;

      // Generate initial prongs (children)
      const prongIds = await expandNode(
        currentTree,
        startNodeId,
        prongs,
        apiKey,
        settings,
        (id) => lockNode(id, 'trident-active'),
        unlockNode,
        addNode
      );

      if (shouldStop()) {
        // Clean up if stopped
        prongIds.forEach((prongId) => {
          try {
            deleteNode(prongId);
          } catch (e) {
            // Ignore
          }
        });
        return;
      }

      // Process all prongs in parallel
      await Promise.all(
        prongIds.map(prongId => processProng(prongId, 1))
      );
    } finally {
      if (acquired) {
        unlockNode(startNodeId);
      }
    }
  } catch (error) {
    console.error('Error starting trident:', error);
  }
}

export async function runWitness(
  tree: Tree,
  startNodeId: string,
  config: ScoutConfig,
  apiKey: string,
  settings: Settings,
  lockNode: (id: string, reason: 'witness-active') => boolean,
  unlockNode: (id: string) => void,
  deleteNode: (id: string) => void,
  mergeWithParent: (id: string) => void,
  shouldStop: () => boolean,
  onOutput?: (output: string) => void
): Promise<void> {
  const lockedNodes = new Set<string>();

  const safeLock = (id: string) => {
    if (!id || lockedNodes.has(id)) return;

    // Check if node is already locked by another agent before attempting to lock
    const node = tree.nodes.get(id);
    if (node?.locked && node.lockReason !== 'witness-active') {
      console.warn(`[Witness] Cannot lock node ${id.substring(0, 16)} - already locked with ${node.lockReason}`);
      return;
    }

    try {
      const acquired = lockNode(id, 'witness-active');
      if (acquired) {
        lockedNodes.add(id);
      }
    } catch (error) {
      console.error('Failed to lock node for witness:', error);
    }
  };

  const unlockAll = () => {
    lockedNodes.forEach(id => {
      try {
        unlockNode(id);
      } catch (error) {
        console.error('Failed to unlock node after witness:', error);
      }
    });
    lockedNodes.clear();
  };

  const pruneChildren = async (nodeId: string): Promise<void> => {
    while (!shouldStop()) {
      const parentNode = tree.nodes.get(nodeId);
      if (!parentNode) return;

      let children = parentNode.childIds.filter(childId => tree.nodes.has(childId));
      if (children.length === 0) {
        return;
      }

      // Check if any child or their descendants are bookmarked
      const bookmarkedSet = new Set(tree.bookmarkedNodeIds);
      const hasBookmarked = children.some(childId =>
        hasBookmarkedDescendant(tree, childId, bookmarkedSet)
      );
      if (hasBookmarked) {
        // Can't safely prune this level - exit early
        return;
      }

      // Lock parent and current children
      safeLock(nodeId);
      children.forEach(safeLock);

      // Prune each child subtree before comparing siblings
      for (const childId of children) {
        if (shouldStop()) return;
        await pruneChildren(childId);
      }
      if (shouldStop()) return;

      children = (tree.nodes.get(nodeId)?.childIds || []).filter(childId => tree.nodes.has(childId));
      if (children.length === 0) {
        return;
      }
      children.forEach(safeLock);

      if (children.length === 1) {
        const onlyChildId = children[0];

        await pruneChildren(onlyChildId);
        if (shouldStop()) return;

        if (!tree.nodes.has(onlyChildId)) {
          continue;
        }

        safeLock(onlyChildId);
        mergeWithParent(onlyChildId);
        continue;
      }

      const chunkSize = Math.max(2, config.range);

      while (children.length > 1 && !shouldStop()) {
        const chunk = children.slice(0, chunkSize);

        if (chunk.length < 2) {
          children = children.slice(1).concat(chunk);
          continue;
        }

        const decision = await witnessDecision(tree, nodeId, chunk, config, apiKey, settings);
        if (onOutput && decision.response) {
          onOutput(decision.response);
        }

        const winnerId =
          decision.selectedChildId && chunk.includes(decision.selectedChildId)
            ? decision.selectedChildId
            : chunk[0];

        for (const childId of chunk) {
          if (childId === winnerId) continue;
          if (shouldStop()) break;
          deleteNode(childId);
        }

        const updatedParent = tree.nodes.get(nodeId);
        if (!updatedParent) {
          children = [];
          break;
        }

        children = updatedParent.childIds.filter(childId => tree.nodes.has(childId));
        children.forEach(safeLock);

        if (children.includes(winnerId)) {
          children = [winnerId, ...children.filter(id => id !== winnerId)];
        }
      }
    }
  };

  const processUpwards = async (nodeId: string, remainingDepth: number): Promise<void> => {
    if (shouldStop() || remainingDepth <= 0) return;

    const node = tree.nodes.get(nodeId);
    if (!node || !node.parentId) return;

    const parentId = node.parentId;
    const parentNode = tree.nodes.get(parentId);
    if (!parentNode) return;

    safeLock(parentId);

    let siblings = parentNode.childIds.filter(childId => tree.nodes.has(childId));
    if (siblings.length === 0) {
      await processUpwards(parentId, remainingDepth - 1);
      return;
    }

    // Prune children of each sibling before comparison
    for (const siblingId of siblings) {
      if (shouldStop()) break;
      await pruneChildren(siblingId);
    }
    if (shouldStop()) return;

    siblings = parentNode.childIds.filter(childId => tree.nodes.has(childId));

    // Check if any sibling or their descendants are bookmarked
    const bookmarkedSet = new Set(tree.bookmarkedNodeIds);
    const hasBookmarked = siblings.some(siblingId =>
      hasBookmarkedDescendant(tree, siblingId, bookmarkedSet)
    );
    if (hasBookmarked) {
      // Can't safely compare siblings - skip to next level
      await processUpwards(parentId, remainingDepth - 1);
      return;
    }

    siblings.forEach(safeLock);

    const chunkSize = Math.max(2, config.range);

    while (siblings.length > 1 && !shouldStop()) {
      const chunk = siblings.slice(0, chunkSize);

      if (chunk.length < 2) {
        siblings = siblings.slice(1).concat(chunk);
        continue;
      }

      const decision = await witnessDecision(tree, parentId, chunk, config, apiKey, settings);
      if (onOutput && decision.response) {
        onOutput(decision.response);
      }

      const winnerId =
        decision.selectedChildId && chunk.includes(decision.selectedChildId)
          ? decision.selectedChildId
          : chunk[0];

      for (const childId of chunk) {
        if (childId === winnerId) continue;
        if (shouldStop()) break;
        deleteNode(childId);
      }

      const updatedParent = tree.nodes.get(parentId);
      if (!updatedParent) {
        siblings = [];
        break;
      }

      siblings = updatedParent.childIds.filter(childId => tree.nodes.has(childId));
      siblings.forEach(safeLock);

      if (siblings.includes(winnerId)) {
        siblings = [winnerId, ...siblings.filter(id => id !== winnerId)];
      }
    }

    if (shouldStop()) return;

    const refreshedParent = tree.nodes.get(parentId);
    if (!refreshedParent) return;

    const survivingChildren = refreshedParent.childIds.filter(childId => tree.nodes.has(childId));
    if (survivingChildren.length !== 1) {
      await processUpwards(parentId, remainingDepth - 1);
      return;
    }

    const [soleChildId] = survivingChildren;
    await pruneChildren(soleChildId);
    if (shouldStop()) return;

    if (tree.nodes.has(soleChildId)) {
      safeLock(soleChildId);
      mergeWithParent(soleChildId);
    }

    await processUpwards(parentId, remainingDepth - 1);
  };

  try {
    if (config.depth <= 0) {
      return;
    }

    await pruneChildren(startNodeId);
    if (shouldStop()) return;

    await processUpwards(startNodeId, config.depth);
  } finally {
    unlockAll();
  }
}

// Copilot process for a single node
export async function runCopilotOnNode(
  tree: Tree,
  nodeId: string,
  config: CopilotConfig,
  apiKey: string,
  settings: Settings,
  lockNode: (id: string, reason: 'copilot-deciding') => boolean,
  unlockNode: (id: string) => void,
  addNode: (parentId: string, text: string) => string,
  deleteNode: (id: string) => void,
  shouldStop: () => boolean,
  getTree?: () => Tree,
  onOutput?: (output: string) => void
): Promise<void> {
  const processNode = async (currentNodeId: string, depth: number) => {
    if (shouldStop() || depth > config.depth) return;

    const acquired = lockNode(currentNodeId, 'copilot-deciding');
    if (!acquired) {
      return;
    }

    try {
      // Get fresh tree reference if available
      const currentTree = getTree ? getTree() : tree;

      // Check if this is the current branch (user's current view)
      const isCurrentBranch = currentTree.currentNodeId === currentNodeId;

      // Make decision
      const result = await copilotDecision(currentTree, currentNodeId, config, apiKey, settings);

      // Store the output if callback provided
      if (onOutput && result.response) {
        onOutput(result.response);
      }

      if (shouldStop()) return;

      // Don't cull the current branch
      if (result.decision === 'cull' && !isCurrentBranch) {
        try {
          deleteNode(currentNodeId);
        } catch (e) {
          // Node might be locked or not deletable
        }
      } else if (result.decision === 'expand' && config.expansionEnabled && depth < config.depth) {
        // Get fresh tree before expanding
        const freshTree = getTree ? getTree() : tree;

        // Expand if enabled
        const childIds = await expandNode(
          freshTree,
          currentNodeId,
          config.range,
          apiKey,
          settings,
          (id) => lockNode(id, 'copilot-deciding'),
          unlockNode,
          addNode
        );

        if (shouldStop()) {
          childIds.forEach((childId) => {
            try {
              deleteNode(childId);
            } catch (e) {
              // Ignore
            }
          });
          return;
        }

        // Process children
        for (const childId of childIds) {
          if (shouldStop()) break;
          await processNode(childId, depth + 1);
        }
      }
    } catch (error) {
      console.error('Error in copilot process:', error);
    } finally {
      if (acquired) {
        unlockNode(currentNodeId);
      }
    }
  };

  await processNode(nodeId, 1);
}

// Helper to find the deepest node in a subtree and return its depth relative to root
function findDeepestNode(
  tree: Tree,
  rootId: string
): { nodeId: string; depth: number } {
  let deepestNode = rootId;
  let maxDepth = 0;

  const traverse = (nodeId: string, depth: number) => {
    if (depth > maxDepth) {
      maxDepth = depth;
      deepestNode = nodeId;
    }

    const node = tree.nodes.get(nodeId);
    if (node) {
      node.childIds.forEach(childId => traverse(childId, depth + 1));
    }
  };

  traverse(rootId, 0);
  return { nodeId: deepestNode, depth: maxDepth };
}

// Campaign agent: runs Scout->Witness cycles
const DEFAULT_CAMPAIGN_SCOUT_INSTRUCTIONS = 'Choose to expand nodes that are interesting, and cull nodes that are boring.';
const DEFAULT_CAMPAIGN_WITNESS_INSTRUCTIONS =
  'Choose the most interesting continuation.';

export async function runCampaign(
  tree: Tree,
  startNodeId: string,
  config: ScoutConfig,
  apiKey: string,
  settings: Settings,
  lockNode: (id: string, reason: 'scout-active' | 'witness-active') => boolean,
  unlockNode: (id: string) => void,
  addNode: (parentId: string, text: string) => string,
  deleteNode: (id: string) => void,
  mergeWithParent: (id: string) => void,
  shouldStop: () => boolean,
  onOutput?: (output: string) => void,
  getTree?: () => Tree
): Promise<void> {
  const baseInstructions = (config.instructions ?? '').trim();
  const hasBaseInstructions = baseInstructions.length > 0;
  const fallbackScoutInstructions = hasBaseInstructions
    ? config.instructions
    : DEFAULT_CAMPAIGN_SCOUT_INSTRUCTIONS;
  const fallbackWitnessInstructions = hasBaseInstructions
    ? config.instructions
    : DEFAULT_CAMPAIGN_WITNESS_INSTRUCTIONS;

  const campaignScoutInstructions =
    config.campaignScoutInstructions && config.campaignScoutInstructions.trim().length > 0
      ? config.campaignScoutInstructions
      : fallbackScoutInstructions;

  const campaignWitnessInstructions =
    config.campaignWitnessInstructions && config.campaignWitnessInstructions.trim().length > 0
      ? config.campaignWitnessInstructions
      : fallbackWitnessInstructions;

  try {
    const cycles = config.cycles || 1;

    if (onOutput) {
      onOutput(`Campaign starting: ${cycles} cycle${cycles !== 1 ? 's' : ''} planned`);
    }

    for (let cycle = 0; cycle < cycles; cycle++) {
      if (shouldStop()) {
        if (onOutput) {
          onOutput(`Campaign stopped by user at cycle ${cycle + 1}/${cycles}`);
        }
        break;
      }

      if (onOutput) {
        onOutput(`Campaign cycle ${cycle + 1}/${cycles} starting...`);
      }

      // Get Scout-specific settings (use campaign overrides if available)
      const scoutVision = config.campaignScoutVision ?? config.vision;
      const scoutRange = config.campaignScoutRange ?? config.range;
      const scoutDepth = config.campaignScoutDepth ?? config.depth;

      // Create a private Scout config (not saved to user's scout list)
      const privateScoutConfig: ScoutConfig = {
        id: `campaign_scout_${Date.now()}`,
        name: 'Campaign Scout (private)',
        type: 'Scout',
        instructions: campaignScoutInstructions,
        vision: scoutVision,
        range: scoutRange,
        depth: scoutDepth,
        active: true,
        activeNodeId: startNodeId,
        outputs: [],
        shotgunEnabled: config.shotgunEnabled,
        shotgunLayers: config.shotgunLayers,
        shotgunRanges: config.shotgunRanges,
      };

      // Run Scout phase with normal scout locking
      if (onOutput) {
        onOutput(`  Scout phase: exploring with vision=${scoutVision}, range=${scoutRange}, depth=${scoutDepth}`);
      }

      await runScout(
        tree,
        startNodeId,
        privateScoutConfig,
        apiKey,
        settings,
        (id) => lockNode(id, 'scout-active'),
        unlockNode,
        addNode,
        deleteNode,
        shouldStop,
        onOutput,
        getTree
      );

      if (shouldStop()) break;

      // Recalculate the deepest node after Scout completes
      // Get fresh tree reference after Scout has modified it
      const freshTree = getTree ? getTree() : tree;
      const { nodeId: deepestNodeId, depth: maxDepth } = findDeepestNode(freshTree, startNodeId);

      if (maxDepth === 0) {
        // No children were created, skip Witness phase
        if (onOutput) {
          onOutput(`  Witness phase: skipped (no children to merge)`);
        }
        continue;
      }

      if (onOutput) {
        onOutput(`  Witness phase: starting from deepest node at depth=${maxDepth}`);
      }

      // Get Witness-specific settings (use campaign overrides if available)
      const witnessVision = config.campaignWitnessVision ?? config.vision;
      const witnessRange = config.campaignWitnessRange ?? config.range;
      // Witness depth is automatically determined by Scout phase depth
      const witnessDepth = maxDepth;

      // Create a private Witness config
      const privateWitnessConfig: ScoutConfig = {
        id: `campaign_witness_${Date.now()}`,
        name: 'Campaign Witness (private)',
        type: 'Witness',
        instructions: campaignWitnessInstructions,
        vision: witnessVision,
        range: witnessRange,
        depth: witnessDepth,
        active: true,
        activeNodeId: deepestNodeId,
        outputs: [],
      };

      // Run Witness phase with normal witness locking
      // Use the fresh tree for Witness as well
      await runWitness(
        freshTree,
        deepestNodeId,
        privateWitnessConfig,
        apiKey,
        settings,
        (id) => lockNode(id, 'witness-active'),
        unlockNode,
        deleteNode,
        mergeWithParent,
        shouldStop,
        onOutput
      );

      if (shouldStop()) {
        if (onOutput) {
          onOutput(`Campaign stopped by user after Witness at cycle ${cycle + 1}/${cycles}`);
        }
        break;
      }

      if (onOutput) {
        onOutput(`Campaign cycle ${cycle + 1}/${cycles} completed.`);
      }
    }

    if (onOutput) {
      onOutput(`✓ Campaign finished: ${cycles} cycle${cycles !== 1 ? 's' : ''} completed.`);
    }
  } catch (error) {
    console.error('Error in campaign process:', error);
    if (onOutput) {
      onOutput(`Campaign error: ${error}`);
    }
  }
}
