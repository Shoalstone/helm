import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../../store';
import {
  uploadTrainingFile,
  startFineTuneJob,
  checkJobStatus,
  cancelJob,
  listFineTunes,
  exportTrainingData,
  importTrainingData,
} from '../../utils/openai';

const Training: React.FC = () => {
  const { tuning, updateTuning, addTuningOutput } = useStore();
  const [confirmingClearData, setConfirmingClearData] = useState(false);
  const [renameFineTuneOldName, setRenameFineTuneOldName] = useState('');
  const [renameFineTuneNewName, setRenameFineTuneNewName] = useState('');
  const [deleteFineTuneName, setDeleteFineTuneName] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingCancelJob, setConfirmingCancelJob] = useState(false);
  const [statusResult, setStatusResult] = useState<string>('');
  const [fineTuningExpanded, setFineTuningExpanded] = useState(false);
  const clearDataTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const deleteTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cancelJobTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const statusOutputRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new outputs are added
  useEffect(() => {
    if (statusOutputRef.current) {
      statusOutputRef.current.scrollTop = statusOutputRef.current.scrollHeight;
    }
  }, [tuning.outputs]);

  const handleExportDecisions = async () => {
    try {
      const dataSource = tuning.externalDataSource
        ? await window.electronAPI.readFile(tuning.externalDataSource)
        : null;

      const dataToExport = dataSource
        ? await importTrainingData(dataSource)
        : tuning.trainingData;

      const jsonlContent = await exportTrainingData(dataToExport);

      const filePath = await window.electronAPI.showSaveDialog({
        defaultPath: 'training_data.jsonl',
        filters: [{ name: 'JSONL Files', extensions: ['jsonl'] }],
      });

      if (filePath) {
        await window.electronAPI.writeFile(filePath, jsonlContent);
        addTuningOutput(`Exported ${dataToExport.length} training entries to ${filePath}`);
      }
    } catch (error) {
      addTuningOutput(`Error exporting: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleSetDecisionSource = async () => {
    try {
      const filePath = await window.electronAPI.showOpenDialog({
        filters: [{ name: 'JSONL Files', extensions: ['jsonl'] }],
        properties: ['openFile'],
      });

      if (filePath) {
        updateTuning({ externalDataSource: filePath });
        addTuningOutput(`Set external data source to ${filePath}`);
      }
    } catch (error) {
      addTuningOutput(`Error setting source: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleRevertDecisionSource = () => {
    updateTuning({ externalDataSource: null });
    addTuningOutput('Reverted to local training data store');
  };

  const handleClearDecisionData = () => {
    if (confirmingClearData) {
      if (clearDataTimeoutRef.current) {
        clearTimeout(clearDataTimeoutRef.current);
      }
      updateTuning({ trainingData: [] });
      addTuningOutput('Cleared all local training data');
      setConfirmingClearData(false);
    } else {
      setConfirmingClearData(true);
      if (clearDataTimeoutRef.current) {
        clearTimeout(clearDataTimeoutRef.current);
      }
      clearDataTimeoutRef.current = setTimeout(() => {
        setConfirmingClearData(false);
      }, 3000);
    }
  };

  const handleUploadDecisions = async () => {
    if (!tuning.openaiApiKey) {
      addTuningOutput('Error: OpenAI API key is required');
      return;
    }

    try {
      addTuningOutput('Uploading training data...');

      const dataSource = tuning.externalDataSource
        ? await window.electronAPI.readFile(tuning.externalDataSource)
        : null;

      const dataToUpload = dataSource
        ? await importTrainingData(dataSource)
        : tuning.trainingData;

      if (dataToUpload.length === 0) {
        addTuningOutput('Error: No training data to upload');
        return;
      }

      const { fileId, status } = await uploadTrainingFile(tuning.openaiApiKey, dataToUpload, tuning.shuffleDecisions);

      updateTuning({ uploadedFileId: fileId, uploadStatus: status });
      addTuningOutput(`Upload successful! File ID: ${fileId}, Status: ${status}`);
    } catch (error) {
      addTuningOutput(`Upload failed: ${error instanceof Error ? error.message : String(error)}`);
      updateTuning({ uploadStatus: 'failed' });
    }
  };

  const handleBeginFineTuning = async () => {
    if (!tuning.openaiApiKey) {
      addTuningOutput('Error: OpenAI API key is required');
      return;
    }

    if (!tuning.uploadedFileId) {
      addTuningOutput('Error: Must upload training data first');
      return;
    }

    try {
      addTuningOutput('Starting fine-tuning job...');

      // Get dataset size from training data or external source for display
      const dataSource = tuning.externalDataSource
        ? await window.electronAPI.readFile(tuning.externalDataSource)
        : null;

      const dataToUse = dataSource
        ? await importTrainingData(dataSource)
        : tuning.trainingData;

      const datasetSize = dataToUse.length;

      const { jobId, status } = await startFineTuneJob(
        tuning.openaiApiKey,
        tuning.uploadedFileId,
        tuning.epochs,
        tuning.batchSize,
        tuning.learningRate
      );

      updateTuning({ currentJobId: jobId });
      addTuningOutput(`Fine-tuning job started! Job ID: ${jobId}, Status: ${status}`);
      addTuningOutput(`Dataset: ${datasetSize} examples | Epochs: ${tuning.epochs} | Batch size: ${tuning.batchSize} | Learning rate: ${tuning.learningRate}`);
    } catch (error) {
      addTuningOutput(`Failed to start job: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleCheckStatus = async () => {
    if (!tuning.openaiApiKey) {
      setStatusResult('Error: OpenAI API key is required');
      return;
    }

    if (!tuning.currentJobId) {
      setStatusResult('Error: No active job');
      return;
    }

    try {
      const { status, fineTunedModel } = await checkJobStatus(tuning.openaiApiKey, tuning.currentJobId);

      const result = `Job status: ${status}${fineTunedModel ? `, Model: ${fineTunedModel}` : ''}`;
      setStatusResult(result);
      addTuningOutput(result);
    } catch (error) {
      const errorMsg = `Failed to check status: ${error instanceof Error ? error.message : String(error)}`;
      setStatusResult(errorMsg);
      addTuningOutput(errorMsg);
    }
  };

  const handleCancelJob = async () => {
    if (!confirmingCancelJob) {
      setConfirmingCancelJob(true);
      if (cancelJobTimeoutRef.current) {
        clearTimeout(cancelJobTimeoutRef.current);
      }
      cancelJobTimeoutRef.current = setTimeout(() => {
        setConfirmingCancelJob(false);
      }, 3000);
      return;
    }

    // Clear confirmation timeout
    if (cancelJobTimeoutRef.current) {
      clearTimeout(cancelJobTimeoutRef.current);
    }
    setConfirmingCancelJob(false);

    if (!tuning.openaiApiKey) {
      addTuningOutput('Error: OpenAI API key is required');
      return;
    }

    if (!tuning.currentJobId) {
      addTuningOutput('Error: No active job');
      return;
    }

    try {
      // Check status first to see if job can be cancelled
      const { status } = await checkJobStatus(tuning.openaiApiKey, tuning.currentJobId);

      // If job is already in a terminal state (failed, succeeded, cancelled), just clear it
      if (status === 'failed' || status === 'succeeded' || status === 'cancelled') {
        addTuningOutput(`Job is already ${status}. Clearing from active jobs.`);
        updateTuning({ currentJobId: null });
        return;
      }

      // Otherwise, attempt to cancel it
      const cancelResult = await cancelJob(tuning.openaiApiKey, tuning.currentJobId);
      addTuningOutput(`Job cancelled. Status: ${cancelResult.status}`);
      updateTuning({ currentJobId: null });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      // Even if cancel fails, clear the job from state so user isn't stuck
      addTuningOutput(`Failed to cancel job: ${errorMsg}. Clearing from active jobs.`);
      updateTuning({ currentJobId: null });
    }
  };

  const handleFinishJob = async () => {
    if (!tuning.openaiApiKey) {
      addTuningOutput('Error: OpenAI API key is required');
      return;
    }

    if (!tuning.currentJobId) {
      addTuningOutput('Error: No active job');
      return;
    }

    if (!tuning.fineTunedModelName.trim()) {
      addTuningOutput('Error: Please enter a custom name for the fine-tuned model');
      return;
    }

    try {
      const { status, fineTunedModel } = await checkJobStatus(tuning.openaiApiKey, tuning.currentJobId);

      if (status !== 'succeeded' || !fineTunedModel) {
        addTuningOutput(`Job not complete yet. Status: ${status}`);
        return;
      }

      const newFineTune = {
        customName: tuning.fineTunedModelName.trim(),
        officialName: fineTunedModel,
      };

      const updatedFineTunes = [...tuning.fineTunes, newFineTune];
      updateTuning({
        fineTunes: updatedFineTunes,
        currentJobId: null,
        fineTunedModelName: '',
      });

      addTuningOutput(`Fine-tune complete! Saved as "${newFineTune.customName}"`);
      addTuningOutput(`Official model name: ${fineTunedModel}`);
    } catch (error) {
      addTuningOutput(`Failed to finish job: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleRefreshFineTunes = async () => {
    if (!tuning.openaiApiKey) {
      addTuningOutput('Error: OpenAI API key is required');
      return;
    }

    try {
      addTuningOutput('Fetching fine-tunes from OpenAI...');
      const fineTunes = await listFineTunes(tuning.openaiApiKey);

      // Merge with existing custom names
      const merged = fineTunes.map((ft) => {
        const existing = tuning.fineTunes.find((t) => t.officialName === ft.officialName);
        return existing || ft;
      });

      updateTuning({ fineTunes: merged });
      addTuningOutput(`Loaded ${merged.length} fine-tuned models`);
    } catch (error) {
      addTuningOutput(`Failed to fetch fine-tunes: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleRenameFineTune = () => {
    const trimmedOldName = renameFineTuneOldName.trim();
    const trimmedNewName = renameFineTuneNewName.trim();
    if (!trimmedOldName || !trimmedNewName) return;

    const fineTuneToRename = tuning.fineTunes.find((ft) => ft.customName === trimmedOldName);
    if (!fineTuneToRename) {
      addTuningOutput(`Error: Fine-tune "${trimmedOldName}" not found`);
      return;
    }

    const updatedFineTunes = tuning.fineTunes.map((ft) =>
      ft.customName === trimmedOldName ? { ...ft, customName: trimmedNewName } : ft
    );
    updateTuning({ fineTunes: updatedFineTunes });
    addTuningOutput(`Renamed "${trimmedOldName}" to "${trimmedNewName}"`);
    setRenameFineTuneOldName('');
    setRenameFineTuneNewName('');
  };

  const handleDeleteFineTune = () => {
    const trimmedName = deleteFineTuneName.trim();
    if (!trimmedName) return;

    if (confirmingDelete) {
      if (deleteTimeoutRef.current) {
        clearTimeout(deleteTimeoutRef.current);
      }

      const updatedFineTunes = tuning.fineTunes.filter((ft) => ft.customName !== trimmedName);
      updateTuning({ fineTunes: updatedFineTunes });
      addTuningOutput(`Removed "${trimmedName}" from list (still exists on OpenAI account)`);
      setDeleteFineTuneName('');
      setConfirmingDelete(false);
    } else {
      setConfirmingDelete(true);
      if (deleteTimeoutRef.current) {
        clearTimeout(deleteTimeoutRef.current);
      }
      deleteTimeoutRef.current = setTimeout(() => {
        setConfirmingDelete(false);
      }, 3000);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clearDataTimeoutRef.current) {
        clearTimeout(clearDataTimeoutRef.current);
      }
      if (deleteTimeoutRef.current) {
        clearTimeout(deleteTimeoutRef.current);
      }
      if (cancelJobTimeoutRef.current) {
        clearTimeout(cancelJobTimeoutRef.current);
      }
    };
  }, []);

  const currentDataCount = tuning.externalDataSource ? '(external)' : tuning.trainingData.length;

  return (
    <div className="h-full flex flex-col bg-sky-light overflow-y-auto">
      <div className="p-3">
        <h3 className="text-sm font-semibold mb-3 text-gray-800">Training</h3>

        {/* Status Output Window */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
          <div
            ref={statusOutputRef}
            className="w-full h-20 px-2 py-2 text-xs rounded border border-sky-medium bg-white overflow-y-auto font-mono"
          >
            {tuning.outputs.length === 0 ? (
              <div className="text-gray-400">Status messages will appear here...</div>
            ) : (
              tuning.outputs.slice(-3).map((output, i) => (
                <div key={i} className="mb-1">
                  {output}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Capture Decisions Toggle */}
        <div className="mb-4 p-3 bg-white rounded-lg">
          <label className="flex items-center text-xs font-medium text-gray-700">
            <input
              type="checkbox"
              checked={tuning.captureDecisions}
              onChange={(e) => updateTuning({ captureDecisions: e.target.checked })}
              className="mr-2"
            />
            Capture Decisions
          </label>
          <p className="text-xs text-gray-500 mt-1">
            Captures when you expand or cull a node that you haven't yet expanded.
          </p>
          <p className="text-xs text-gray-600 mt-1">
            Current data: {currentDataCount} entries
          </p>

          <div className="mt-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">Context Depth</label>
            <input
              type="number"
              min="1"
              max="20"
              value={tuning.contextDepth}
              onChange={(e) => updateTuning({ contextDepth: parseInt(e.target.value) || 1 })}
              className="w-full px-2 py-1 text-xs rounded border border-sky-medium focus:outline-none focus:ring-2 focus:ring-sky-dark"
            />
            <p className="text-xs text-gray-500 mt-1">Number of parent nodes to include as context</p>
          </div>

          <div className="mt-3">
            <label className="flex items-center text-xs font-medium text-gray-700">
              <input
                type="checkbox"
                checked={tuning.captureSiblingPreference}
                onChange={(e) => updateTuning({ captureSiblingPreference: e.target.checked })}
                className="mr-2"
              />
              Capture Sibling Preference
            </label>
            <p className="text-xs text-gray-500 mt-1">
              Captures when you expand a node when none of its siblings have been expanded; records it as the best continuation.
            </p>
          </div>
        </div>

        {/* Data Management Buttons */}
        <div className="mb-4 space-y-2">
          <button
            onClick={handleExportDecisions}
            className="w-full px-3 py-2 text-xs rounded bg-sky-medium hover:bg-sky-dark text-gray-800 transition-colors shadow-sm"
          >
            Export Decisions
          </button>
          <p className="text-xs text-gray-500 px-1">Exports decision data to an external file.</p>

          <button
            onClick={handleSetDecisionSource}
            className="w-full px-3 py-2 text-xs rounded bg-sky-medium hover:bg-sky-dark text-gray-800 transition-colors shadow-sm"
          >
            Set Decision Source
          </button>
          <p className="text-xs text-gray-500 px-1">Sets the source of decision data to an external file.</p>
          {tuning.externalDataSource && (
            <p className="text-xs text-gray-600 px-1 truncate">Current: {tuning.externalDataSource}</p>
          )}

          <button
            onClick={handleRevertDecisionSource}
            disabled={!tuning.externalDataSource}
            className="w-full px-3 py-2 text-xs rounded bg-sky-medium hover:bg-sky-dark text-gray-800 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Revert Decision Source
          </button>
          <p className="text-xs text-gray-500 px-1">
            Sets the source of decision data to the local store instead of an external file.
          </p>

          <button
            onClick={handleClearDecisionData}
            disabled={tuning.trainingData.length === 0}
            className={`w-full px-3 py-2 text-xs rounded transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${
              confirmingClearData
                ? 'bg-sky-medium hover:bg-sky-dark text-gray-800'
                : 'bg-sky-accent hover:bg-sky-light text-gray-800'
            }`}
          >
            {confirmingClearData ? 'Are you sure?' : 'Clear Decision Data'}
          </button>
          <p className="text-xs text-gray-500 px-1">Clears all locally stored decision data.</p>
        </div>

        {/* Fine-Tuning Dropdown */}
        <div className="mb-4">
          <button
            onClick={() => setFineTuningExpanded(!fineTuningExpanded)}
            className="w-full flex items-center justify-between px-3 py-2 bg-sky-medium rounded-lg hover:bg-sky-dark transition-colors"
          >
            <span className="text-sm font-medium text-gray-800">Fine-Tuning</span>
            <span className="text-gray-600">{fineTuningExpanded ? '▼' : '▶'}</span>
          </button>

          {fineTuningExpanded && (
            <div className="mt-2 p-3 bg-white rounded-lg border border-sky-medium">
              {/* OpenAI API Key */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-700 mb-1">OpenAI API Key</label>
                <input
                  type="password"
                  value={tuning.openaiApiKey}
                  onChange={(e) => updateTuning({ openaiApiKey: e.target.value })}
                  className="w-full px-2 py-1 text-xs rounded border border-sky-medium focus:outline-none focus:ring-2 focus:ring-sky-dark"
                  placeholder="sk-..."
                />
              </div>

              {/* Training Parameters */}
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <h4 className="text-xs font-semibold text-gray-800 mb-2">Training Parameters</h4>

                <div className="mb-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Epochs</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={tuning.epochs}
                    onChange={(e) => updateTuning({ epochs: parseInt(e.target.value) || 1 })}
                    className="w-full px-2 py-1 text-xs rounded border border-sky-medium focus:outline-none focus:ring-2 focus:ring-sky-dark"
                  />
                  <p className="text-xs text-gray-500 mt-1">Number of training epochs</p>
                </div>

                <div className="mb-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Batch Size</label>
                  <input
                    type="number"
                    min="1"
                    max="256"
                    value={tuning.batchSize}
                    onChange={(e) => updateTuning({ batchSize: parseInt(e.target.value) || 1 })}
                    className="w-full px-2 py-1 text-xs rounded border border-sky-medium focus:outline-none focus:ring-2 focus:ring-sky-dark"
                  />
                  <p className="text-xs text-gray-500 mt-1">Training batch size</p>
                </div>

                <div className="mb-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Learning Rate</label>
                  <input
                    type="text"
                    value={tuning.learningRate}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'auto') {
                        updateTuning({ learningRate: 'auto' });
                      } else {
                        const num = parseFloat(val);
                        if (!isNaN(num)) {
                          updateTuning({ learningRate: num });
                        }
                      }
                    }}
                    className="w-full px-2 py-1 text-xs rounded border border-sky-medium focus:outline-none focus:ring-2 focus:ring-sky-dark"
                    placeholder="auto or number (e.g., 0.5)"
                  />
                  <p className="text-xs text-gray-500 mt-1">Learning rate multiplier (use 'auto' for automatic)</p>
                </div>
              </div>

              {/* Fine-Tuned Model Name */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Fine-Tuned Model Name
                </label>
                <input
                  type="text"
                  value={tuning.fineTunedModelName}
                  onChange={(e) => updateTuning({ fineTunedModelName: e.target.value })}
                  className="w-full px-2 py-1 text-xs rounded border border-sky-medium focus:outline-none focus:ring-2 focus:ring-sky-dark"
                  placeholder="my-custom-model"
                />
              </div>

              {/* Fine-Tunes List */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-gray-700">Existing Fine-Tunes</label>
                  <button
                    onClick={handleRefreshFineTunes}
                    className="px-2 py-1 text-xs rounded bg-sky-medium hover:bg-sky-dark text-gray-800 transition-colors shadow-sm"
                  >
                    Refresh
                  </button>
                </div>
                <div className="max-h-32 overflow-y-auto border border-sky-medium rounded bg-white">
                  {tuning.fineTunes.length === 0 ? (
                    <div className="p-2 text-xs text-gray-400">No fine-tunes loaded</div>
                  ) : (
                    tuning.fineTunes.map((ft, i) => (
                      <div key={i} className="p-2 text-xs border-b border-gray-100 last:border-b-0">
                        <div className="font-medium text-gray-800">{ft.customName}</div>
                        <div className="text-gray-500 truncate text-[10px]">{ft.officialName}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Rename Fine-Tune */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-700 mb-1">Rename Fine-Tune</label>
                <input
                  type="text"
                  value={renameFineTuneOldName}
                  onChange={(e) => setRenameFineTuneOldName(e.target.value)}
                  className="w-full px-2 py-1 text-xs rounded border border-sky-medium focus:outline-none focus:ring-2 focus:ring-sky-dark mb-2"
                  placeholder="Current name"
                />
                <input
                  type="text"
                  value={renameFineTuneNewName}
                  onChange={(e) => setRenameFineTuneNewName(e.target.value)}
                  className="w-full px-2 py-1 text-xs rounded border border-sky-medium focus:outline-none focus:ring-2 focus:ring-sky-dark mb-2"
                  placeholder="New name"
                />
                <button
                  onClick={handleRenameFineTune}
                  disabled={!renameFineTuneOldName.trim() || !renameFineTuneNewName.trim()}
                  className="w-full px-3 py-1 text-xs rounded bg-sky-medium hover:bg-sky-dark text-gray-800 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Rename
                </button>
                <p className="text-xs text-gray-500 mt-1">Only renames locally; official name unchanged.</p>
              </div>

              {/* Delete Fine-Tune */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-700 mb-1">Delete Fine-Tune</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={deleteFineTuneName}
                    onChange={(e) => setDeleteFineTuneName(e.target.value)}
                    className="flex-1 px-2 py-1 text-xs rounded border border-sky-medium focus:outline-none focus:ring-2 focus:ring-sky-dark"
                    placeholder="Custom name to delete"
                  />
                  <button
                    onClick={handleDeleteFineTune}
                    disabled={!deleteFineTuneName.trim()}
                    className={`px-3 py-1 text-xs rounded transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                      confirmingDelete
                        ? 'bg-sky-medium hover:bg-sky-dark text-gray-800'
                        : 'bg-sky-accent hover:bg-sky-light text-gray-800'
                    }`}
                  >
                    {confirmingDelete ? 'Confirm?' : 'Delete'}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">Only deletes from list; remains on account.</p>
              </div>

              {/* Upload Decisions */}
              <div className="mb-4">
                <button
                  onClick={handleUploadDecisions}
                  disabled={!tuning.openaiApiKey}
                  className="w-full px-3 py-2 text-xs rounded bg-sky-medium hover:bg-sky-dark text-gray-800 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Upload Decisions
                </button>
                {tuning.uploadStatus && (
                  <p className="text-xs text-gray-600 mt-1">Upload Status: {tuning.uploadStatus}</p>
                )}
                {tuning.uploadedFileId && (
                  <p className="text-xs text-gray-600 mt-1 truncate">File ID: {tuning.uploadedFileId}</p>
                )}

                <div className="mt-3">
                  <label className="flex items-center text-xs font-medium text-gray-700">
                    <input
                      type="checkbox"
                      checked={tuning.shuffleDecisions}
                      onChange={(e) => updateTuning({ shuffleDecisions: e.target.checked })}
                      className="mr-2"
                    />
                    Shuffle Decisions
                  </label>
                  <p className="text-xs text-gray-500 mt-1">
                    Prevents the model from focusing on the order you made the decisions.
                  </p>
                </div>
              </div>

              {/* Fine-Tuning Job Controls */}
              <div className="mb-4 space-y-2">
                <p className="text-xs text-gray-500 px-1 mb-2">
                  Fine-tuning can be expensive with large training runs; if you're new, don't put a lot of money in your account. Try starting with 300 decisions. Keep epochs low to prevent overfitting.
                </p>
                <button
                  onClick={handleBeginFineTuning}
                  disabled={!tuning.openaiApiKey || !tuning.uploadedFileId}
                  className="w-full px-3 py-2 text-xs rounded bg-sky-medium hover:bg-sky-dark text-gray-800 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Begin Fine-Tuning
                </button>

                <button
                  onClick={handleCheckStatus}
                  disabled={!tuning.openaiApiKey || !tuning.currentJobId}
                  className="w-full px-3 py-2 text-xs rounded bg-sky-medium hover:bg-sky-dark text-gray-800 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Check Status
                </button>
                {statusResult && (
                  <p className="text-xs text-gray-600 px-1">{statusResult}</p>
                )}

                <button
                  onClick={handleCancelJob}
                  disabled={!tuning.openaiApiKey || !tuning.currentJobId}
                  className={`w-full px-3 py-2 text-xs rounded transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                    confirmingCancelJob
                      ? 'bg-sky-medium hover:bg-sky-dark text-gray-800'
                      : 'bg-sky-accent hover:bg-sky-light text-gray-800'
                  }`}
                >
                  {confirmingCancelJob ? 'Are you sure?' : 'Cancel Job'}
                </button>

                <button
                  onClick={handleFinishJob}
                  disabled={!tuning.openaiApiKey || !tuning.currentJobId || !tuning.fineTunedModelName.trim()}
                  className="w-full px-3 py-2 text-xs rounded bg-sky-medium hover:bg-sky-dark text-gray-800 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Finish Job
                </button>
                {tuning.currentJobId && (
                  <p className="text-xs text-gray-600 px-1 truncate">Current Job: {tuning.currentJobId}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Training;
