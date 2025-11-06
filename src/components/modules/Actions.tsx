import React, { useState } from 'react';
import { useStore } from '../../store';
import { callAssistantModel } from '../../utils/openrouter';

const Actions: React.FC = () => {
  const [expandedAction, setExpandedAction] = useState<string | null>(null);
  const {
    settings,
    cullAndMergeToBookmarks,
    currentTree,
    toggleBookmark,
    automaticBookmarkConfig,
    updateAutomaticBookmarkConfig,
  } = useStore();

  // Generate Prompt state
  const [instructions, setInstructions] = useState('');
  const [output, setOutput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');

  // Cull and Merge to Bookmarks state
  const [cullMessage, setCullMessage] = useState('');

  // Automatic Bookmark runtime state
  const [isAutoBookmarking, setIsAutoBookmarking] = useState(false);
  const [autoBookmarkMessage, setAutoBookmarkMessage] = useState('');
  const [bookmarkedCount, setBookmarkedCount] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [totalNodes, setTotalNodes] = useState(0);
  const [autoBookmarkOutputs, setAutoBookmarkOutputs] = useState<string[]>([]);

  const toggleAction = (action: string) => {
    setExpandedAction(expandedAction === action ? null : action);
  };

  const handleGenerate = async () => {
    if (!instructions.trim()) {
      setError('Please enter instructions');
      return;
    }

    if (!settings.apiKey) {
      setError('Please set your API key in Settings');
      return;
    }

    setIsGenerating(true);
    setError('');
    setOutput('');

    try {
      const systemPrompt = `Generate a base model prompt according to the user's instructions. If the user provides a description of the prompt instead of explicit instructions, generate a base model prompt according to the user's description. A base model is a model that predicts the next token without any bias toward a particular type of text or document. So, when creating a base model prompt, you can write the beginning of any text artifact, whether a novel with a table of contents, a chatroom log, a professional report, or a wiki article. Anything at all. Try to be creative while adhering to the user's instructions or description, and try to write something authentic, something you would really see at the beginning of such a text. End the base model prompt at a place where it would be interesting to continue; for example, after the hook sentence of a novel, or after the first few lines of a wiki article. The idea is to let the base model continue it, rather than writing all of it yourself. Enclose the base model prompt within <prompt>X</prompt> tags, where X is the prompt.`;

      const userMessage = `Instructions: ${instructions}\n\nPlease enclose the base model prompt within <prompt>X</prompt> tags, where X is the prompt.`;

      const response = await callAssistantModel(
        settings.apiKey,
        systemPrompt,
        userMessage,
        settings.assistant
      );

      // Extract content between <prompt></prompt> tags
      const promptMatch = response.match(/<prompt>([\s\S]*?)<\/prompt>/);
      const extractedPrompt = promptMatch ? promptMatch[1].trim() : response;

      setOutput(extractedPrompt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate prompt');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyOutput = async () => {
    if (!output) return;

    try {
      await navigator.clipboard.writeText(output);
      // Could add a temporary "Copied!" message here if desired
    } catch (err) {
      setError('Failed to copy to clipboard');
    }
  };

  const handleCullAndMerge = () => {
    if (!currentTree || currentTree.bookmarkedNodeIds.length === 0) {
      setCullMessage('No bookmarked nodes found. Please bookmark at least one node first.');
      return;
    }

    try {
      cullAndMergeToBookmarks();
      setCullMessage('Successfully culled and merged tree to bookmarked nodes!');
      setTimeout(() => setCullMessage(''), 3000);
    } catch (err) {
      setCullMessage(err instanceof Error ? err.message : 'Failed to cull and merge');
    }
  };

  const handleAutomaticBookmark = async () => {
    if (!automaticBookmarkConfig.criteria.trim()) {
      setAutoBookmarkMessage('Please enter criteria');
      return;
    }

    if (!settings.apiKey) {
      setAutoBookmarkMessage('Please set your API key in Settings');
      return;
    }

    if (!currentTree) {
      setAutoBookmarkMessage('No tree loaded');
      return;
    }

    const numParents = parseInt(automaticBookmarkConfig.parentsToInclude, 10);
    if (isNaN(numParents) || numParents < 0) {
      setAutoBookmarkMessage('Parents to Include must be a non-negative number');
      return;
    }

    setIsAutoBookmarking(true);
    setAutoBookmarkMessage('');
    setBookmarkedCount(0);
    setProcessedCount(0);

    try {
      const systemPrompt = `You are being asked to determine whether a possible continuation of a text meets certain criteria. You are provided with some length of the previous text, the possible continuation, and the criteria. If the continuation meets the criteria, output <decision>Y</decision>. If the continuation does not meet the criteria, output <decision>N</decision>.`;

      // Helper function to get parent nodes text
      const getParentNodesText = (nodeId: string, count: number): string => {
        const parentTexts: string[] = [];
        let currentId: string | null = nodeId;
        let remaining = count;

        // Walk up the tree collecting parent texts
        while (currentId && remaining > 0) {
          const node = currentTree.nodes.get(currentId);
          if (!node || !node.parentId) break;

          const parent = currentTree.nodes.get(node.parentId);
          if (!parent) break;

          parentTexts.unshift(parent.text);
          currentId = node.parentId;
          remaining--;
        }

        return parentTexts.join('');
      };

      // Helper function to parse decision from response
      const parseDecision = (response: string): boolean => {
        // Look for <decision>Y</decision>, <decision>N</decision>, or variants
        const decisionMatch = response.match(/<decision>\s*(Y|N|Yes|No|yes|no)\s*<\/decision>/i);
        if (decisionMatch) {
          const decision = decisionMatch[1].toUpperCase();
          return decision === 'Y' || decision === 'YES';
        }
        // If no match found, default to not bookmarking
        return false;
      };

      // Collect all node IDs
      const allNodeIds: string[] = [];
      currentTree.nodes.forEach((_, nodeId) => {
        allNodeIds.push(nodeId);
      });

      setTotalNodes(allNodeIds.length);

      let bookmarked = 0;
      let processed = 0;

      // Process each node
      for (const nodeId of allNodeIds) {
        const node = currentTree.nodes.get(nodeId);
        if (!node) continue;

        const continuation = node.text;

        let userMessage: string;
        if (numParents === 0) {
          userMessage = `None of the previous text has been provided.\n\nContinuation:\n${continuation}\n\nCriteria:\n${automaticBookmarkConfig.criteria}\n\nPlease output <decision>Y</decision> if the continuation meets the criteria, and output <decision>N</decision> if the continuation does not meet the criteria.`;
        } else {
          const previousText = getParentNodesText(nodeId, numParents);
          userMessage = `Previous Text:\n${previousText}\n\nContinuation:\n${continuation}\n\nCriteria:\n${automaticBookmarkConfig.criteria}\n\nPlease output <decision>Y</decision> if the continuation meets the criteria, and output <decision>N</decision> if the continuation does not meet the criteria.`;
        }

        try {
          // Use tree-specific provider settings if available, otherwise fall back to global settings
          const effectiveApiKey = currentTree.providerApiKey || settings.apiKey;
          const providerUrl = currentTree.providerUrl; // Optional, will default to OpenRouter if not set
          const providerApiFormat = currentTree.providerApiFormat; // Optional, will default to 'messages' if not set

          const response = await callAssistantModel(
            effectiveApiKey,
            systemPrompt,
            userMessage,
            settings.assistant,
            undefined, // No OpenAI API key needed for this
            providerUrl,
            providerApiFormat
          );

          // Store the output
          setAutoBookmarkOutputs([response]);

          const shouldBookmark = parseDecision(response);

          if (shouldBookmark) {
            // Check if node is already bookmarked
            const isAlreadyBookmarked = currentTree.bookmarkedNodeIds.includes(nodeId);
            if (!isAlreadyBookmarked) {
              toggleBookmark(nodeId);
              bookmarked++;
              setBookmarkedCount(bookmarked);
            }
          }

          processed++;
          setProcessedCount(processed);
        } catch (err) {
          console.error(`Error processing node ${nodeId}:`, err);
          // Continue processing other nodes even if one fails
          processed++;
          setProcessedCount(processed);
        }
      }

      setAutoBookmarkMessage(`Successfully processed ${allNodeIds.length} nodes. Bookmarked ${bookmarked} nodes.`);
      setTimeout(() => setAutoBookmarkMessage(''), 5000);
    } catch (err) {
      setAutoBookmarkMessage(err instanceof Error ? err.message : 'Failed to process automatic bookmarking');
    } finally {
      setIsAutoBookmarking(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-sky-light overflow-y-auto">
      <div className="p-3">
        <h3 className="text-sm font-semibold mb-3 text-gray-800">Actions</h3>

        {/* Generate Prompt Action */}
        <div className="mb-2">
          <button
            onClick={() => toggleAction('generatePrompt')}
            className="w-full flex items-center justify-between px-3 py-2 bg-sky-medium rounded-lg hover:bg-sky-dark transition-colors"
          >
            <span className="text-sm font-medium text-gray-800">Generate Prompt</span>
            <span className="text-gray-600">{expandedAction === 'generatePrompt' ? '▼' : '▶'}</span>
          </button>

          {expandedAction === 'generatePrompt' && (
            <div className="mt-2 p-3 bg-white rounded-lg space-y-3">
              <p className="text-xs text-gray-600">
                Generate some initial text. If this generates a full text, you can erase some of it when you paste it into the root node.
              </p>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Instructions</label>
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  className="w-full px-2 py-1 text-xs rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-sky-dark"
                  rows={4}
                  placeholder="Enter instructions for generating the prompt..."
                />
              </div>

              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full px-3 py-2 rounded-lg bg-sky-accent hover:bg-sky-dark text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGenerating ? 'Generating...' : 'Generate'}
              </button>

              {error && (
                <div className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
                  {error}
                </div>
              )}

              {output && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Output</label>
                  <div className="max-h-48 overflow-y-auto bg-gray-50 rounded border border-gray-300 p-2">
                    <pre className="text-xs text-gray-800 whitespace-pre-wrap font-mono">
                      {output}
                    </pre>
                  </div>
                  <button
                    onClick={handleCopyOutput}
                    className="mt-2 w-full px-3 py-2 rounded-lg bg-sky-medium hover:bg-sky-dark text-sm transition-colors"
                  >
                    Copy Output
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Cull and Merge to Bookmarks Action */}
        <div className="mb-2">
          <button
            onClick={() => toggleAction('cullAndMerge')}
            className="w-full flex items-center justify-between px-3 py-2 bg-sky-medium rounded-lg hover:bg-sky-dark transition-colors"
          >
            <span className="text-sm font-medium text-gray-800">Cull and Merge to Bookmarks</span>
            <span className="text-gray-600">{expandedAction === 'cullAndMerge' ? '▼' : '▶'}</span>
          </button>

          {expandedAction === 'cullAndMerge' && (
            <div className="mt-2 p-3 bg-white rounded-lg space-y-3">
              <p className="text-xs text-gray-600">
                Cull all nodes not on a direct path to a bookmarked node, and mass merge. Preserves subtrees of bookmarked nodes unless a bookmark is within the subtree, in which case preserves only direct paths to the bookmarks in the subtree.
              </p>

              <button
                onClick={handleCullAndMerge}
                disabled={!currentTree || currentTree.bookmarkedNodeIds.length === 0}
                className="w-full px-3 py-2 rounded-lg bg-sky-accent hover:bg-sky-dark text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cull and Merge
              </button>

              {cullMessage && (
                <div className={`text-xs px-2 py-1 rounded ${
                  cullMessage.includes('Successfully')
                    ? 'text-green-700 bg-green-50'
                    : 'text-amber-700 bg-amber-50'
                }`}>
                  {cullMessage}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Automatic Bookmark Action */}
        <div className="mb-2">
          <button
            onClick={() => toggleAction('automaticBookmark')}
            className="w-full flex items-center justify-between px-3 py-2 bg-sky-medium rounded-lg hover:bg-sky-dark transition-colors"
          >
            <span className="text-sm font-medium text-gray-800">Automatic Bookmark</span>
            <span className="text-gray-600">{expandedAction === 'automaticBookmark' ? '▼' : '▶'}</span>
          </button>

          {expandedAction === 'automaticBookmark' && (
            <div className="mt-2 p-3 bg-white rounded-lg space-y-3">
              <p className="text-xs text-gray-600">
                For every node in the tree, determine whether to bookmark the node based on the given criteria. When describing criteria, describe things like properties, themes, and directions of text, instead of mentioning nodes.
              </p>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Parents to Include as Context
                </label>
                <input
                  type="number"
                  min="0"
                  value={automaticBookmarkConfig.parentsToInclude}
                  onChange={(e) => updateAutomaticBookmarkConfig({ parentsToInclude: e.target.value })}
                  className="w-full px-2 py-1 text-xs rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-sky-dark"
                  placeholder="Number of parent nodes to include"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Criteria</label>
                <textarea
                  value={automaticBookmarkConfig.criteria}
                  onChange={(e) => updateAutomaticBookmarkConfig({ criteria: e.target.value })}
                  className="w-full px-2 py-1 text-xs rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-sky-dark"
                  rows={4}
                  placeholder="Enter the criteria for bookmarking nodes..."
                />
              </div>

              <button
                onClick={handleAutomaticBookmark}
                disabled={isAutoBookmarking}
                className="w-full px-3 py-2 rounded-lg bg-sky-accent hover:bg-sky-dark text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAutoBookmarking
                  ? `Processing node ${processedCount} of ${totalNodes}... (${bookmarkedCount} bookmarked)`
                  : 'Run Automatic Bookmark'}
              </button>

              {autoBookmarkMessage && (
                <div className={`text-xs px-2 py-1 rounded ${
                  autoBookmarkMessage.includes('Successfully')
                    ? 'text-green-700 bg-green-50'
                    : 'text-amber-700 bg-amber-50'
                }`}>
                  {autoBookmarkMessage}
                </div>
              )}

              {/* Output display */}
              {autoBookmarkOutputs.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Previous Output
                  </label>
                  <div className="max-h-48 overflow-y-auto bg-gray-50 rounded border border-gray-300 p-2">
                    <div className="text-xs text-gray-800 whitespace-pre-wrap">
                      {autoBookmarkOutputs[autoBookmarkOutputs.length - 1]}
                    </div>
                  </div>
                  <button
                    onClick={() => setAutoBookmarkOutputs([])}
                    className="mt-2 px-2 py-1 rounded bg-gray-300 hover:bg-gray-400 text-xs transition-colors"
                    disabled={isAutoBookmarking}
                  >
                    Clear Output
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default Actions;
