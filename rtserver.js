// rtserver.js - Real-Time Claude Code streaming server
// Keeps Claude running continuously and streams output to stdout for external capture
// Integrates with Telegram bot for real-time feedback

import TelegramBot from 'node-telegram-bot-api';
import { spawn } from 'child_process';
import { exec } from 'child_process';
import { readFile, writeFile } from 'fs/promises';
import { existsSync, statSync } from 'fs';
import path from 'path';
import 'dotenv/config';
import { MessageQueue } from './messageQueue.js';
import { TaskManager } from './taskManager.js';
import readline from 'readline';

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const ALLOWED_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const REPOS = {
	'mobile': '/Users/cb/Apps/cbroberg/flutter/flutter-mini-app',
	'movie': '/Users/cb/Apps/cbroberg/torrent-search-api',
	'codescan': '/Users/cb/Apps/cbroberg/codescan',
	'tcc': '/Users/cb/Apps/cbroberg/terminal-claude',
	'experiments': '/Users/cb/Apps/cbroberg/experiments'
};

// GitHub URLs for each repository
const GITHUB_URLS = {
	'mobile': 'https://github.com/cbroberg/flutter-mini-app',
	'movie': 'https://github.com/cbroberg/torrent-search-api',
	'codescan': 'https://github.com/cbroberg/codescan',
	'tcc': 'https://github.com/cbroberg/terminal-claude',
	'experiments': 'https://github.com/cbroberg/experiments'
};

const STATE_FILE = '.rtserver-state.json';
let currentRepo = null;
let pendingCommit = null;
let currentChatId = null;
const queue = new MessageQueue();
let taskManager = null;
let rl = null;
let claudeProcess = null;

// Initialize readline for stdin input
function initReadline() {
	rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
		terminal: false
	});

	rl.on('line', (line) => {
		handleUserInput(line.trim());
	});

	rl.on('close', () => {
		console.log('\n🛑 Input stream closed');
		process.exit(0);
	});
}

// Load saved state
async function loadState() {
	if (existsSync(STATE_FILE)) {
		const data = await readFile(STATE_FILE, 'utf-8');
		const state = JSON.parse(data);
		currentRepo = state.currentRepo;
	}

	await queue.loadState();
	if (queue.currentRepo) {
		currentRepo = queue.currentRepo;
	}
}

// Save state
async function saveState() {
	queue.currentRepo = currentRepo;
	await queue.saveState();
}

// Handle user input (either as a prompt or command)
async function handleUserInput(input) {
	if (!input) return;

	// Handle commands
	if (input.startsWith('/')) {
		await handleCommand(input);
	} else {
		// Regular prompt - add to queue
		if (!currentRepo) {
			console.log('❌ ERROR: No repository selected. Use /repo <name> to select one.');
			console.log(`Available: ${Object.keys(REPOS).join(', ')}`);
			return;
		}

		const task = queue.enqueue({
			chatId: 'cli',
			type: 'claude_prompt',
			repo: currentRepo,
			prompt: input
		});

		await queue.saveState();
		console.log(`✅ QUEUED: ${task.id} (${queue.getStats().pending + queue.getStats().running} in queue)`);
	}
}

