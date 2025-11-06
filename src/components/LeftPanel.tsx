import React, { useState } from 'react';
import { useStore } from '../store';
import { PanelModule } from '../types';
import Scout from './modules/Scout';
import Copilot from './modules/Copilot';
import Tree from './modules/Tree';
import Graph from './modules/Graph';
import Actions from './modules/Actions';
import Settings from './modules/Settings';
import Training from './modules/Training';

const LeftPanel: React.FC = () => {
  const { leftPanel, leftPanelSetB, panelSetToggle, updatePanels, togglePanelSet } = useStore();
  const [splitRatio, setSplitRatio] = useState(50); // percentage for top panel
  const [panelWidth, setPanelWidth] = useState(320); // width in pixels, not persisted

  // Use the active panel set based on toggle state
  const activePanel = panelSetToggle ? leftPanelSetB : leftPanel;

  const modules: PanelModule[] = ['Tree', 'Graph', 'Agents', 'Copilot', 'Actions', 'Training', 'Settings', null];

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
      case 'Training':
        return <Training />;
      default:
        return null;
    }
  };

  const hasSplit = activePanel.top && activePanel.bottom;

  return (
    <div className="flex relative bg-sky-light border-r border-sky-medium">
      <div style={{ width: `${panelWidth}px` }} className="flex flex-col">
      {/* Module selection ribbon */}
      <div className="h-10 bg-sky-medium flex items-center px-3 gap-2">
        <select
          className="flex-1 px-2 py-1 rounded text-xs bg-white border-none focus:outline-none focus:ring-1 focus:ring-sky-dark"
          value={activePanel.top || ''}
          onChange={(e) => updatePanels('left', { top: (e.target.value || null) as PanelModule })}
        >
          <option value="">Top: None</option>
          {modules.filter(m => m).map((module) => (
            <option key={module} value={module!}>
              Top: {module}
            </option>
          ))}
        </select>

        <button
          className="w-6 h-6 rounded text-base bg-sky-accent hover:bg-sky-dark text-gray-800 border-none outline-none transition-colors cursor-pointer flex items-center justify-center"
          onClick={togglePanelSet}
          title={`Switch to Set ${panelSetToggle ? 'A' : 'B'}`}
        >
          ◎
        </button>

        <select
          className="flex-1 px-2 py-1 rounded text-xs bg-white border-none focus:outline-none focus:ring-1 focus:ring-sky-dark"
          value={activePanel.bottom || ''}
          onChange={(e) => updatePanels('left', { bottom: (e.target.value || null) as PanelModule })}
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
            {renderModule(activePanel.top || activePanel.bottom)}
          </div>
        ) : (
          <>
            <div style={{ height: `${splitRatio}%` }} className="overflow-hidden">
              {renderModule(activePanel.top)}
            </div>
            <div
              className="h-1 bg-sky-divider cursor-row-resize hover:bg-sky-medium transition-colors"
              onMouseDown={(e) => {
                e.preventDefault();
                document.body.style.userSelect = 'none';

                const startY = e.clientY;
                const startRatio = splitRatio;
                const panelHeight = e.currentTarget.parentElement!.clientHeight;
                let hasMoved = false;

                const handleMouseMove = (moveEvent: MouseEvent) => {
                  const deltaY = moveEvent.clientY - startY;
                  // Consider it a drag if moved more than 3 pixels
                  if (Math.abs(deltaY) > 3) {
                    hasMoved = true;
                  }
                  const deltaPercent = (deltaY / panelHeight) * 100;
                  const newRatio = Math.max(10, Math.min(90, startRatio + deltaPercent));
                  setSplitRatio(newRatio);
                };

                const handleMouseUp = () => {
                  document.body.style.userSelect = '';
                  document.removeEventListener('mousemove', handleMouseMove);
                  document.removeEventListener('mouseup', handleMouseUp);

                  // If the user didn't drag, reset to default ratio
                  if (!hasMoved) {
                    setSplitRatio(50);
                  }
                };

                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
              }}
            />
            <div style={{ height: `${100 - splitRatio}%` }} className="overflow-hidden">
              {renderModule(activePanel.bottom)}
            </div>
          </>
        )}
      </div>
      </div>

      {/* Horizontal resize handle */}
      <div
        className="w-1 bg-sky-divider cursor-col-resize hover:bg-sky-medium transition-colors absolute right-0 top-0 bottom-0"
        onMouseDown={(e) => {
          e.preventDefault();
          document.body.style.userSelect = 'none';

          const startX = e.clientX;
          const startWidth = panelWidth;
          let hasMoved = false;

          const handleMouseMove = (moveEvent: MouseEvent) => {
            const deltaX = moveEvent.clientX - startX;
            // Consider it a drag if moved more than 3 pixels
            if (Math.abs(deltaX) > 3) {
              hasMoved = true;
            }
            const newWidth = Math.max(200, Math.min(600, startWidth + deltaX));
            setPanelWidth(newWidth);
          };

          const handleMouseUp = () => {
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);

            // If the user didn't drag, reset to default width
            if (!hasMoved) {
              setPanelWidth(320);
            }
          };

          document.addEventListener('mousemove', handleMouseMove);
          document.addEventListener('mouseup', handleMouseUp);
        }}
      />
    </div>
  );
};

export default LeftPanel;
