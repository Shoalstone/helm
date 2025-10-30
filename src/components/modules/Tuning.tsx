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

const Tuning: React.FC = () => {
  const { tuning, updateTuning, addTuningOutput } = useStore();
  const [confirmingClearData, setConfirmingClearData] = useState(false);
  const [deleteFineTuneName, setDeleteFineTuneName] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const clearDataTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const deleteTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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

      const { fileId, status } = await uploadTrainingFile(tuning.openaiApiKey, dataToUpload);

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

      // Get dataset size from training data or external source
      const dataSource = tuning.externalDataSource
        ? await window.electronAPI.readFile(tuning.externalDataSource)
        : null;

      const dataToUse = dataSource
        ? await importTrainingData(dataSource)
        : tuning.trainingData;

      const datasetSize = dataToUse.length;

      const { jobId, status } = await startFineTuneJob(tuning.openaiApiKey, tuning.uploadedFileId, datasetSize);

      const batchSize = Math.max(1, Math.floor(datasetSize * 0.2));
      updateTuning({ currentJobId: jobId });
      addTuningOutput(`Fine-tuning job started! Job ID: ${jobId}, Status: ${status}`);
      addTuningOutput(`Hyperparameters: 10 epochs, batch size: ${batchSize} (20% of ${datasetSize} entries)`);
    } catch (error) {
      addTuningOutput(`Failed to start job: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleCheckStatus = async () => {
    if (!tuning.openaiApiKey) {
      addTuningOutput('Error: OpenAI API key is required');
      return;
    }

    if (!tuning.currentJobId) {
      addTuningOutput('Error: No active job');
      return;
    }

    try {
      const { status, fineTunedModel } = await checkJobStatus(tuning.openaiApiKey, tuning.currentJobId);

      addTuningOutput(`Job status: ${status}${fineTunedModel ? `, Model: ${fineTunedModel}` : ''}`);
    } catch (error) {
      addTuningOutput(`Failed to check status: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleCancelJob = async () => {
    if (!tuning.openaiApiKey) {
      addTuningOutput('Error: OpenAI API key is required');
      return;
    }

    if (!tuning.currentJobId) {
      addTuningOutput('Error: No active job');
      return;
    }

    try {
      const { status } = await cancelJob(tuning.openaiApiKey, tuning.currentJobId);

      addTuningOutput(`Job cancelled. Status: ${status}`);
      updateTuning({ currentJobId: null });
    } catch (error) {
      addTuningOutput(`Failed to cancel job: ${error instanceof Error ? error.message : String(error)}`);
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
    };
  }, []);

  const currentDataCount = tuning.externalDataSource ? '(external)' : tuning.trainingData.length;

  return (
    <div className="h-full flex flex-col bg-sky-light overflow-y-auto">
      <div className="p-3">
        <h3 className="text-sm font-semibold mb-3 text-gray-800">Fine-Tuning</h3>

        {/* Status Output Window */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
          <div
            ref={statusOutputRef}
            className="w-full h-32 px-2 py-2 text-xs rounded border border-sky-medium bg-white overflow-y-auto font-mono"
          >
            {tuning.outputs.length === 0 ? (
              <div className="text-gray-400">Status messages will appear here...</div>
            ) : (
              tuning.outputs.map((output, i) => (
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
            Captures when you expand or cull a node. For best results, turn this off before you cull nodes
            you've expanded with it on, to avoid contradiction.
          </p>
          <p className="text-xs text-gray-600 mt-1">
            Current data: {currentDataCount} entries
          </p>
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

        {/* Fine-Tuned Model Name */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Custom Fine-Tuned Model Name
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
        </div>

        {/* Fine-Tuning Job Controls */}
        <div className="mb-4 space-y-2">
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

          <button
            onClick={handleCancelJob}
            disabled={!tuning.openaiApiKey || !tuning.currentJobId}
            className="w-full px-3 py-2 text-xs rounded bg-sky-accent hover:bg-sky-light text-gray-800 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel Job
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
    </div>
  );
};

export default Tuning;
