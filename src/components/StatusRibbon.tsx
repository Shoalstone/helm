import React, { useState, useEffect } from 'react';
import { useStore, RibbonWindow } from '../store';
import { GraphContentHandle } from './modules/Graph';

// Type definition for Local Font Access API
interface FontData {
  family: string;
  fullName: string;
  postscriptName: string;
  style: string;
}

declare global {
  interface Window {
    queryLocalFonts?: () => Promise<FontData[]>;
  }
}

// Fallback fonts if Local Font Access API isn't available
const FALLBACK_FONTS = [
  { name: 'Monospace (System Default)', value: "monospace" },
  { name: 'Consolas / Courier New', value: "'Consolas', 'Courier New', monospace" },
  { name: 'Menlo / Monaco', value: "'Menlo', 'Monaco', 'Courier New', monospace" },
  { name: 'System UI', value: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  { name: 'Arial / Helvetica', value: "'Arial', 'Helvetica', sans-serif" },
  { name: 'Verdana', value: "'Verdana', sans-serif" },
  { name: 'Georgia', value: "'Georgia', serif" },
  { name: 'Times New Roman', value: "'Times New Roman', 'Times', serif" },
];

const FONT_SIZES = [10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32];

interface StatusRibbonProps {
  fontFamily: string;
  setFontFamily: (family: string) => void;
  fontSize: number;
  setFontSize: (size: number) => void;
  onShowHelp: () => void;
  graphBottomRef: React.RefObject<GraphContentHandle>;
}

const RIBBON_WINDOWS: RibbonWindow[] = ['None', 'Help', 'Graph', 'Terminal'];

const StatusRibbon: React.FC<StatusRibbonProps> = ({
  fontFamily,
  setFontFamily,
  fontSize,
  setFontSize,
  onShowHelp,
  graphBottomRef,
}) => {
  const { currentTree, ribbonWindow, setRibbonWindow } = useStore();
  const [showFontDropdown, setShowFontDropdown] = useState(false);
  const [showSizeDropdown, setShowSizeDropdown] = useState(false);
  const [showWindowDropdown, setShowWindowDropdown] = useState(false);
  const [fontFamilies, setFontFamilies] = useState<{ name: string; value: string }[]>(FALLBACK_FONTS);
  const [isLoadingFonts, setIsLoadingFonts] = useState(true);

  const currentNode = currentTree?.nodes.get(currentTree.currentNodeId);
  const isLocked = currentNode?.locked || false;
  const lockReason = currentNode?.lockReason || null;
  const lockReasonLabels: Record<string, string> = {
    expanding: 'Generating new continuations',
    'scout-active': 'Scout running',
    'witness-active': 'Witness deciding',
    'trident-active': 'Trident running',
    'copilot-deciding': 'Copilot deciding',
  };
  const lockReasonLabel = lockReason ? lockReasonLabels[lockReason] || lockReason : '';
  const currentFontName = fontFamilies.find(f => f.value === fontFamily)?.name || 'Menlo / Monaco';

  // Load available fonts from system
  useEffect(() => {
    const loadSystemFonts = async () => {
      try {
        if (!window.queryLocalFonts) {
          console.log('Local Font Access API not available, using fallback fonts');
          setIsLoadingFonts(false);
          return;
        }

        const fonts = await window.queryLocalFonts();
        const familySet = new Set<string>();
        fonts.forEach(font => familySet.add(font.family));
        const families = Array.from(familySet).sort();

        const fontList = families.map(family => ({
          name: family,
          value: `'${family}'`,
        }));

        console.log(`Loaded ${fontList.length} system fonts`);
        setFontFamilies(fontList);
        setIsLoadingFonts(false);
      } catch (error) {
        console.error('Failed to load system fonts:', error);
        console.log('Using fallback fonts');
        setIsLoadingFonts(false);
      }
    };

    loadSystemFonts();
  }, []);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.font-dropdown-container')) {
        setShowFontDropdown(false);
        setShowSizeDropdown(false);
        setShowWindowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="h-8 bg-sky-medium flex items-center justify-between px-3 text-xs text-gray-800 relative">
      <div className="flex items-center gap-2">
        {isLocked && (
          <span className="px-2 py-1 rounded bg-sky-dark text-white">
            🔒 Locked: {lockReasonLabel}
          </span>
        )}
        {!isLocked && <span className="text-gray-600">Ready</span>}
      </div>

      <div className="flex items-center gap-2">
        {/* Graph zoom controls - only shown when Graph window is active */}
        {ribbonWindow === 'Graph' && (
          <>
            <button
              type="button"
              onClick={() => graphBottomRef.current?.zoomOut()}
              className="px-2 py-1 rounded bg-sky-accent hover:bg-sky-light text-xs transition-colors"
              aria-label="Zoom out"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => graphBottomRef.current?.zoomIn()}
              className="px-2 py-1 rounded bg-sky-accent hover:bg-sky-light text-xs transition-colors"
              aria-label="Zoom in"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => graphBottomRef.current?.resetZoom()}
              className="px-2 py-1 rounded bg-sky-accent hover:bg-sky-light text-xs transition-colors"
              aria-label="Reset zoom"
            >
              ↺
            </button>
          </>
        )}

        {/* Window selection dropdown */}
        <div className="relative font-dropdown-container">
          {showWindowDropdown && (
            <div className="absolute bottom-full right-0 mb-1 bg-white border border-sky-dark rounded shadow-lg z-50 min-w-[100px]">
              {RIBBON_WINDOWS.map((window) => (
                <button
                  key={window}
                  onClick={() => {
                    setRibbonWindow(window);
                    setShowWindowDropdown(false);
                  }}
                  className={`block w-full text-left px-3 py-2 hover:bg-sky-light transition-colors whitespace-nowrap ${
                    ribbonWindow === window ? 'bg-sky-accent' : ''
                  }`}
                >
                  {window}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => {
              setShowWindowDropdown(!showWindowDropdown);
              setShowFontDropdown(false);
              setShowSizeDropdown(false);
            }}
            className="px-2 py-1 rounded bg-sky-accent hover:bg-sky-light transition-colors"
            title="Select ribbon window"
          >
            {ribbonWindow}
          </button>
        </div>

        {/* Font family dropdown */}
        <div className="relative font-dropdown-container">
          {showFontDropdown && (
            <div className="absolute bottom-full right-0 mb-1 bg-white border border-sky-dark rounded shadow-lg max-h-64 overflow-y-auto z-50 min-w-[160px]">
              {isLoadingFonts ? (
                <div className="px-3 py-2 text-gray-600 text-xs">Loading fonts...</div>
              ) : (
                fontFamilies.map((font) => (
                  <button
                    key={font.value}
                    onClick={() => {
                      setFontFamily(font.value);
                      setShowFontDropdown(false);
                    }}
                    className={`block w-full text-left px-3 py-2 hover:bg-sky-light transition-colors whitespace-nowrap ${
                      fontFamily === font.value ? 'bg-sky-accent' : ''
                    }`}
                    style={{ fontFamily: font.value }}
                  >
                    {font.name}
                  </button>
                ))
              )}
            </div>
          )}
          <button
            onClick={() => {
              setShowFontDropdown(!showFontDropdown);
              setShowSizeDropdown(false);
              setShowWindowDropdown(false);
            }}
            className="px-2 py-1 rounded bg-sky-accent hover:bg-sky-light transition-colors"
            title="Select font family"
            disabled={isLoadingFonts}
          >
            {isLoadingFonts ? 'Loading...' : currentFontName}
          </button>
        </div>

        {/* Font size dropdown */}
        <div className="relative font-dropdown-container">
          {showSizeDropdown && (
            <div className="absolute bottom-full right-0 mb-1 bg-white border border-sky-dark rounded shadow-lg max-h-64 overflow-y-auto z-50 min-w-[80px]">
              {FONT_SIZES.map((size) => (
                <button
                  key={size}
                  onClick={() => {
                    setFontSize(size);
                    setShowSizeDropdown(false);
                  }}
                  className={`block w-full text-left px-3 py-2 hover:bg-sky-light transition-colors whitespace-nowrap ${
                    fontSize === size ? 'bg-sky-accent' : ''
                  }`}
                >
                  {size}px
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => {
              setShowSizeDropdown(!showSizeDropdown);
              setShowFontDropdown(false);
              setShowWindowDropdown(false);
            }}
            className="px-2 py-1 rounded bg-sky-accent hover:bg-sky-light transition-colors"
            title="Select font size"
          >
            {fontSize}px
          </button>
        </div>

        <button
          onClick={onShowHelp}
          className="px-2 py-1 rounded bg-sky-accent hover:bg-sky-light transition-colors"
          title="Click for keybindings help"
        >
          ?
        </button>
      </div>
    </div>
  );
};

export default StatusRibbon;