// Handle CLI commands
async function handleCommand(input) {
	const [cmd, ...args] = input.split(/\s+/);

	switch (cmd) {
		case '/repos':
			console.log('📚 Available repositories:');
			Object.keys(REPOS).forEach(name => {
				const marker = currentRepo === name ? ' ✅' : '';
				console.log(`  ${name}${marker}`);
			});
			break;

		case '/repo':
		case '/r':
			if (args.length === 0) {
				console.log(`❌ Usage: /repo <name>`);
				console.log(`Available: ${Object.keys(REPOS).join(', ')}`);
				break;
			}
			const repoName = args[0];
			if (REPOS[repoName]) {
				currentRepo = repoName;
				await saveState();
				console.log(`✅ Switched to: ${repoName}`);
			} else {
				console.log(`❌ Unknown repo: ${repoName}`);
				console.log(`Available: ${Object.keys(REPOS).join(', ')}`);
			}
			break;

		case '/status':
		case '/s':
			if (currentRepo) {
				console.log(`📂 Active repo: ${currentRepo}`);
				console.log(`   Path: ${REPOS[currentRepo]}`);
			} else {
				console.log('⚠️ No repository selected');
			}
			break;

		case '/queue':
		case '/q':
			const stats = queue.getStats();
			console.log(`📋 Queue Status:`);
			console.log(`   Pending: ${stats.pending}`);
			console.log(`   Running: ${stats.running}`);
			console.log(`   Completed: ${stats.completed}`);
			console.log(`   Failed: ${stats.failed}`);
			if (stats.total === 0) {
				console.log('   (empty)');
			} else {
				const tasks = queue.getAllTasks();
				tasks.forEach((task, idx) => {
					const icon = task.status === 'running' ? '▶️' : task.status === 'completed' ? '✅' : task.status === 'failed' ? '❌' : '⏳';
					console.log(`   ${idx + 1}. ${icon} ${task.prompt.slice(0, 40)}... [${task.id.slice(0, 8)}]`);
				});
			}
			break;

		case '/clear':
		case '/cq':
			const stats2 = queue.getStats();
			const total = stats2.pending + stats2.running + stats2.completed + stats2.failed;
			if (total === 0) {
				console.log('📋 Queue already empty');
			} else {
				queue.clearAllTasks();
				await queue.saveState();
				console.log(`🗑️ Queue cleared (${total} task(s) removed)`);
			}
			break;

		case '/help':
		case '/h':
		case '/?':
			console.log(`
🤖 Real-Time Claude Code Terminal

Commands:
  /repo <name>      Switch repository (mobile, movie, codescan, tcc, experiments)
  /repos            List all repositories
  /status           Show active repository
  /queue            Show queue status
  /clear            Clear all tasks
  /stop             Stop the server

Just type a message to add it as a prompt to the queue.
`);
			break;

		case '/stop':
		case '/exit':
		case '/quit':
			console.log('🛑 Shutting down...');
			process.exit(0);
			break;

		default:
			console.log(`❌ Unknown command: ${cmd}`);
			console.log('Use /help for available commands');
	}
}

// Initialize and start
async function initialize() {
	await loadState();

	// Initialize queue and task manager
	taskManager = new TaskManager(queue);

	// Listen to task events - stream output to stdout
	taskManager.on('task:started', (task) => {
		console.log(`\n▶️ RUNNING: ${task.id}`);
		console.log(`📝 Prompt: ${task.prompt.slice(0, 80)}...`);
	});

	taskManager.on('task:completed', async ({ task, output }) => {
		console.log(`\n✅ COMPLETED: ${task.id}`);
		console.log('━'.repeat(80));
		console.log(output);
		console.log('━'.repeat(80));
	});

	taskManager.on('task:failed', async ({ task, error }) => {
		console.log(`\n❌ FAILED: ${task.id}`);
		console.log(`Error: ${error.slice(0, 500)}`);
	});

	taskManager.on('task:retry', async ({ task, attempt }) => {
		console.log(`\n🔄 RETRYING: ${task.id} (attempt ${attempt})`);
	});

	// Start processing queue in background
	setTimeout(() => {
		taskManager.start().catch(error => {
			console.error(`Task manager error: ${error.message}`);
		});
	}, 1000);

	// Initialize readline for user input
	initReadline();

	console.log('🚀 Real-Time Claude Code Server started!');
	console.log(`📂 Repositories: ${Object.keys(REPOS).join(', ')}`);
	if (currentRepo) {
		console.log(`✅ Active: ${currentRepo}`);
	}
	console.log('\n💬 Type a message to add to queue, or /help for commands\n');
}

// Start the server
initialize().catch(error => {
	console.error('Failed to initialize:', error);
	process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
	console.log('\n🛑 Shutting down...');
	if (taskManager) {
		taskManager.stop();
	}
	if (rl) {
		rl.close();
	}
	process.exit(0);
});
