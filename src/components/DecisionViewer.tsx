import React, { useState, useEffect } from 'react';
import { useStore } from '../store';

const DecisionViewer: React.FC = () => {
  const { tuning, deleteDecision } = useStore();
  const [currentIndex, setCurrentIndex] = useState(0);

  // When new decisions are added, update to show the latest
  useEffect(() => {
    if (tuning.trainingData.length > 0) {
      setCurrentIndex(tuning.trainingData.length - 1);
    }
  }, [tuning.trainingData.length]);

  // Ensure currentIndex is valid
  useEffect(() => {
    if (currentIndex >= tuning.trainingData.length && tuning.trainingData.length > 0) {
      setCurrentIndex(tuning.trainingData.length - 1);
    } else if (tuning.trainingData.length === 0) {
      setCurrentIndex(0);
    }
  }, [currentIndex, tuning.trainingData.length]);

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < tuning.trainingData.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleDelete = () => {
    if (tuning.trainingData.length > 0 && currentIndex >= 0) {
      deleteDecision(currentIndex);
      // After deletion, adjust index if needed
      if (currentIndex >= tuning.trainingData.length - 1 && currentIndex > 0) {
        setCurrentIndex(currentIndex - 1);
      }
    }
  };

  if (tuning.trainingData.length === 0) {
    return (
      <div className="mb-4 p-3 bg-white rounded-lg border border-sky-medium">
        <div className="text-xs text-gray-400 text-center py-4">No decisions captured yet</div>
      </div>
    );
  }

  const currentDecision = tuning.trainingData[currentIndex];
  const truncateText = (text: string, maxLength: number = 150) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <div className="mb-4 p-3 bg-white rounded-lg border border-sky-medium">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-medium text-gray-700">
          {currentIndex + 1} of {tuning.trainingData.length}
        </div>
        <div className="flex gap-1">
          <button
            onClick={handlePrevious}
            disabled={currentIndex === 0}
            className="px-2 py-1 text-xs rounded bg-sky-medium hover:bg-sky-dark text-gray-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Previous decision"
          >
            ▲
          </button>
          <button
            onClick={handleNext}
            disabled={currentIndex === tuning.trainingData.length - 1}
            className="px-2 py-1 text-xs rounded bg-sky-medium hover:bg-sky-dark text-gray-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Next decision"
          >
            ▼
          </button>
          <button
            onClick={handleDelete}
            className="px-2 py-1 text-xs rounded bg-sky-medium hover:bg-sky-dark text-gray-800 transition-colors ml-1"
            title="Delete this decision"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="text-xs space-y-2">
        {currentDecision.type === 'decision' ? (
          <>
            <div>
              <span className="font-medium text-gray-700">Type: </span>
              <span className="text-gray-600">Expand/Cull Decision</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Decision: </span>
              <span className="text-gray-600">
                {currentDecision.decision === 'expand' ? 'Expand' : 'Cull'}
              </span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Context: </span>
              <div className="text-gray-600 bg-gray-50 p-2 rounded mt-1 whitespace-pre-wrap break-words max-h-24 overflow-y-auto">
                {truncateText(currentDecision.context)}
              </div>
            </div>
            <div>
              <span className="font-medium text-gray-700">Current Node: </span>
              <div className="text-gray-600 bg-gray-50 p-2 rounded mt-1 whitespace-pre-wrap break-words max-h-24 overflow-y-auto">
                {truncateText(currentDecision.currentNode)}
              </div>
            </div>
          </>
        ) : (
          <>
            <div>
              <span className="font-medium text-gray-700">Type: </span>
              <span className="text-gray-600">Sibling Preference</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Chosen: </span>
              <span className="text-gray-600">Option {currentDecision.choiceIndex + 1}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Context: </span>
              <div className="text-gray-600 bg-gray-50 p-2 rounded mt-1 whitespace-pre-wrap break-words max-h-24 overflow-y-auto">
                {truncateText(currentDecision.context)}
              </div>
            </div>
            <div>
              <span className="font-medium text-gray-700">Continuations: </span>
              <div className="mt-1 space-y-1">
                {currentDecision.continuations.map((cont, idx) => (
                  <div
                    key={idx}
                    className="text-gray-600 bg-gray-50 p-2 rounded whitespace-pre-wrap break-words max-h-16 overflow-y-auto"
                  >
                    <span className="font-medium text-gray-700">{idx + 1}. </span>
                    {truncateText(cont, 100)}
                    {idx === currentDecision.choiceIndex && (
                      <span className="ml-2 text-gray-500">(chosen)</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DecisionViewer;
