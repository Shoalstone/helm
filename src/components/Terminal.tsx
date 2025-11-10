import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';

const Terminal: React.FC = () => {
  const { terminalMessages, terminalVerbose, addTerminalMessage, clearTerminal, toggleTerminalVerbose, settings, updateSettings } = useStore();
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const hasInitialized = useRef(false);

  // Add welcome message on first load (only once per Terminal session)
  useEffect(() => {
    // Only initialize once per component lifecycle
    if (hasInitialized.current) {
      return;
    }

    // Check if initialization message already exists to prevent duplicates
    const hasInitMessage = terminalMessages.some(
      msg => msg.message.includes('Terminal initialized')
    );

    if (!hasInitMessage && terminalMessages.length === 0) {
      addTerminalMessage('info', 'Terminal initialized. Type /help for available commands.');
    }

    hasInitialized.current = true;
  }, [terminalMessages, addTerminalMessage]);

  // Track scroll position to determine if we should auto-scroll
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      const isAtBottom =
        scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight < 50;
      shouldAutoScrollRef.current = isAtBottom;
    };

    scrollContainer.addEventListener('scroll', handleScroll);
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-scroll to bottom when new messages arrive, but only if we were at the bottom
  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      // Use setTimeout to ensure DOM has updated
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 0);
    }
  }, [terminalMessages]);

  const handleCommand = (command: string) => {
    const trimmedCommand = command.trim();
    if (!trimmedCommand) return;

    // Add the command to the terminal output
    addTerminalMessage('command', `> ${trimmedCommand}`);

    // Handle commands
    if (trimmedCommand === '/help') {
      addTerminalMessage('info', 'Available commands:');
      addTerminalMessage('info', '  /help - Show this help message');
      addTerminalMessage('info', '  /clear - Clear terminal output');
      addTerminalMessage('info', '  /verbose - Toggle verbose debug logging');
      addTerminalMessage('info', '  /logprobs - Toggle logprobs output for OpenRouter requests');
      addTerminalMessage('info', '  /setlogprobs <number> - Set number of top logprobs (1-20)');
    } else if (trimmedCommand === '/clear') {
      clearTerminal();
    } else if (trimmedCommand === '/verbose') {
      toggleTerminalVerbose();
      const newState = !terminalVerbose;
      addTerminalMessage('info', `Verbose mode ${newState ? 'enabled' : 'disabled'}.`);
    } else if (trimmedCommand === '/logprobs') {
      const currentEnabled = settings.continuations.enableLogprobs ?? false;
      const newEnabled = !currentEnabled;
      updateSettings({
        continuations: {
          ...settings.continuations,
          enableLogprobs: newEnabled,
        }
      });
      addTerminalMessage('info', `Logprobs ${newEnabled ? 'enabled' : 'disabled'}.`);
      if (newEnabled) {
        addTerminalMessage('info', `Requesting top ${settings.continuations.topLogprobs ?? 5} token probabilities.`);
      }
    } else if (trimmedCommand.startsWith('/setlogprobs ')) {
      const args = trimmedCommand.split(' ');
      if (args.length !== 2) {
        addTerminalMessage('error', 'Usage: /setlogprobs <number>');
        addTerminalMessage('info', 'Example: /setlogprobs 5');
        return;
      }
      const num = parseInt(args[1], 10);
      if (isNaN(num) || num < 1 || num > 20) {
        addTerminalMessage('error', 'Please provide a number between 1 and 20');
        return;
      }
      updateSettings({
        continuations: {
          ...settings.continuations,
          topLogprobs: num,
        }
      });
      addTerminalMessage('info', `Top logprobs set to ${num}.`);
    } else {
      addTerminalMessage('error', `Unknown command: ${trimmedCommand}`);
      addTerminalMessage('info', 'Type /help for available commands');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      handleCommand(inputValue);
      setInputValue('');
    }
  };

  const getMessageColor = (type: string) => {
    // Use consistent color for all message types to match palette
    if (type === 'command') {
      return 'text-sky-dark font-semibold';
    }
    return 'text-gray-800';
  };

  const getMessagePrefix = (type: string) => {
    switch (type) {
      case 'error':
        return '[Error]';
      case 'debug':
        return '[Debug]';
      case 'info':
        return '[Info]';
      case 'command':
        return '';
      default:
        return '';
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="w-full h-full bg-white flex flex-col font-mono text-sm">
      {/* Terminal output area */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-1 bg-sky-light">
        {terminalMessages.length === 0 && (
          <div className="text-gray-600">
            Terminal ready. Type /help for available commands.
          </div>
        )}
        {terminalMessages.map((msg) => (
          <div key={msg.id} className="flex gap-2">
            <span className="text-gray-500 text-xs flex-shrink-0 self-start w-[58px]">
              {formatTime(msg.timestamp)}
            </span>
            <span className={`${getMessageColor(msg.type)} flex-1 break-words whitespace-pre-wrap min-w-0`}>
              {getMessagePrefix(msg.type) && (
                <span className="mr-1 inline-block min-w-[48px]">{getMessagePrefix(msg.type)}</span>
              )}
              {msg.message}
            </span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Terminal input area */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-sky-medium p-3 flex items-center gap-2 bg-white"
      >
        <span className="text-sky-dark flex-shrink-0 font-bold">&gt;</span>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          className="flex-1 bg-transparent text-gray-800 outline-none font-mono placeholder-gray-400 min-w-0"
          placeholder="Type /help for commands"
          autoFocus
        />
      </form>
    </div>
  );
};

export default Terminal;
