// telegram-claude.js
import TelegramBot from 'node-telegram-bot-api';
import { exec } from 'child_process';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import 'dotenv/config';
import { MessageQueue } from './messageQueue.js';
import { TaskManager } from './taskManager.js';

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const ALLOWED_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Define your repositories
const REPOS = {
	'mobile': '/Users/cb/Apps/cbroberg/flutter/flutter-mini-app',
	'movie': '/Users/cb/Apps/cbroberg/torrent-search-api',
	'codescan': '/Users/cb/Apps/cbroberg/codescan',
	'tcc': '/Users/cb/Apps/cbroberg/terminal-claude',
	'experiments': '/Users/cb/Apps/cbroberg/experiments'
};

// State management
const STATE_FILE = '.telegram-claude-state.json';
let currentRepo = null;
let pendingCommit = null;

// Initialize queue and task manager
const queue = new MessageQueue();
let taskManager = null;

// Load state
async function loadState() {
	if (existsSync(STATE_FILE)) {
		const data = await readFile(STATE_FILE, 'utf-8');
		const state = JSON.parse(data);
		currentRepo = state.currentRepo;
	}
	
	// Load queue state
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

// Start bot
await loadState();

// Initialize and start task manager
taskManager = new TaskManager(queue);

// Listen to task events
taskManager.on('task:started', (task) => {
	console.log(`📢 Task started: ${task.id}`);
});

taskManager.on('task:completed', async ({ task, output }) => {
	console.log(`✅ Task completed: ${task.id}`);
	try {
		// Strip markdown special characters that might cause parsing issues
		const cleanOutput = output
			.replace(/[*_`\[\]()~\\]/g, '')
			.trim();
		
		const message = cleanOutput.length > 4000 
			? `✅ Answer:\n${cleanOutput.slice(0, 4000)}...`
			: `✅ Answer:\n${cleanOutput}`;
		
		await bot.sendMessage(task.chatId, message);
	} catch (error) {
		console.error(`Error sending message: ${error.message}`);
	}
});

taskManager.on('task:failed', async ({ task, error }) => {
	console.log(`❌ Task failed: ${task.id}`);
	try {
		const message = `❌ Error: ${error.slice(0, 500)}`;
		await bot.sendMessage(task.chatId, message);
	} catch (err) {
		console.error(`Error sending message: ${err.message}`);
	}
});

taskManager.on('task:retry', async ({ task, attempt }) => {
	console.log(`🔄 Task retry: ${task.id} (attempt ${attempt})`);
	try {
		const message = `🔄 Retrying (attempt ${attempt}/${process.env.MAX_RETRIES || 3})`;
		await bot.sendMessage(task.chatId, message);
	} catch (error) {
		console.error(`Error sending message: ${error.message}`);
	}
});

// Start processing queue in background
setTimeout(() => {
	taskManager.start().catch(error => {
		console.error(`Task manager error: ${error.message}`);
	});
}, 1000);

// Command: /help - Show all commands
bot.onText(/\/help/, (msg) => {
	if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;

	const helpText = `
🤖 *Claude Code Telegram Bot*

*Repository Commands:*
/repos - Show all repositories
/web, /api, /mobile - Switch repository
/status - Show active repository

*File Commands:*
/ls [path] - List files
/cat <file> - Show file content

*Git Commands:*
/git or /gstatus - Git status
/diff - Show changes
/log [count] - Show commits (default: 5)
/branch - Show branches
/commit <message> - Add, commit and push
/qc or /quickcommit - Auto-generate commit message
/pull - Pull changes
/stash - Stash changes
/unstash - Pop stash

*Queue & Task Commands:*
/queue or /q - Show queue status
/clearqueue or /cq - Clear queue
/cancel <task_id> - Cancel a task
/cancel all - Cancel all tasks

*Other:*
Send a message - Add prompt to queue
Send an image - Save screenshot to repo
Send a file - Upload to repo
`;

	bot.sendMessage(msg.chat.id, helpText);
});

// Command: /repos - Show available repositories
bot.onText(/\/repos/, (msg) => {
	if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;

	const repoList = Object.keys(REPOS)
		.map(key => `/${key} - ${REPOS[key]}`)
		.join('\n');

	const current = currentRepo ? `\n\n📂 Active: ${currentRepo}` : '';

	bot.sendMessage(msg.chat.id, `📚 Available repositories:\n\n${repoList}${current}`);
});

// Command: /queue or /q - Show queue status
bot.onText(/\/(queue|q)/, (msg) => {
	if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;

	const stats = queue.getStats();
	const tasks = queue.getAllTasks();

	if (tasks.length === 0) {
		return bot.sendMessage(msg.chat.id, '📋 Queue is empty');
	}

	const taskList = tasks
		.map((task, idx) => {
			const status = task.status === 'running' ? '▶️' : task.status === 'completed' ? '✅' : task.status === 'failed' ? '❌' : '⏳';
			const elapsed = task.startedAt ? Math.round((Date.now() - task.startedAt) / 1000) : 0;
			const time = elapsed > 0 ? ` [${elapsed}s]` : '';
			return `${idx + 1}. ${status} ${task.prompt.slice(0, 30)}...${time}`;
		})
		.join('\n');

	const header = `📋 Queue Status\n\n⏳ Pending: ${stats.pending}\n▶️ Running: ${stats.running}\n✅ Completed: ${stats.completed}\n❌ Failed: ${stats.failed}\n`;

	bot.sendMessage(msg.chat.id, `${header}\n${taskList}`);
});

// Command: /clearqueue or /cq - Clear queue
bot.onText(/\/(clearqueue|cq)/, (msg) => {
	if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;

	const stats = queue.getStats();
	const totalTasks = stats.pending + stats.running + stats.completed + stats.failed;

	if (totalTasks === 0) {
		return bot.sendMessage(msg.chat.id, '📋 Queue is already empty');
	}

	queue.clearAllTasks();
	queue.saveState();
	bot.sendMessage(msg.chat.id, `🗑️ Queue cleared! Deleted ${totalTasks} task(s)`);
	console.log(`📋 Current repo still: ${queue.currentRepo}`);
});

// Command: /cancel <task_id> or /cancel all - Cancel task(s)
bot.onText(/\/cancel\s+(.+)/, (msg, match) => {
	if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;

	const arg = match[1].trim().toLowerCase();

	if (arg === 'all') {
		const stats = queue.getStats();
		const totalTasks = stats.pending + stats.running;

		if (totalTasks === 0) {
			return bot.sendMessage(msg.chat.id, '📋 No tasks to cancel');
		}

		// Cancel running task if any
		if (stats.running > 0) {
			const currentTask = taskManager.currentTask;
			if (currentTask) {
				taskManager.cancelTask(currentTask.id);
			}
		}

		// Cancel all pending tasks
		const tasks = queue.getAllTasks();
		tasks.forEach(task => {
			if (task.status === 'pending' || task.status === 'running') {
				queue.updateTask(task.id, { status: 'cancelled' });
			}
		});
		queue.saveState();

		bot.sendMessage(msg.chat.id, `🛑 Cancelled ${totalTasks} task(s)`);
	} else {
		// Cancel specific task by ID
		const taskId = arg;
		const success = taskManager.cancelTask(taskId);

		if (success) {
			bot.sendMessage(msg.chat.id, `🛑 Task cancelled: ${taskId}`);
		} else {
			bot.sendMessage(msg.chat.id, `❌ Task not found or already completed: ${taskId}`);
		}
	}
});

// Command: /web, /api, /mobile etc. - Switch repository
Object.keys(REPOS).forEach(repoName => {
	bot.onText(new RegExp(`^\/${repoName}$`), async (msg) => {
		if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;

		currentRepo = repoName;
		await saveState();
		bot.sendMessage(msg.chat.id, `✅ Switched to: ${repoName}\n📂 ${REPOS[repoName]}`);
	});
});

// Command: /status - Show active repository
bot.onText(/\/status/, (msg) => {
	if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;

	if (currentRepo) {
		bot.sendMessage(msg.chat.id, `📂 Active repo: ${currentRepo}\n${REPOS[currentRepo]}`);
	} else {
		bot.sendMessage(msg.chat.id, '⚠️ No repository selected. Use /repos to choose.');
	}
});

// Command: /ls - List files in current directory
bot.onText(/\/ls(.*)/, (msg, match) => {
	if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;
	if (!currentRepo) {
		return bot.sendMessage(msg.chat.id, '⚠️ Please select a repo first using /repos');
	}

	const subPath = match[1].trim() || '';
	const fullPath = path.join(REPOS[currentRepo], subPath);

	exec(`ls -la "${fullPath}"`, (error, stdout, stderr) => {
		if (error) {
			return bot.sendMessage(msg.chat.id, `❌ Error: ${stderr}`);
		}
		bot.sendMessage(msg.chat.id, `📁 ${subPath || '/'}\n${stdout}`);
	});
});

// Command: /cat - Show file content
bot.onText(/\/cat (.+)/, async (msg, match) => {
	if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;
	if (!currentRepo) {
		return bot.sendMessage(msg.chat.id, '⚠️ Please select a repo first using /repos');
	}

	const filePath = match[1].trim();
	const fullPath = path.join(REPOS[currentRepo], filePath);

	try {
		console.log(`📖 Reading: ${fullPath}`);
		const content = await readFile(fullPath, 'utf-8');
		const ext = path.extname(filePath).slice(1) || 'txt';

		console.log(`✅ Read ${content.length} chars from ${filePath}`);

		// Send in chunks if file is large
		if (content.length > 4000) {
			bot.sendMessage(msg.chat.id, `📄 ${filePath} (too large, showing first 4000 chars)`);
			bot.sendMessage(msg.chat.id, `${content.slice(0, 4000)}`);
		} else {
			bot.sendMessage(msg.chat.id, `📄 ${filePath}\n${content}`);
		}
	} catch (error) {
		console.error(`❌ Error reading file: ${error.message}`);
		bot.sendMessage(msg.chat.id, `❌ Could not read file: ${error.message}\n\nFull path: ${fullPath}`);
	}
});

// Command: /git or /gstatus - Show git status
bot.onText(/^\/git$|^\/gstatus$/, (msg) => {
	if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;
	if (!currentRepo) {
		return bot.sendMessage(msg.chat.id, '⚠️ Please select a repo first using /repos');
	}

	const repoPath = REPOS[currentRepo];

	exec(`cd "${repoPath}" && git status`, (error, stdout, stderr) => {
		if (error) {
			return bot.sendMessage(msg.chat.id, `❌ Error: ${stderr}`);
		}
			bot.sendMessage(msg.chat.id, `🔀 Git Status (${currentRepo}):\n${stdout}`);
	});
});

// Command: /diff - Show git diff
bot.onText(/\/diff/, (msg) => {
	if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;
	if (!currentRepo) {
		return bot.sendMessage(msg.chat.id, '⚠️ Please select a repo first using /repos');
	}

	const repoPath = REPOS[currentRepo];

	exec(`cd "${repoPath}" && git diff`, (error, stdout, stderr) => {
		if (error) {
			return bot.sendMessage(msg.chat.id, `❌ Error: ${stderr}`);
		}

		if (!stdout) {
			return bot.sendMessage(msg.chat.id, '✨ No changes to show');
		}

		// Send in chunks if diff is large
		if (stdout.length > 4000) {
			bot.sendMessage(msg.chat.id, `📝 Diff (first 4000 chars):\n${stdout.slice(0, 4000)}`);
		} else {
			bot.sendMessage(msg.chat.id, `📝 Diff:\n${stdout}`);
		}
	});
});

// Command: /log - Show git log
bot.onText(/\/log(?:\s+(\d+))?/, (msg, match) => {
	if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;
	if (!currentRepo) {
		return bot.sendMessage(msg.chat.id, '⚠️ Please select a repo first using /repos');
	}

	const limit = match[1] || '5';
	const repoPath = REPOS[currentRepo];

	exec(`cd "${repoPath}" && git log --oneline -${limit}`, (error, stdout, stderr) => {
		if (error) {
			return bot.sendMessage(msg.chat.id, `❌ Error: ${stderr}`);
		}
		bot.sendMessage(msg.chat.id, `📜 Latest commits:\n${stdout}`);
	});
});

// Command: /branch - Show branches
bot.onText(/\/branch/, (msg) => {
	if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;
	if (!currentRepo) {
		return bot.sendMessage(msg.chat.id, '⚠️ Please select a repo first using /repos');
	}

	const repoPath = REPOS[currentRepo];

	exec(`cd "${repoPath}" && git branch -a`, (error, stdout, stderr) => {
		if (error) {
			return bot.sendMessage(msg.chat.id, `❌ Error: ${stderr}`);
		}
		bot.sendMessage(msg.chat.id, `🌿 Branches:\n${stdout}`);
	});
});

// Command: /commit <message> - Add all, commit and push
bot.onText(/\/commit (.+)/, (msg, match) => {
	if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;
	if (!currentRepo) {
		return bot.sendMessage(msg.chat.id, '⚠️ Please select a repo first using /repos');
	}

	const commitMessage = match[1];

	bot.sendMessage(msg.chat.id, `⚠️ This will add, commit and push all changes with:\n\n"${commitMessage}"\n\nSend /yes to confirm or /no to cancel`, {
		reply_markup: {
			keyboard: [['/yes'], ['/no']],
			one_time_keyboard: true,
			resize_keyboard: true
		}
	});

	// Store pending commit
	pendingCommit = { repo: currentRepo, message: commitMessage };
});

// Command: /yes - Confirm pending commit
bot.onText(/\/yes/, (msg) => {
	if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;

	if (!pendingCommit) {
		return bot.sendMessage(msg.chat.id, '⚠️ No pending commit', {
			reply_markup: {
				remove_keyboard: true
			}
		});
	}

	const { repo, message } = pendingCommit;
	const repoPath = REPOS[repo];

	bot.sendMessage(msg.chat.id, `🔄 Committing and pushing...`, {
		reply_markup: {
			remove_keyboard: true
		}
	});

	const commands = [
		`cd "${repoPath}"`,
		`git add .`,
		`git commit -m "${message.replace(/"/g, '\\"')}"`,
		`git push`
	].join(' && ');

	exec(commands, (error, stdout, stderr) => {
		pendingCommit = null;

		if (error) {
			if (stderr.includes('nothing to commit')) {
				return bot.sendMessage(msg.chat.id, '✨ No changes to commit');
			}
			return bot.sendMessage(msg.chat.id, `❌ Error:\n${stderr}`);
		}

		const output = stdout + stderr;
		bot.sendMessage(msg.chat.id, `✅ Committed and pushed!\n${output}`);
	});
});

// Command: /no - Cancel pending commit
bot.onText(/\/no/, (msg) => {
	if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;

	pendingCommit = null;
	bot.sendMessage(msg.chat.id, '❌ Commit cancelled', {
		reply_markup: {
			remove_keyboard: true
		}
	});
});

// Helper function to generate commit message
function generateCommitMessage(repoPath, diff, chatId) {
	const prompt = `Based on this git diff, write a concise commit message (max 72 chars, conventional commits style if possible):\n\n${diff.slice(0, 2000)}`;

	const nodeExe = process.execPath;
	const claudeCliPath = '/Users/cb/.nvm/versions/node/v22.9.0/lib/node_modules/@anthropic-ai/claude-code/cli.js';
	exec(`cd "${repoPath}" && "${nodeExe}" "${claudeCliPath}" --dangerously-skip-permissions -p "${prompt.replace(/"/g, '\\"')}"`,
		{ cwd: repoPath },
		(error, stdout, stderr) => {
			if (error) {
				return bot.sendMessage(chatId, `❌ Could not generate commit message: ${stderr}`);
			}

			// Extract commit message from output
			const commitMsg = stdout.trim().split('\n')[0].replace(/^["']|["']$/g, '');

			bot.sendMessage(chatId, `💡 Suggested commit:\n"${commitMsg}"\n\nCommit with:\n/commit ${commitMsg}\n\nOr write your own commit message`);
		}
	);
}

// Command: /quickcommit or /qc - Let Claude Code create commit message
bot.onText(/\/quickcommit|\/qc/, (msg) => {
	if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;
	if (!currentRepo) {
		return bot.sendMessage(msg.chat.id, '⚠️ Please select a repo first using /repos');
	}

	const repoPath = REPOS[currentRepo];

	bot.sendMessage(msg.chat.id, `🤔 Analyzing changes...`);

	// Get git diff to create smart commit message
	exec(`cd "${repoPath}" && git diff --cached`, (error, stdout, stderr) => {
		if (error) {
			return bot.sendMessage(msg.chat.id, `❌ Error: ${stderr}`);
		}

		if (!stdout) {
			// Nothing staged, stage everything first
			exec(`cd "${repoPath}" && git add . && git diff --cached`, (error2, stdout2) => {
				if (error2) {
					return bot.sendMessage(msg.chat.id, `❌ Error: ${error2.message}`);
				}

				if (!stdout2) {
					return bot.sendMessage(msg.chat.id, '✨ No changes to commit');
				}

				generateCommitMessage(repoPath, stdout2, msg.chat.id);
			});
		} else {
			generateCommitMessage(repoPath, stdout, msg.chat.id);
		}
	});
});

// Command: /pull - Git pull
bot.onText(/\/pull/, (msg) => {
	if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;
	if (!currentRepo) {
		return bot.sendMessage(msg.chat.id, '⚠️ Please select a repo first using /repos');
	}

	const repoPath = REPOS[currentRepo];

	bot.sendMessage(msg.chat.id, `⬇️ Pulling changes...`);

	exec(`cd "${repoPath}" && git pull`, (error, stdout, stderr) => {
		if (error) {
			return bot.sendMessage(msg.chat.id, `❌ Error: ${stderr}`);
		}

		const output = stdout || stderr;
		bot.sendMessage(msg.chat.id, `✅ Pull complete!\n${output}`);
	});
});

// Command: /stash - Git stash
bot.onText(/\/stash/, (msg) => {
	if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;
	if (!currentRepo) {
		return bot.sendMessage(msg.chat.id, '⚠️ Please select a repo first using /repos');
	}

	const repoPath = REPOS[currentRepo];

	exec(`cd "${repoPath}" && git stash`, (error, stdout, stderr) => {
		if (error) {
			return bot.sendMessage(msg.chat.id, `❌ Error: ${stderr}`);
		}
		bot.sendMessage(msg.chat.id, `📦 Stashed!\n${stdout}`);
	});
});

// Command: /unstash - Git stash pop
bot.onText(/\/unstash/, (msg) => {
	if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;
	if (!currentRepo) {
		return bot.sendMessage(msg.chat.id, '⚠️ Please select a repo first using /repos');
	}

	const repoPath = REPOS[currentRepo];

	exec(`cd "${repoPath}" && git stash pop`, (error, stdout, stderr) => {
		if (error) {
			return bot.sendMessage(msg.chat.id, `❌ Error: ${stderr}`);
		}
		bot.sendMessage(msg.chat.id, `📂 Unstashed!\n${stdout}`);
	});
});

// Handle documents/files sent to the bot
bot.on('document', async (msg) => {
	if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;
	if (!currentRepo) {
		return bot.sendMessage(msg.chat.id, '⚠️ Please select a repo first using /repos');
	}

	const fileId = msg.document.file_id;
	const fileName = msg.document.file_name;

	bot.sendMessage(msg.chat.id, `📥 Receiving ${fileName}...`);

	try {
		const file = await bot.getFile(fileId);
		const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${file.file_path}`;

		// Download fil til current repo
		const savePath = path.join(REPOS[currentRepo], fileName);

		exec(`curl -o "${savePath}" "${fileUrl}"`, (error) => {
			if (error) {
				return bot.sendMessage(msg.chat.id, `❌ Could not save file: ${error.message}`);
			}
			bot.sendMessage(msg.chat.id, `✅ Saved: ${fileName}\nNow use Claude Code to work with it!`);
		});
	} catch (error) {
		bot.sendMessage(msg.chat.id, `❌ Error: ${error.message}`);
	}
});

// Handle screenshots/images
bot.on('photo', async (msg) => {
	if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;

	const photo = msg.photo[msg.photo.length - 1]; // Highest quality
	const fileId = photo.file_id;

	bot.sendMessage(msg.chat.id, `📸 Receiving screenshot...`);

	try {
		const file = await bot.getFile(fileId);
		const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${file.file_path}`;

		if (currentRepo) {
			const timestamp = Date.now();
			const savePath = path.join(REPOS[currentRepo], `screenshot-${timestamp}.jpg`);

			exec(`curl -o "${savePath}" "${fileUrl}"`, (error) => {
				if (error) {
					return bot.sendMessage(msg.chat.id, `❌ Could not save: ${error.message}`);
				}
				bot.sendMessage(msg.chat.id, `✅ Screenshot saved!\nNow you can prompt: "Implement UI from screenshot-${timestamp}.jpg"`);
			});
		} else {
			bot.sendMessage(msg.chat.id, `⚠️ Please select a repo first using /repos to save screenshot`);
		}
	} catch (error) {
		bot.sendMessage(msg.chat.id, `❌ Error: ${error.message}`);
	}
});

// Handle normal messages (prompts for Claude Code)
bot.on('message', async (msg) => {
	// Skip if it's a command or file
	if (msg.text?.startsWith('/') || msg.document || msg.photo) return;
	if (msg.chat.id.toString() !== ALLOWED_CHAT_ID) return;

	if (!currentRepo) {
		return bot.sendMessage(msg.chat.id, '⚠️ Please select a repo first using /repos');
	}

	const prompt = msg.text;

	// Add task to queue
	const task = queue.enqueue({
		messageId: msg.message_id,
		chatId: msg.chat.id,
		type: 'claude_prompt',
		repo: currentRepo,
		prompt: prompt
	});

	// Save queue to disk
	await queue.saveState();

	// Send confirmation with queue position
	const position = queue.getStats().pending + queue.getStats().running;
	const statusMsg = await bot.sendMessage(msg.chat.id, `⏳ Added to queue (position ${position})\nTask ID: ${task.id}`);

	// Store message ID for later updates
	task.messageId = statusMsg.message_id;
	await queue.saveState();
});

console.log('🚀 Telegram Claude Bot ready!');
console.log(`📂 Repositories: ${Object.keys(REPOS).join(', ')}`);
if (currentRepo) {
	console.log(`✅ Active: ${currentRepo}`);
}
console.log('\nSend /help in Telegram to see all commands');