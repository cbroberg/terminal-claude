# Claude Terminal Integration

This project integrates Claude AI with a Telegram bot interface for interactive conversations and code assistance across multiple repositories.

## Features

- Interactive Telegram bot for Claude conversations
- Real-time git operations (status, diff, log, commit, push, pull)
- Repository management and switching
- File viewing and operations via Telegram
- Automated commit message generation using Claude
- Screenshot and document upload support

## Prerequisites

- Node.js (v18 or higher)
- npm (comes with Node.js)
- Telegram Bot Token (from BotFather)
- Telegram Chat ID for authorization

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

This will install the following packages:
- `node-telegram-bot-api` - Telegram bot integration
- `dotenv` - Environment variable management
- `nodemon` - Development server auto-reload (dev only)
- `eslint` - Code linting (dev only)

### 2. Configure Environment Variables

Create a `.env` file in the project root with the following variables:

```
TELEGRAM_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
```

Where:
- `TELEGRAM_TOKEN`: Get this from BotFather on Telegram (@BotFather)
- `TELEGRAM_CHAT_ID`: Your personal Telegram chat ID (numeric)

### 3. Run the Server

**Production mode:**
```bash
npm start
```

**Development mode (with auto-reload):**
```bash
npm run dev
```

The bot will start polling for Telegram messages and log:
```
🚀 Telegram Claude Bot ready!
📂 Repositories: mobile, movie, codescan, tcc, experiments
✅ Active: [current-repo]
Send /help in Telegram for all commands
```

## Project Structure

- `server.js` - Main bot application
- `package.json` - Dependencies and scripts
- `.env` - Environment variables (create this)
- `telegram-claude-state.json` - Persisted bot state

## Available Commands

See README.md for the full list of Telegram bot commands and usage examples.
