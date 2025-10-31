import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';
import { exportTree, importTree, unrollTree, unrollTreeBranches } from '../utils/fileSystem';

const Header: React.FC = () => {
  const [showNewTreeDialog, setShowNewTreeDialog] = useState(false);
  const [newTreeName, setNewTreeName] = useState('');
  const [createError, setCreateError] = useState('');
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renameTreeName, setRenameTreeName] = useState('');
  const [renameError, setRenameError] = useState('');
  const [showExtractDialog, setShowExtractDialog] = useState(false);
  const [extractTreeName, setExtractTreeName] = useState('');
  const [extractError, setExtractError] = useState('');
  const [showUnrollDialog, setShowUnrollDialog] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showTreeButtons, setShowTreeButtons] = useState(true);
  const [currentTheme, setCurrentTheme] = useState(() => {
    return localStorage.getItem('theme') || 'default';
  });
  const deleteTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { trees, currentTree, selectTree, createTree, renameTree, deleteTree, extractSubtree, loadTreeList } = useStore();

  const themes = [
    { id: 'default', name: 'Sky' },
    { id: 'storm', name: 'Storm' },
    { id: 'dusk', name: 'Sunset' },
    { id: 'dawn', name: 'Sunrise' },
    { id: 'forest', name: 'Forest' },
    { id: 'nautical', name: 'Sea' },
    { id: 'arctic', name: 'Arctic' },
    { id: 'magic', name: 'Magic' },
  ];

  const handleThemeChange = (themeId: string) => {
    setCurrentTheme(themeId);
    if (themeId === 'default') {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'default');
    } else {
      document.documentElement.setAttribute('data-theme', themeId);
      localStorage.setItem('theme', themeId);
    }
  };

  const handleCreateTree = async () => {
    if (newTreeName.trim()) {
      try {
        await createTree(newTreeName.trim());
        setNewTreeName('');
        setCreateError('');
        setShowNewTreeDialog(false);
      } catch (error) {
        setCreateError(error instanceof Error ? error.message : 'Failed to create tree');
      }
    }
  };

  const handleRenameTree = async () => {
    if (renameTreeName.trim()) {
      try {
        await renameTree(renameTreeName.trim());
        setRenameTreeName('');
        setRenameError('');
        setShowRenameDialog(false);
      } catch (error) {
        setRenameError(error instanceof Error ? error.message : 'Failed to rename tree');
      }
    }
  };

  const handleExportTree = async () => {
    if (currentTree) {
      try {
        const filepath = await exportTree(currentTree);
        if (filepath) {
          alert(`Tree exported to ${filepath}`);
        }
        // If filepath is null, user cancelled - no need to show a message
      } catch (error) {
        console.error('Export error:', error);
        alert('Failed to export tree');
      }
    }
  };

  const handleUnrollTree = async (mode: 'all' | 'branches') => {
    if (currentTree) {
      try {
        const filepath = mode === 'all'
          ? await unrollTree(currentTree)
          : await unrollTreeBranches(currentTree);

        if (filepath) {
          alert(`Tree unrolled to ${filepath}`);
        }
        // If filepath is null, user cancelled - no need to show a message
        setShowUnrollDialog(false);
      } catch (error) {
        console.error('Unroll error:', error);
        alert('Failed to unroll tree');
        setShowUnrollDialog(false);
      }
    }
  };

  const handleImportTree = async () => {
    try {
      const tree = await importTree();
      if (tree) {
        await loadTreeList();
        await selectTree(tree.id);
        alert(`Tree "${tree.name}" imported successfully`);
      }
      // If tree is null, user cancelled - no need to show a message
    } catch (error) {
      console.error('Import error:', error);
      alert('Failed to import tree');
    }
  };

  const handleExtractSubtree = async () => {
    if (extractTreeName.trim()) {
      try {
        await extractSubtree(extractTreeName.trim());
        setExtractTreeName('');
        setExtractError('');
        setShowExtractDialog(false);
        alert(`Subtree extracted to "${extractTreeName.trim()}"`);
      } catch (error) {
        setExtractError(error instanceof Error ? error.message : 'Failed to extract subtree');
      }
    }
  };

  const handleDeleteClick = async () => {
    if (!currentTree) return;

    if (confirmingDelete) {
      // Second click - actually delete
      if (deleteTimeoutRef.current) {
        clearTimeout(deleteTimeoutRef.current);
      }
      try {
        await deleteTree(currentTree.id);
        setConfirmingDelete(false);
      } catch (error) {
        console.error('Delete error:', error);
        alert('Failed to delete tree');
      }
    } else {
      // First click - enter confirmation mode
      setConfirmingDelete(true);

      // Clear any existing timeout
      if (deleteTimeoutRef.current) {
        clearTimeout(deleteTimeoutRef.current);
      }

      // Reset after 3 seconds
      deleteTimeoutRef.current = setTimeout(() => {
        setConfirmingDelete(false);
      }, 3000);
    }
  };

  // Cleanup delete timeout on unmount
  useEffect(() => {
    return () => {
      if (deleteTimeoutRef.current) {
        clearTimeout(deleteTimeoutRef.current);
      }
    };
  }, []);

  // Collapsed ribbon
  if (isCollapsed) {
    return (
      <>
        <div
          className="h-2 bg-sky-light cursor-pointer hover:h-3 transition-all shadow-sm"
          onClick={() => setIsCollapsed(false)}
          title="Click to expand header"
        />
      </>
    );
  }

  // Full header
  return (
    <>
      <div className="h-10 bg-sky-light flex items-center px-4 gap-3 shadow-md">
        <div className="text-gray-800 font-semibold text-sm">Helm</div>

        <div className="flex items-center gap-2 flex-1">
          <button
            onClick={() => setShowTreeButtons(!showTreeButtons)}
            className="w-7 h-7 rounded bg-sky-accent text-gray-800 text-xs hover:bg-sky-light transition-colors shadow-sm flex items-center justify-center"
            title={showTreeButtons ? 'Hide tree buttons' : 'Show tree buttons'}
          >
            {showTreeButtons ? '<' : '>'}
          </button>

          <select
            className="px-3 py-1 rounded-lg bg-sky-accent text-gray-800 text-sm border-none focus:outline-none focus:ring-2 focus:ring-sky-dark hover:bg-sky-light transition-colors shadow-sm"
            value={currentTree?.id || ''}
            onChange={(e) => selectTree(e.target.value)}
          >
            <option value="">Select Tree</option>
            {trees.map((treeId) => (
              <option key={treeId} value={treeId}>
                {treeId}
              </option>
            ))}
          </select>

          {showTreeButtons && (
            <>
              <button
                onClick={() => setShowNewTreeDialog(true)}
                className="px-3 py-1 rounded-lg bg-sky-accent text-gray-800 text-sm hover:bg-sky-light transition-colors shadow-sm"
              >
                New Tree
              </button>

              <button
                onClick={() => {
                  setShowRenameDialog(true);
                  setRenameTreeName(currentTree?.name || '');
                }}
                disabled={!currentTree}
                className="px-3 py-1 rounded-lg bg-sky-accent text-gray-800 text-sm hover:bg-sky-light transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Rename Tree
              </button>

              <button
                onClick={handleImportTree}
                className="px-3 py-1 rounded-lg bg-sky-accent text-gray-800 text-sm hover:bg-sky-light transition-colors shadow-sm"
              >
                Import Tree
              </button>

              <button
                onClick={handleExportTree}
                disabled={!currentTree}
                className="px-3 py-1 rounded-lg bg-sky-accent text-gray-800 text-sm hover:bg-sky-light transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Export Tree
              </button>

              <button
                onClick={() => setShowUnrollDialog(true)}
                disabled={!currentTree}
                className="px-3 py-1 rounded-lg bg-sky-accent text-gray-800 text-sm hover:bg-sky-light transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Unroll Tree
              </button>

              <button
                onClick={() => setShowExtractDialog(true)}
                disabled={!currentTree}
                className="px-3 py-1 rounded-lg bg-sky-accent text-gray-800 text-sm hover:bg-sky-light transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Extract Subtree
              </button>

              <button
                onClick={handleDeleteClick}
                disabled={!currentTree}
                className={`px-3 py-1 rounded-lg text-sm transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                  confirmingDelete
                    ? 'bg-sky-medium hover:bg-sky-dark text-gray-800'
                    : 'bg-sky-accent hover:bg-sky-light text-gray-800'
                }`}
              >
                {confirmingDelete ? 'Are you sure?' : 'Delete Tree'}
              </button>
            </>
          )}
        </div>

        <select
          value={currentTheme}
          onChange={(e) => handleThemeChange(e.target.value)}
          className="px-2 py-1 rounded bg-sky-accent text-gray-800 text-xs hover:bg-sky-light transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-dark"
          title="Change color palette"
        >
          {themes.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {theme.name}
            </option>
          ))}
        </select>

        <button
          onClick={() => setIsCollapsed(true)}
          className="px-2 py-1 rounded bg-sky-accent text-gray-800 text-xs hover:bg-sky-light transition-colors shadow-sm"
          title="Collapse header"
        >
          ↑
        </button>
      </div>

      {showNewTreeDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-sky-light p-6 rounded-xl shadow-2xl w-80">
            <h3 className="text-lg font-semibold mb-4 text-gray-800">Create New Tree</h3>
            <input
              type="text"
              value={newTreeName}
              onChange={(e) => setNewTreeName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCreateTree()}
              placeholder="Tree name"
              className="w-full px-3 py-2 rounded-lg border border-sky-medium focus:outline-none focus:ring-2 focus:ring-sky-dark"
              autoFocus
            />
            {createError && (
              <div className="mt-2 text-red-600 text-sm">{createError}</div>
            )}
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleCreateTree}
                className="flex-1 px-4 py-2 rounded-lg bg-sky-dark text-white hover:bg-sky-medium transition-colors"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setShowNewTreeDialog(false);
                  setNewTreeName('');
                  setCreateError('');
                }}
                className="flex-1 px-4 py-2 rounded-lg bg-sky-accent text-gray-800 hover:bg-sky-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showRenameDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-sky-light p-6 rounded-xl shadow-2xl w-80">
            <h3 className="text-lg font-semibold mb-4 text-gray-800">Rename Tree</h3>
            <input
              type="text"
              value={renameTreeName}
              onChange={(e) => setRenameTreeName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleRenameTree()}
              placeholder="New tree name"
              className="w-full px-3 py-2 rounded-lg border border-sky-medium focus:outline-none focus:ring-2 focus:ring-sky-dark"
              autoFocus
            />
            {renameError && (
              <div className="mt-2 text-red-600 text-sm">{renameError}</div>
            )}
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleRenameTree}
                className="flex-1 px-4 py-2 rounded-lg bg-sky-dark text-white hover:bg-sky-medium transition-colors"
              >
                Rename
              </button>
              <button
                onClick={() => {
                  setShowRenameDialog(false);
                  setRenameTreeName('');
                  setRenameError('');
                }}
                className="flex-1 px-4 py-2 rounded-lg bg-sky-accent text-gray-800 hover:bg-sky-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showExtractDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-sky-light p-6 rounded-xl shadow-2xl w-80">
            <h3 className="text-lg font-semibold mb-4 text-gray-800">Extract Subtree</h3>
            <input
              type="text"
              value={extractTreeName}
              onChange={(e) => setExtractTreeName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleExtractSubtree()}
              placeholder="New tree name"
              className="w-full px-3 py-2 rounded-lg border border-sky-medium focus:outline-none focus:ring-2 focus:ring-sky-dark"
              autoFocus
            />
            {extractError && (
              <div className="mt-2 text-red-600 text-sm">{extractError}</div>
            )}
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleExtractSubtree}
                className="flex-1 px-4 py-2 rounded-lg bg-sky-dark text-white hover:bg-sky-medium transition-colors"
              >
                Extract
              </button>
              <button
                onClick={() => {
                  setShowExtractDialog(false);
                  setExtractTreeName('');
                  setExtractError('');
                }}
                className="flex-1 px-4 py-2 rounded-lg bg-sky-accent text-gray-800 hover:bg-sky-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showUnrollDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-sky-light p-6 rounded-xl shadow-2xl w-96">
            <h3 className="text-lg font-semibold mb-4 text-gray-800">Unroll Tree</h3>
            <p className="text-sm text-gray-700 mb-4">Choose how to export the tree:</p>

            <div className="space-y-3">
              <button
                onClick={() => handleUnrollTree('all')}
                className="w-full px-4 py-3 rounded-lg bg-white hover:bg-sky-accent transition-colors text-left border border-sky-medium"
              >
                <div className="font-semibold text-gray-800">All Nodes</div>
                <div className="text-xs text-gray-600 mt-1">
                  All nodes with full structure visualization
                </div>
              </button>

              <button
                onClick={() => handleUnrollTree('branches')}
                className="w-full px-4 py-3 rounded-lg bg-white hover:bg-sky-accent transition-colors text-left border border-sky-medium"
              >
                <div className="font-semibold text-gray-800">Leaf Branches</div>
                <div className="text-xs text-gray-600 mt-1">
                  Only leaf nodes, appended with all parents
                </div>
              </button>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowUnrollDialog(false)}
                className="flex-1 px-4 py-2 rounded-lg bg-sky-accent text-gray-800 hover:bg-sky-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Header;
