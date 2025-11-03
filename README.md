# Helm

A variant of Janus' [Loom](https://github.com/socketteer/loom) and cosmicoptima's [Obsidian implementation](https://github.com/cosmicoptima/loom) with an emphasis on autonomous exploration and complex tree management.

Join the Discord server: http://discord.gg/qM5qzCDHvK

## Getting Started

A Help text will appear when you first open the application. For quick start, use the dropdowns above the side panels to open the Settings window, and insert an OpenRouter API key with some credits attached. Click the question mark on the bottom right of the text editor for keybinds.

## Features

- Full text editing
- Palette and font options
- Customizable agents for parallel autonomous exploration
- Copilot for local exploration and quality control
- Powerful tree complexity reduction features
- Interactive graph visualization
- OpenRouter API integration

## Requirements

- Node.js (v18 or higher recommended)
- OpenRouter API key

## Installation

Visit the [Releases](https://github.com/Shoalstone/helm/releases) page to install.

## Development

```bash
npm install
```

```bash
npm run dev
```

## Building

```bash
# Build for current platform
npm run build

# Package for macOS
npm run dist:mac

# Package for Windows
npm run dist:win

# Linux
electron-builder --linux --publish never
# run with:
./release/Helm-1.2.0.AppImage --no-sandbox