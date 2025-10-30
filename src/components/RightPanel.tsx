import React, { useState } from 'react';
import { useStore } from '../store';
import { PanelModule } from '../types';
import Scout from './modules/Scout';
import Copilot from './modules/Copilot';
import Tree from './modules/Tree';
import Graph from './modules/Graph';
import Actions from './modules/Actions';
import Settings from './modules/Settings';
import Tuning from './modules/Tuning';

const RightPanel: React.FC = () => {
  const { rightPanel, updatePanels } = useStore();
  const [splitRatio, setSplitRatio] = useState(50);
  const [panelWidth, setPanelWidth] = useState(320); // width in pixels, not persisted

  const modules: PanelModule[] = ['Tree', 'Graph', 'Agents', 'Copilot', 'Actions', 'Settings', 'Tuning', null];

  const renderModule = (module: PanelModule) => {
    switch (module) {
      case 'Agents':
        return <Scout />;
      case 'Copilot':
        return <Copilot />;
      case 'Tree':
        return <Tree />;
      case 'Graph':
        return <Graph />;
      case 'Actions':
        return <Actions />;
      case 'Settings':
        return <Settings />;
      case 'Tuning':
        return <Tuning />;
      default:
        return null;
    }
  };

  const hasSplit = rightPanel.top && rightPanel.bottom;

  return (
    <div className="flex relative bg-sky-light border-l border-sky-medium">
      {/* Horizontal resize handle */}
      <div
        className="w-1 bg-sky-divider cursor-col-resize hover:bg-sky-medium transition-colors absolute left-0 top-0 bottom-0 z-10"
        onMouseDown={(e) => {
          e.preventDefault();
          document.body.style.userSelect = 'none';

          const startX = e.clientX;
          const startWidth = panelWidth;

          const handleMouseMove = (moveEvent: MouseEvent) => {
            const deltaX = startX - moveEvent.clientX; // Inverted for right panel
            const newWidth = Math.max(200, Math.min(600, startWidth + deltaX));
            setPanelWidth(newWidth);
          };

          const handleMouseUp = () => {
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
          };

          document.addEventListener('mousemove', handleMouseMove);
          document.addEventListener('mouseup', handleMouseUp);
        }}
      />

      <div style={{ width: `${panelWidth}px` }} className="flex flex-col">
      {/* Module selection ribbon */}
      <div className="h-10 bg-sky-medium flex items-center px-3 gap-2">
        <select
          className="flex-1 px-2 py-1 rounded text-xs bg-white border-none focus:outline-none focus:ring-1 focus:ring-sky-dark"
          value={rightPanel.top || ''}
          onChange={(e) => updatePanels('right', { top: (e.target.value || null) as PanelModule })}
        >
          <option value="">Top: None</option>
          {modules.filter(m => m).map((module) => (
            <option key={module} value={module!}>
              Top: {module}
            </option>
          ))}
        </select>

        <select
          className="flex-1 px-2 py-1 rounded text-xs bg-white border-none focus:outline-none focus:ring-1 focus:ring-sky-dark"
          value={rightPanel.bottom || ''}
          onChange={(e) => updatePanels('right', { bottom: (e.target.value || null) as PanelModule })}
        >
          <option value="">Bottom: None</option>
          {modules.filter(m => m).map((module) => (
            <option key={module} value={module!}>
              Bottom: {module}
            </option>
          ))}
        </select>
      </div>

      {/* Panels */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!hasSplit ? (
          <div className="flex-1 overflow-hidden">
            {renderModule(rightPanel.top || rightPanel.bottom)}
          </div>
        ) : (
          <>
            <div style={{ height: `${splitRatio}%` }} className="overflow-hidden">
              {renderModule(rightPanel.top)}
            </div>
            <div
              className="h-1 bg-sky-divider cursor-row-resize hover:bg-sky-medium transition-colors"
              onMouseDown={(e) => {
                e.preventDefault();
                document.body.style.userSelect = 'none';

                const startY = e.clientY;
                const startRatio = splitRatio;
                const panelHeight = e.currentTarget.parentElement!.clientHeight;

                const handleMouseMove = (moveEvent: MouseEvent) => {
                  const deltaY = moveEvent.clientY - startY;
                  const deltaPercent = (deltaY / panelHeight) * 100;
                  const newRatio = Math.max(10, Math.min(90, startRatio + deltaPercent));
                  setSplitRatio(newRatio);
                };

                const handleMouseUp = () => {
                  document.body.style.userSelect = '';
                  document.removeEventListener('mousemove', handleMouseMove);
                  document.removeEventListener('mouseup', handleMouseUp);
                };

                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
              }}
            />
            <div style={{ height: `${100 - splitRatio}%` }} className="overflow-hidden">
              {renderModule(rightPanel.bottom)}
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  );
};

export default RightPanel;
