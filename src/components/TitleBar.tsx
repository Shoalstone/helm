import React, { useEffect, useState } from 'react';

const TitleBar: React.FC = () => {
  const [platform, setPlatform] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    // Check if running in Electron
    if (!window.electronAPI) {
      setPlatform('browser');
      return;
    }

    // Get platform information
    window.electronAPI.getPlatform().then(setPlatform);

    // Get initial fullscreen state
    window.electronAPI.windowIsFullscreen().then(setIsFullscreen);

    // Listen for fullscreen events
    window.electronAPI.onWindowFullscreen((fullscreen) => {
      setIsFullscreen(fullscreen);
    });
  }, []);

  const handleMinimize = () => {
    window.electronAPI.windowMinimize();
  };

  const handleMaximize = () => {
    window.electronAPI.windowMaximize();
  };

  const handleClose = () => {
    window.electronAPI.windowClose();
  };

  // Don't render in browser mode
  if (platform === 'browser') {
    return null;
  }

  // Don't render in fullscreen mode
  if (isFullscreen) {
    return null;
  }

  // Don't render until we know the platform
  if (platform === null) {
    return (
      <div
        className="title-bar"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '28px',
          zIndex: 9999,
          backgroundColor: 'var(--color-sky-light)',
          borderBottom: '1px solid var(--color-sky-divider)',
          WebkitAppRegion: 'drag',
        } as React.CSSProperties}
      />
    );
  }

  const isMac = platform === 'darwin';

  return (
    <div
      className="title-bar"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: isMac ? '28px' : '30px',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: isMac ? 'flex-start' : 'flex-end',
        backgroundColor: 'var(--color-sky-light)',
        borderBottom: '1px solid var(--color-sky-divider)',
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      {/* Window Controls (Windows only) */}
      {!isMac && (
        <div
          className="title-bar-controls"
          style={{
            display: 'flex',
            height: '100%',
            WebkitAppRegion: 'no-drag',
          } as React.CSSProperties}
        >
          <button
            onClick={handleMinimize}
            className="title-bar-button"
            style={{
              width: '46px',
              height: '100%',
              border: 'none',
              backgroundColor: 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <svg width="10" height="1" viewBox="0 0 10 1">
              <rect width="10" height="1" fill="currentColor" />
            </svg>
          </button>

          <button
            onClick={handleMaximize}
            className="title-bar-button"
            style={{
              width: '46px',
              height: '100%',
              border: 'none',
              backgroundColor: 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect
                x="1.5"
                y="1.5"
                width="7"
                height="7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              />
            </svg>
          </button>

          <button
            onClick={handleClose}
            className="title-bar-button title-bar-close"
            style={{
              width: '46px',
              height: '100%',
              border: 'none',
              backgroundColor: 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#e81123';
              e.currentTarget.style.color = 'white';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = 'inherit';
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10">
              <path
                d="M 1,1 L 9,9 M 9,1 L 1,9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};

export default TitleBar;
