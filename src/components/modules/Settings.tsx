import React, { useState } from 'react';
import { useStore } from '../../store';

const Settings: React.FC = () => {
  const { settings, updateSettings } = useStore();
  const [expandedSection, setExpandedSection] = useState<string | null>('continuations');

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  return (
    <div className="h-full flex flex-col bg-sky-light overflow-y-auto">
      <div className="p-3">
        <h3 className="text-sm font-semibold mb-3 text-gray-800">Settings</h3>

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
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
