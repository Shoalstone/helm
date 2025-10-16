import React from 'react';
import { GraphBottom, GraphContentHandle } from './modules/Graph';

interface BottomPanelProps {
  graphRef?: React.RefObject<GraphContentHandle>;
}

const BottomPanel: React.FC<BottomPanelProps> = ({ graphRef }) => {
  // If graphRef is provided, render the Graph component
  if (graphRef) {
    return <GraphBottom ref={graphRef} />;
  }

  // Otherwise render the help content
  return (
    <div className="w-full h-full bg-sky-light overflow-y-auto overflow-x-hidden">
      <div className="p-6 pb-8 max-w-4xl">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Getting Started with Helm</h1>

        <div className="bg-white p-4 rounded-lg mb-6">
          <ul className="list-disc ml-6 space-y-1 text-sm">
            <li>You can drag the handle above to resize this panel.</li>
            <li>Click the dropdown button in the ribbon above (showing "Help") and select "None" to hide this panel.</li>
          </ul>
        </div>

        <section className="mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-2">1. Setup</h2>
          <div className="bg-white p-4 rounded-lg space-y-2 text-sm">
            <p><strong>Get an API Key:</strong></p>
            <ul className="list-disc ml-6 space-y-1">
              <li>Go to <a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">openrouter.ai</a> and create an account</li>
              <li>Purchase credits (OpenRouter requires prepaid credits to use their API)</li>
              <li>Generate an API key from your account dashboard</li>
            </ul>
            <p className="mt-3"><strong>Configure Helm:</strong></p>
            <ul className="list-disc ml-6 space-y-1">
              <li>Open the <strong>Settings</strong> module in the left or right panel</li>
              <li>Paste your OpenRouter API key</li>
              <li>Configure model settings for continuations and assistants as needed</li>
            </ul>
          </div>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-2">2. Basic Concepts</h2>
          <div className="bg-white p-4 rounded-lg space-y-3 text-sm">
            <div>
              <p className="font-semibold">Trees and Nodes</p>
              <p>Helm organizes text in tree structures. Each node contains text and can have multiple child nodes, allowing you to explore different continuations of your writing.</p>
            </div>
            <div>
              <p className="font-semibold">Navigation</p>
              <p>Use <kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">Alt/Option + Arrow Keys</kbd> to navigate between nodes (parent, children, siblings).</p>
            </div>
            <div>
              <p className="font-semibold">Creating New Nodes</p>
              <p>Press <kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">Ctrl + N</kbd> (Mac) or <kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">Alt + N</kbd> (Windows) to create a child node. If your cursor is in the middle of text, it splits the node at that position, moving the text after the cursor to the new child.</p>
            </div>
            <div>
              <p className="font-semibold">Deleting Nodes</p>
              <p>Press <kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">Option/Alt + Backspace</kbd> to delete the current node. If the node has children, you'll automatically navigate to the first child instead.</p>
            </div>
            <div>
              <p className="font-semibold">Merging Nodes</p>
              <p>Press <kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">Ctrl + M</kbd> (Mac) or <kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">Alt + M</kbd> (Windows) to merge the current node with its parent, combining their text.</p>
            </div>
            <div>
              <p className="font-semibold">Expanding Nodes</p>
              <p>Press <kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">Ctrl + Space</kbd> (Mac) or <kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">Alt + Enter</kbd> (Windows) to generate AI continuations from the current node.</p>
            </div>
            <div>
              <p className="font-semibold">Bookmarking Nodes</p>
              <p>Press <kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">Ctrl + B</kbd> (Mac) or <kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">Alt + B</kbd> (Windows) to bookmark the current node. Navigate between bookmarks with <kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">Option/Alt + Shift + ↑/↓</kbd> to cycle through all bookmarks, or <kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">Option/Alt + Shift + ←</kbd> to navigate to ancestor bookmarks and <kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">Option/Alt + Shift + →</kbd> to navigate to descendant bookmarks. Bookmarked nodes appear with a ☆ icon in the tree view. Click the ☆ button in the Tree View to see all bookmarks.</p>
            </div>
          </div>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-2">3. Agents</h2>
          <div className="bg-white p-4 rounded-lg space-y-4 text-sm">
            <p>Agents automate exploration and decision-making in your tree. Access them via the <strong>Agents</strong> module in the side panels.</p>

            <div>
              <p className="font-semibold text-sky-dark">Scout Agent</p>
              <p className="mb-2">Explores the tree by expanding nodes based on your instructions.</p>
              <ul className="list-disc ml-6 space-y-1">
                <li><strong>Instructions:</strong> Tell the Scout what to look for or optimize</li>
                <li><strong>Vision:</strong> Number of parent nodes to include as context</li>
                <li><strong>Range:</strong> Number of continuations to generate at each step</li>
                <li><strong>Depth:</strong> How many levels deep to explore</li>
              </ul>
            </div>

            <div>
              <p className="font-semibold text-sky-dark">Witness Agent</p>
              <p className="mb-2">Evaluates and prunes branches by deleting uninteresting nodes. Note: Witness works backward from where you place it, pruning ancestors rather than exploring forward.</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>Uses the same parameters as Scout</li>
                <li>Decides which branches to keep based on your instructions</li>
                <li>Helps narrow down large search spaces</li>
              </ul>
            </div>

            <div>
              <p className="font-semibold text-sky-dark">Campaign</p>
              <p className="mb-2">Combines Scout and Witness in cycles for automated exploration and pruning.</p>
              <ul className="list-disc ml-6 space-y-1">
                <li><strong>Cycles:</strong> Number of Scout→Witness rounds to run</li>
                <li><strong>Campaign Scout Instructions:</strong> What the Scout should explore</li>
                <li><strong>Campaign Witness Instructions:</strong> What the Witness should prune</li>
              </ul>
            </div>

            <div>
              <p className="font-semibold text-sky-dark">Trident Agent</p>
              <p className="mb-2">Creates multiple parallel exploration paths (prongs) that extend deeply with retry logic for finding promising nodes.</p>
              <ul className="list-disc ml-6 space-y-1">
                <li><strong>Prongs:</strong> Number of initial parallel branches to create (default: 3)</li>
                <li><strong>Tries:</strong> Number of retry attempts per node to find an expandable continuation (default: 3)</li>
                <li><strong>Depth:</strong> How deep each prong extends (default: 6)</li>
                <li>Each prong evaluates nodes and retries if culled, stopping when a good path is found</li>
              </ul>
            </div>

            <div>
              <p className="font-semibold text-sky-dark">Quick Invoke</p>
              <p>Assign button numbers (1-9) to agents, then press <kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">Ctrl + X</kbd> followed by the number to launch them quickly.</p>
            </div>
          </div>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-2">4. Copilot</h2>
          <div className="bg-white p-4 rounded-lg space-y-2 text-sm">
            <p>Copilot automatically decides whether to expand or cull nodes as they're created.</p>
            <ul className="list-disc ml-6 space-y-1">
              <li>Enable via the <strong>Copilot</strong> module</li>
              <li>Set instructions for what makes a node interesting</li>
              <li>Configure Vision, Range, and Depth parameters</li>
              <li>Copilot runs automatically when you expand nodes manually</li>
            </ul>
          </div>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-2">5. Other Features</h2>
          <div className="bg-white p-4 rounded-lg space-y-3 text-sm">
            <div>
              <p className="font-semibold">Tree Visualization</p>
              <p>Use the <strong>Tree</strong> or <strong>Graph</strong> modules to see your tree structure visually.</p>
            </div>
            <div>
              <p className="font-semibold">Actions</p>
              <p>The <strong>Actions</strong> module includes:</p>
              <ul className="list-disc ml-6 space-y-1 mt-1">
                <li><strong>Generate Prompt:</strong> Creates initial text for your tree's root node based on instructions.</li>
                <li><strong>Cull and Merge to Bookmarks:</strong> Removes all nodes not on a direct path to bookmarked nodes and performs mass merge, streamlining your tree to focus only on bookmarked branches.</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold">Mass Merge</p>
              <p>Press <kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">Ctrl + Shift + M</kbd> (Mac) or <kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">Alt + Shift + M</kbd> (Windows) to automatically merge all single-child chains throughout the tree into their parents, creating a cleaner structure.</p>
            </div>
            <div>
              <p className="font-semibold">Keyboard Shortcuts</p>
              <p>Click the <strong>?</strong> button in the ribbon above to see a complete list of all keyboard shortcuts.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default BottomPanel;
