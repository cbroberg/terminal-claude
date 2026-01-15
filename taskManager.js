import { spawn, exec } from 'child_process';
import EventEmitter from 'events';
import { Logger } from './logger.js';

// Repository paths (same as in server.js)
const REPOS = {
	'mobile': '/Users/cb/Apps/cbroberg/flutter/flutter-mini-app',
	'movie': '/Users/cb/Apps/cbroberg/torrent-search-api',
	'codescan': '/Users/cb/Apps/cbroberg/codescan',
	'tcc': '/Users/cb/Apps/cbroberg/terminal-claude',
	'experiments': '/Users/cb/Apps/cbroberg/experiments'
};

const ACTIVITY_TIMEOUT_MS = parseInt(process.env.ACTIVITY_TIMEOUT_MS || '30000');
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '3');
const RETRY_BACKOFF_BASE = parseInt(process.env.RETRY_BACKOFF_BASE || '1000');

export class TaskManager extends EventEmitter {
	constructor(queue) {
		super();
		this.queue = queue;
		this.currentTask = null;
		this.currentProcess = null;
		this.isProcessing = false;
		this.activityTimer = null;
	}

	/**
	 * Start processing tasks from the queue
	 */
	async start() {
		if (this.isProcessing) return;
		this.isProcessing = true;
		console.log('🚀 Task manager started');

		while (this.isProcessing) {
			const task = this.queue.getNextTask();

			if (!task) {
				// No pending tasks, wait and retry
				await this.sleep(1000);
				continue;
			}

			await this.processTask(task);
		}
	}

	/**
	 * Stop processing tasks
	 */
	stop() {
		this.isProcessing = false;
		if (this.currentProcess) {
			this.currentProcess.kill();
		}
		if (this.activityTimer) {
			clearTimeout(this.activityTimer);
		}
		console.log('⏹️ Task manager stopped');
	}

	/**
	 * Process a single Claude Code task
	 */
	async processTask(task) {
		this.currentTask = task;
		const nodeExe = process.execPath;
		const claudeCliPath = '/Users/cb/.nvm/versions/node/v22.9.0/lib/node_modules/@anthropic-ai/claude-code/cli.js';
		const repoPath = REPOS[task.repo];

		if (!repoPath) {
			await Logger.error(`Unknown repo: ${task.repo}`);
			await this.handleTaskFailure(task, `Unknown repository: ${task.repo}`);
			return;
		}

		await Logger.section(`TASK STARTED: ${task.id}`);
		await Logger.info('Task Details', {
			id: task.id,
			prompt: task.prompt.slice(0, 100),
			repo: task.repo,
			repoPath: repoPath,
			messageId: task.messageId,
			chatId: task.chatId
		});

		console.log(`\n▶️ Starting task ${task.id}`);
		console.log(`   Prompt: ${task.prompt.slice(0, 50)}...`);
		console.log(`   Repo: ${task.repo} (${repoPath})`);

		this.queue.updateTask(task.id, {
			status: 'running',
			startedAt: Date.now()
		});
		this.emit('task:started', task);

		// Build command with proper escaping
		const escapedPrompt = task.prompt.replace(/"/g, '\\"');
		const command = `node "${claudeCliPath}" --dangerously-skip-permissions -p "${escapedPrompt}"`;
		
		await Logger.info('Executing command via exec', {
			commandPreview: command.slice(0, 200),
			cwd: repoPath
		});

		console.log(`📝 Command: ${command.slice(0, 150)}...`);

		return new Promise((resolve) => {
			const proc = spawn('bash', ['-c', command], {
				cwd: repoPath,
				stdio: ['ignore', 'pipe', 'pipe']
			});

			let stdout = '';
			let stderr = '';

			proc.stdout.on('data', (data) => {
				stdout += data.toString();
				console.log(`📤 stdout: ${data.length} bytes`);
			});

			proc.stderr.on('data', (data) => {
				stderr += data.toString();
				console.log(`⚠️ stderr: ${data.length} bytes`);
			});

			proc.on('error', async (error) => {
				await Logger.error('Process error', { message: error.message });
				console.error(`❌ Error: ${error.message}`);
				await this.handleTaskFailure(task, error.message);
				this.currentTask = null;
				this.currentProcess = null;
				resolve();
			});

			proc.on('close', async (code, signal) => {
				await Logger.info('Process closed', {
					code: code,
					signal: signal,
					stdoutLength: stdout.length,
					stderrLength: stderr.length
				});

				console.log(`✅ Process closed: code=${code}, stdout=${stdout.length} bytes`);

				const output = (stdout || stderr || '').trim();

				if (code === 0 && output) {
					await Logger.info('Command succeeded', {
						outputLength: output.length,
						preview: output.slice(0, 200)
					});
					await this.handleTaskComplete(task, output);
				} else {
					await Logger.error('Command failed', { code, stderr: stderr.slice(0, 500) });
					await this.handleTaskFailure(task, stderr || `Exit code ${code}`);
				}

				this.currentTask = null;
				this.currentProcess = null;
				resolve();
			});

		});
	}



	/**
	 * Handle successful task completion
	 */
	async handleTaskComplete(task, output) {
		this.queue.updateTask(task.id, {
			status: 'completed',
			completedAt: Date.now(),
			result: output
		});

		await this.queue.saveState();
		
		// Remove completed task from queue
		this.queue.removeTask(task.id);
		await this.queue.saveState();
		
		this.emit('task:completed', { task, output });
	}

	/**
	 * Handle task failure with retry logic
	 */
	async handleTaskFailure(task, error) {
		if (task.retries < MAX_RETRIES) {
			const retryDelay = RETRY_BACKOFF_BASE * Math.pow(2, task.retries);
			console.log(`🔄 Retrying task ${task.id} in ${retryDelay}ms (attempt ${task.retries + 1}/${MAX_RETRIES})`);

			this.queue.updateTask(task.id, {
				status: 'pending',
				retries: task.retries + 1,
				error: `Failed: ${error}. Retrying...`
			});

			await this.queue.saveState();
			this.emit('task:retry', { task, attempt: task.retries + 1, delay: retryDelay });

			await this.sleep(retryDelay);
		} else {
			console.log(`❌ Task ${task.id} failed permanently after ${MAX_RETRIES} retries`);
			this.queue.updateTask(task.id, {
				status: 'failed',
				completedAt: Date.now(),
				error: error
			});

			await this.queue.saveState();
			this.emit('task:failed', { task, error });
		}
	}

	/**
	 * Cancel a running task
	 */
	cancelTask(taskId) {
		if (this.currentTask && this.currentTask.id === taskId) {
			if (this.currentProcess) {
				this.currentProcess.kill();
				console.log(`🛑 Killed running task ${taskId}`);
				return true;
			}
		} else {
			// Mark pending task as cancelled
			const task = this.queue.getTask(taskId);
			if (task && task.status === 'pending') {
				this.queue.updateTask(taskId, {
					status: 'cancelled',
					completedAt: Date.now()
				});
				console.log(`🛑 Cancelled pending task ${taskId}`);
				return true;
			}
		}
		return false;
	}

	/**
	 * Get current task status
	 */
	getStatus() {
		return {
			isProcessing: this.isProcessing,
			currentTask: this.currentTask,
			queueStats: this.queue.getStats()
		};
	}

	/**
	 * Helper: Sleep for N milliseconds
	 */
	sleep(ms) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}
}

export default TaskManager;
