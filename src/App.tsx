import { useState, useRef } from 'react';
import Header from './components/Header';
import LeftPanel from './components/LeftPanel';
import RightPanel from './components/RightPanel';
import BottomPanel from './components/BottomPanel';
import Terminal from './components/Terminal';
import StatusRibbon from './components/StatusRibbon';
import TextEditor, { TextEditorHandle } from './components/TextEditor';
import { useStore } from './store';
import { useKeybindings } from './hooks/useKeybindings';
import { GraphContentHandle } from './components/modules/Graph';

function App() {
  const textEditorRef = useRef<TextEditorHandle>(null);
  const { scoutInvokeMode } = useKeybindings(
    () => textEditorRef.current?.scrollToBottom(),
    () => textEditorRef.current?.toggleGreyOutReadOnly()
  );
  const { scouts, bottomPanelHeight, setBottomPanelHeight, ribbonWindow } = useStore();
  const [fontFamily, setFontFamily] = useState("'Menlo', 'Monaco', 'Courier New', monospace");
  const [fontSize, setFontSize] = useState(14);
  const graphBottomRef = useRef<GraphContentHandle>(null);

  return (
    <div className="w-full h-full flex flex-col bg-sky-light">
      <Header />
      <div className="flex-1 flex overflow-hidden">
        <LeftPanel />

        {/* Center column with editor, ribbon, and bottom panel */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Editor area - height adjusts based on bottom panel */}
          <div style={{ height: `${100 - bottomPanelHeight}%` }} className="flex flex-col overflow-hidden">
            <TextEditor ref={textEditorRef} fontFamily={fontFamily} fontSize={fontSize} />

            {/* Status Ribbon with draggable handle */}
            <div
              className="cursor-row-resize hover:bg-sky-dark transition-colors"
              onMouseDown={(e) => {
                e.preventDefault();
                document.body.style.userSelect = 'none';

                const startY = e.clientY;
                const startHeight = bottomPanelHeight;
                const containerElement = e.currentTarget.parentElement!.parentElement!;
                const containerHeight = containerElement.clientHeight;

                const handleMouseMove = (moveEvent: MouseEvent) => {
                  const deltaY = moveEvent.clientY - startY;
                  // Negative deltaY means dragging up (increase bottom panel)
                  // Positive deltaY means dragging down (decrease bottom panel)
                  const deltaPercent = -(deltaY / containerHeight) * 100;
                  const newHeight = Math.max(0, Math.min(90, startHeight + deltaPercent));
                  setBottomPanelHeight(newHeight);
                };

                const handleMouseUp = () => {
                  document.body.style.userSelect = '';
                  document.removeEventListener('mousemove', handleMouseMove);
                  document.removeEventListener('mouseup', handleMouseUp);
                };

                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
              }}
            >
              <StatusRibbon
                fontFamily={fontFamily}
                setFontFamily={setFontFamily}
                fontSize={fontSize}
                setFontSize={setFontSize}
                onShowHelp={() => textEditorRef.current?.showHelp()}
                graphBottomRef={graphBottomRef}
                textEditorRef={textEditorRef}
              />
            </div>
          </div>

          {/* Bottom panel - height based on bottomPanelHeight */}
          {bottomPanelHeight > 0 && (
            <div style={{ height: `${bottomPanelHeight}%` }} className="overflow-hidden border-t border-sky-medium">
              {ribbonWindow === 'Help' && <BottomPanel />}
              {ribbonWindow === 'Graph' && <BottomPanel graphRef={graphBottomRef} />}
              {ribbonWindow === 'Terminal' && <Terminal />}
              {ribbonWindow === 'None' && <div className="w-full h-full bg-sky-light" />}
            </div>
          )}
        </div>

        <RightPanel />
      </div>

      {/* Agent invoke mode overlay */}
      {scoutInvokeMode && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-sky-light p-6 rounded-xl shadow-2xl max-w-md">
            <h3 className="text-lg font-semibold mb-3 text-gray-800">Select Agent</h3>
            {scouts.filter((s) => s.buttonNumber).length > 0 ? (
              <div className="space-y-2 mb-4">
                {scouts
                  .filter((s) => s.buttonNumber)
                  .sort((a, b) => (a.buttonNumber || 0) - (b.buttonNumber || 0))
                  .map((scout) => (
                    <div
                      key={scout.id}
                      className="flex items-center gap-2 text-sm text-gray-700 bg-white px-3 py-2 rounded"
                    >
                      <span className="font-mono font-bold text-sky-dark">{scout.buttonNumber}</span>
                      <span>-</span>
                      <span>{scout.name}</span>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-gray-600 mb-4">
                No agents with button assignments. Assign buttons in the Agents panel.
              </p>
            )}
            <p className="text-xs text-gray-500">Press Escape to cancel</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
