import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../../store';

const Settings: React.FC = () => {
  const { settings, updateSettings, tuning, currentTree, getTreeSettingsMode, setTreeSettingsMode } = useStore();
  const [expandedSection, setExpandedSection] = useState<string | null>('continuations');
  const [confirmingClearContinuations, setConfirmingClearContinuations] = useState(false);
  const [confirmingClearAssistant, setConfirmingClearAssistant] = useState(false);
  const clearContinuationsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const clearAssistantTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const settingsMode = getTreeSettingsMode();

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const handleStoreInMemoryContinuations = () => {
    const currentModel = settings.continuations.modelName.trim();
    if (!currentModel) return;

    const savedModels = settings.continuations.savedModels || [];
    if (!savedModels.includes(currentModel)) {
      updateSettings({
        continuations: {
          ...settings.continuations,
          savedModels: [...savedModels, currentModel],
        },
      });
    }
  };

  const handleStoreInMemoryAssistant = () => {
    const currentModel = settings.assistant.modelName.trim();
    if (!currentModel) return;

    const savedModels = settings.assistant.savedModels || [];
    if (!savedModels.includes(currentModel)) {
      updateSettings({
        assistant: {
          ...settings.assistant,
          savedModels: [...savedModels, currentModel],
        },
      });
    }
  };

  const handleClearMemoryContinuations = () => {
    if (confirmingClearContinuations) {
      // Second click - actually clear
      if (clearContinuationsTimeoutRef.current) {
        clearTimeout(clearContinuationsTimeoutRef.current);
      }
      updateSettings({
        continuations: {
          ...settings.continuations,
          savedModels: [],
        },
      });
      setConfirmingClearContinuations(false);
    } else {
      // First click - enter confirmation mode
      setConfirmingClearContinuations(true);

      if (clearContinuationsTimeoutRef.current) {
        clearTimeout(clearContinuationsTimeoutRef.current);
      }

      // Reset after 3 seconds
      clearContinuationsTimeoutRef.current = setTimeout(() => {
        setConfirmingClearContinuations(false);
      }, 3000);
    }
  };

  const handleClearMemoryAssistant = () => {
    if (confirmingClearAssistant) {
      // Second click - actually clear
      if (clearAssistantTimeoutRef.current) {
        clearTimeout(clearAssistantTimeoutRef.current);
      }
      updateSettings({
        assistant: {
          ...settings.assistant,
          savedModels: [],
        },
      });
      setConfirmingClearAssistant(false);
    } else {
      // First click - enter confirmation mode
      setConfirmingClearAssistant(true);

      if (clearAssistantTimeoutRef.current) {
        clearTimeout(clearAssistantTimeoutRef.current);
      }

      // Reset after 3 seconds
      clearAssistantTimeoutRef.current = setTimeout(() => {
        setConfirmingClearAssistant(false);
      }, 3000);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clearContinuationsTimeoutRef.current) {
        clearTimeout(clearContinuationsTimeoutRef.current);
      }
      if (clearAssistantTimeoutRef.current) {
        clearTimeout(clearAssistantTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="h-full flex flex-col bg-sky-light overflow-y-auto">
      <div className="p-3">
        <h3 className="text-sm font-semibold mb-3 text-gray-800">Settings</h3>

        {/* Settings Mode Toggle */}
        {currentTree && (
          <div className="mb-4">
            <div className="flex flex-col gap-2">
              <label className="flex items-center text-xs text-gray-700 cursor-pointer">
                <input
                  type="radio"
                  name="settings-mode"
                  checked={settingsMode === 'global'}
                  onChange={() => setTreeSettingsMode('global')}
                  className="mr-2"
                />
                Global Settings
              </label>
              <label className="flex items-center text-xs text-gray-700 cursor-pointer">
                <input
                  type="radio"
                  name="settings-mode"
                  checked={settingsMode === 'tree-specific'}
                  onChange={() => setTreeSettingsMode('tree-specific')}
                  className="mr-2"
                />
                Tree-Specific Settings
              </label>
            </div>
          </div>
        )}

        {/* API Key */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            OpenRouter API Key
          </label>
          <input
            type="password"
            value={settings.apiKey}
            onChange={(e) => updateSettings({ apiKey: e.target.value })}
            className="w-full px-2 py-1 text-xs rounded border border-sky-medium focus:outline-none focus:ring-2 focus:ring-sky-dark"
            placeholder="sk-..."
          />
        </div>

        {/* Continuations Settings */}
        <div className="mb-2">
          <button
            onClick={() => toggleSection('continuations')}
            className="w-full flex items-center justify-between px-3 py-2 bg-sky-medium rounded-lg hover:bg-sky-dark transition-colors"
          >
            <span className="text-sm font-medium text-gray-800">Continuations</span>
            <span className="text-gray-600">{expandedSection === 'continuations' ? '▼' : '▶'}</span>
          </button>

          {expandedSection === 'continuations' && (
            <div className="mt-2 p-3 bg-white rounded-lg space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Model Name</label>
                <input
                  type="text"
                  value={settings.continuations.modelName}
                  onChange={(e) =>
                    updateSettings({
                      continuations: { ...settings.continuations, modelName: e.target.value },
                    })
                  }
                  className="w-full px-2 py-1 text-xs rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-sky-dark"
                />

                {/* Store in Memory and Clear Memory buttons */}
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleStoreInMemoryContinuations}
                    disabled={!settings.continuations.modelName.trim()}
                    className="px-2 py-1 text-xs rounded bg-sky-medium hover:bg-sky-dark text-gray-800 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Store in Memory
                  </button>
                  <button
                    onClick={handleClearMemoryContinuations}
                    disabled={!settings.continuations.savedModels || settings.continuations.savedModels.length === 0}
                    className={`px-2 py-1 text-xs rounded transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                      confirmingClearContinuations
                        ? 'bg-sky-medium hover:bg-sky-dark text-gray-800'
                        : 'bg-sky-accent hover:bg-sky-light text-gray-800'
                    }`}
                  >
                    {confirmingClearContinuations ? 'Are you sure?' : 'Clear Memory'}
                  </button>
                </div>

                {/* Dropdown for saved models */}
                {settings.continuations.savedModels && settings.continuations.savedModels.length > 0 && (
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        updateSettings({
                          continuations: { ...settings.continuations, modelName: e.target.value },
                        });
                      }
                    }}
                    className="w-full px-2 py-1 text-xs rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-sky-dark mt-2"
                  >
                    <option value="">Select a saved model...</option>
                    {settings.continuations.savedModels.map((model, index) => (
                      <option key={index} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Branching Factor
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={settings.continuations.branchingFactor}
                  onChange={(e) =>
                    updateSettings({
                      continuations: {
                        ...settings.continuations,
                        branchingFactor: parseInt(e.target.value),
                      },
                    })
                  }
                  className="w-full px-2 py-1 text-xs rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-sky-dark"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Temperature</label>
                <input
                  type="number"
                  min="0"
                  max="2"
                  step="0.1"
                  value={settings.continuations.temperature}
                  onChange={(e) =>
                    updateSettings({
                      continuations: {
                        ...settings.continuations,
                        temperature: parseFloat(e.target.value),
                      },
                    })
                  }
                  className="w-full px-2 py-1 text-xs rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-sky-dark"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Top P</label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.continuations.topP}
                  onChange={(e) =>
                    updateSettings({
                      continuations: { ...settings.continuations, topP: parseFloat(e.target.value) },
                    })
                  }
                  className="w-full px-2 py-1 text-xs rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-sky-dark"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Max Tokens</label>
                <input
                  type="number"
                  min="1"
                  max="4000"
                  value={settings.continuations.maxTokens}
                  onChange={(e) =>
                    updateSettings({
                      continuations: {
                        ...settings.continuations,
                        maxTokens: parseInt(e.target.value),
                      },
                    })
                  }
                  className="w-full px-2 py-1 text-xs rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-sky-dark"
                />
              </div>

              <div>
                <label className="flex items-center text-xs font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={settings.continuations.assistantMode ?? false}
                    onChange={(e) =>
                      updateSettings({
                        continuations: {
                          ...settings.continuations,
                          assistantMode: e.target.checked,
                        },
                      })
                    }
                    className="mr-2"
                  />
                  Assistant Mode
                </label>
              </div>

              <div>
                <label className="flex items-center text-xs font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={settings.continuations.useCustomEndpoint ?? false}
                    onChange={(e) =>
                      updateSettings({
                        continuations: {
                          ...settings.continuations,
                          useCustomEndpoint: e.target.checked,
                        },
                      })
                    }
                    className="mr-2"
                  />
                  Use Custom Endpoint
                </label>
                {settings.continuations.useCustomEndpoint && (
                  <div className="mt-2 ml-5">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Full Endpoint URL</label>
                    <input
                      type="text"
                      value={settings.continuations.customBaseUrl ?? ''}
                      onChange={(e) =>
                        updateSettings({
                          continuations: {
                            ...settings.continuations,
                            customBaseUrl: e.target.value,
                          },
                        })
                      }
                      className="w-full px-2 py-1 text-xs rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-sky-dark"
                      placeholder="http://localhost:8000/v1/chat/completions"
                    />

                    <label className="block text-xs font-medium text-gray-700 mb-1 mt-3">API Key</label>
                    <input
                      type="password"
                      value={settings.continuations.customApiKey ?? ''}
                      onChange={(e) =>
                        updateSettings({
                          continuations: {
                            ...settings.continuations,
                            customApiKey: e.target.value,
                          },
                        })
                      }
                      className="w-full px-2 py-1 text-xs rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-sky-dark"
                      placeholder="Optional API key for custom endpoint"
                    />

                    <label className="block text-xs font-medium text-gray-700 mb-1 mt-3">Request Format</label>
                    <div className="flex flex-col gap-1">
                      <label className="flex items-center text-xs text-gray-700">
                        <input
                          type="radio"
                          name="continuations-format"
                          checked={(settings.continuations.customEndpointFormat ?? 'openai') === 'openai'}
                          onChange={() =>
                            updateSettings({
                              continuations: {
                                ...settings.continuations,
                                customEndpointFormat: 'openai',
                              },
                            })
                          }
                          className="mr-1"
                        />
                        OpenAI-compatible
                      </label>
                      <label className="flex items-center text-xs text-gray-700">
                        <input
                          type="radio"
                          name="continuations-format"
                          checked={settings.continuations.customEndpointFormat === 'raw'}
                          onChange={() =>
                            updateSettings({
                              continuations: {
                                ...settings.continuations,
                                customEndpointFormat: 'raw',
                              },
                            })
                          }
                          className="mr-1"
                        />
                        Raw prompt format
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Assistant Settings */}
        <div className="mb-2">
          <button
            onClick={() => toggleSection('assistant')}
            className="w-full flex items-center justify-between px-3 py-2 bg-sky-medium rounded-lg hover:bg-sky-dark transition-colors"
          >
            <span className="text-sm font-medium text-gray-800">Assistant</span>
            <span className="text-gray-600">{expandedSection === 'assistant' ? '▼' : '▶'}</span>
          </button>

          {expandedSection === 'assistant' && (
            <div className="mt-2 p-3 bg-white rounded-lg space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Model Name</label>
                <input
                  type="text"
                  value={settings.assistant.modelName}
                  onChange={(e) =>
                    updateSettings({
                      assistant: { ...settings.assistant, modelName: e.target.value },
                    })
                  }
                  className="w-full px-2 py-1 text-xs rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-sky-dark"
                />

                {/* Store in Memory and Clear Memory buttons */}
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleStoreInMemoryAssistant}
                    disabled={!settings.assistant.modelName.trim()}
                    className="px-2 py-1 text-xs rounded bg-sky-medium hover:bg-sky-dark text-gray-800 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Store in Memory
                  </button>
                  <button
                    onClick={handleClearMemoryAssistant}
                    disabled={!settings.assistant.savedModels || settings.assistant.savedModels.length === 0}
                    className={`px-2 py-1 text-xs rounded transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                      confirmingClearAssistant
                        ? 'bg-sky-medium hover:bg-sky-dark text-gray-800'
                        : 'bg-sky-accent hover:bg-sky-light text-gray-800'
                    }`}
                  >
                    {confirmingClearAssistant ? 'Are you sure?' : 'Clear Memory'}
                  </button>
                </div>

                {/* Dropdown for saved models */}
                {settings.assistant.savedModels && settings.assistant.savedModels.length > 0 && (
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        updateSettings({
                          assistant: { ...settings.assistant, modelName: e.target.value },
                        });
                      }
                    }}
                    className="w-full px-2 py-1 text-xs rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-sky-dark mt-2"
                  >
                    <option value="">Select a saved model...</option>
                    {settings.assistant.savedModels.map((model, index) => (
                      <option key={index} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Temperature</label>
                <input
                  type="number"
                  min="0"
                  max="2"
                  step="0.1"
                  value={settings.assistant.temperature}
                  onChange={(e) =>
                    updateSettings({
                      assistant: { ...settings.assistant, temperature: parseFloat(e.target.value) },
                    })
                  }
                  className="w-full px-2 py-1 text-xs rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-sky-dark"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Top P</label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.assistant.topP}
                  onChange={(e) =>
                    updateSettings({
                      assistant: { ...settings.assistant, topP: parseFloat(e.target.value) },
                    })
                  }
                  className="w-full px-2 py-1 text-xs rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-sky-dark"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Max Tokens</label>
                <input
                  type="number"
                  min="1"
                  max="4000"
                  value={settings.assistant.maxTokens}
                  onChange={(e) =>
                    updateSettings({
                      assistant: { ...settings.assistant, maxTokens: parseInt(e.target.value) },
                    })
                  }
                  className="w-full px-2 py-1 text-xs rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-sky-dark"
                />
              </div>

              <div>
                <label className="flex items-center text-xs font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={settings.assistant.useFinetuned ?? false}
                    onChange={(e) =>
                      updateSettings({
                        assistant: {
                          ...settings.assistant,
                          useFinetuned: e.target.checked,
                        },
                      })
                    }
                    className="mr-2"
                  />
                  Use Fine-Tuned Model
                </label>
                <p className="text-xs text-gray-500 mt-1 ml-5">
                  When enabled, model name is interpreted as a fine-tuned model. Enter either a custom name
                  from the Training panel or the full official model name.
                </p>
                {settings.assistant.useFinetuned && tuning.fineTunes.length > 0 && (
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        const fineTune = tuning.fineTunes.find((ft) => ft.customName === e.target.value);
                        if (fineTune) {
                          updateSettings({
                            assistant: {
                              ...settings.assistant,
                              modelName: fineTune.officialName
                            },
                          });
                        }
                      }
                    }}
                    className="w-full px-2 py-1 text-xs rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-sky-dark mt-2"
                  >
                    <option value="">Select a fine-tuned model...</option>
                    {tuning.fineTunes.map((ft, index) => (
                      <option key={index} value={ft.customName}>
                        {ft.customName}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="flex items-center text-xs font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={settings.assistant.useFineTuningPrompts ?? false}
                    onChange={(e) =>
                      updateSettings({
                        assistant: {
                          ...settings.assistant,
                          useFineTuningPrompts: e.target.checked,
                        },
                      })
                    }
                    className="mr-2"
                  />
                  Use Fine-Tuning Prompts
                </label>
                <p className="text-xs text-gray-500 mt-1 ml-5">
                  When enabled, the prompts used in fine-tuning will override instructions for all agents, potentially improving performance.
                </p>
              </div>

              <div>
                <label className="flex items-center text-xs font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={settings.assistant.useCustomEndpoint ?? false}
                    onChange={(e) =>
                      updateSettings({
                        assistant: {
                          ...settings.assistant,
                          useCustomEndpoint: e.target.checked,
                        },
                      })
                    }
                    className="mr-2"
                  />
                  Use Custom Endpoint
                </label>
                {settings.assistant.useCustomEndpoint && (
                  <div className="mt-2 ml-5">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Full Endpoint URL</label>
                    <input
                      type="text"
                      value={settings.assistant.customBaseUrl ?? ''}
                      onChange={(e) =>
                        updateSettings({
                          assistant: {
                            ...settings.assistant,
                            customBaseUrl: e.target.value,
                          },
                        })
                      }
                      className="w-full px-2 py-1 text-xs rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-sky-dark"
                      placeholder="http://localhost:8000/v1/chat/completions"
                    />

                    <label className="block text-xs font-medium text-gray-700 mb-1 mt-3">API Key</label>
                    <input
                      type="password"
                      value={settings.assistant.customApiKey ?? ''}
                      onChange={(e) =>
                        updateSettings({
                          assistant: {
                            ...settings.assistant,
                            customApiKey: e.target.value,
                          },
                        })
                      }
                      className="w-full px-2 py-1 text-xs rounded border border-gray-300 focus:outline-none focus:ring-1 focus:ring-sky-dark"
                      placeholder="Optional API key for custom endpoint"
                    />

                    <label className="block text-xs font-medium text-gray-700 mb-1 mt-3">Request Format</label>
                    <div className="flex flex-col gap-1">
                      <label className="flex items-center text-xs text-gray-700">
                        <input
                          type="radio"
                          name="assistant-format"
                          checked={(settings.assistant.customEndpointFormat ?? 'openai') === 'openai'}
                          onChange={() =>
                            updateSettings({
                              assistant: {
                                ...settings.assistant,
                                customEndpointFormat: 'openai',
                              },
                            })
                          }
                          className="mr-1"
                        />
                        OpenAI-compatible
                      </label>
                      <label className="flex items-center text-xs text-gray-700">
                        <input
                          type="radio"
                          name="assistant-format"
                          checked={settings.assistant.customEndpointFormat === 'raw'}
                          onChange={() =>
                            updateSettings({
                              assistant: {
                                ...settings.assistant,
                                customEndpointFormat: 'raw',
                              },
                            })
                          }
                          className="mr-1"
                        />
                        Raw prompt format
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
