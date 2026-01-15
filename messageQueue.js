import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';

const STATE_FILE = '.telegram-claude-state.json';

export class MessageQueue {
	constructor() {
		this.tasks = [];
		this.currentRepo = null;
	}

	/**
	 * Load queue state from disk
	 */
	async loadState() {
		try {
			if (existsSync(STATE_FILE)) {
				const data = await readFile(STATE_FILE, 'utf-8');
				const state = JSON.parse(data);
				this.currentRepo = state.currentRepo || null;
				this.tasks = state.tasks || [];
				console.log(`✅ Loaded queue: ${this.tasks.length} tasks, current repo: ${this.currentRepo}`);
			}
		} catch (error) {
			console.error(`❌ Error loading queue state: ${error.message}`);
			this.tasks = [];
		}
	}

	/**
	 * Save queue state to disk (atomic write with temp file)
	 */
	async saveState() {
		try {
			const state = {
				currentRepo: this.currentRepo,
				tasks: this.tasks,
				lastUpdated: new Date().toISOString()
			};
			
			// Write as JSON with formatting for readability
			const json = JSON.stringify(state, null, 2);
			await writeFile(STATE_FILE, json, 'utf-8');
			console.log(`💾 Queue saved: ${this.tasks.length} tasks`);
		} catch (error) {
			console.error(`❌ Error saving queue state: ${error.message}`);
		}
	}

	/**
	 * Add a new task to the queue
	 */
	enqueue(task) {
		const fullTask = {
			id: task.id || randomUUID(),
			messageId: task.messageId,
			chatId: task.chatId,
			type: task.type || 'claude_prompt',
			repo: task.repo || this.currentRepo,
			prompt: task.prompt,
			status: 'pending',
			createdAt: Date.now(),
			startedAt: null,
			completedAt: null,
			result: null,
			error: null,
			retries: 0
		};

		this.tasks.push(fullTask);
		console.log(`📝 Task enqueued: ${fullTask.id} (position ${this.tasks.length})`);
		return fullTask;
	}

	/**
	 * Get the next pending task without removing it
	 */
	getNextTask() {
		return this.tasks.find(task => task.status === 'pending');
	}

	/**
	 * Get a task by ID
	 */
	getTask(taskId) {
		return this.tasks.find(task => task.id === taskId);
	}

	/**
	 * Update task status and result
	 */
	updateTask(taskId, updates) {
		const task = this.getTask(taskId);
		if (!task) {
			console.error(`❌ Task not found: ${taskId}`);
			return null;
		}

		// Update task fields
		if (updates.status) task.status = updates.status;
		if (updates.startedAt !== undefined) task.startedAt = updates.startedAt;
		if (updates.completedAt !== undefined) task.completedAt = updates.completedAt;
		if (updates.result !== undefined) task.result = updates.result;
		if (updates.error !== undefined) task.error = updates.error;
		if (updates.retries !== undefined) task.retries = updates.retries;

		console.log(`📊 Task updated: ${taskId} → ${updates.status}`);
		return task;
	}

	/**
	 * Remove completed/failed tasks from queue (cleanup)
	 */
	removeTask(taskId) {
		const index = this.tasks.findIndex(task => task.id === taskId);
		if (index > -1) {
			const removed = this.tasks.splice(index, 1);
			console.log(`🗑️ Task removed: ${taskId}`);
			return removed[0];
		}
		return null;
	}

	/**
	 * Get all tasks (pending, running, completed)
	 */
	getAllTasks() {
		return this.tasks;
	}

	/**
	 * Get queue statistics
	 */
	getStats() {
		const pending = this.tasks.filter(t => t.status === 'pending').length;
		const running = this.tasks.filter(t => t.status === 'running').length;
		const completed = this.tasks.filter(t => t.status === 'completed').length;
		const failed = this.tasks.filter(t => t.status === 'failed').length;

		return { pending, running, completed, failed, total: this.tasks.length };
	}

	/**
	 * Clear all completed tasks older than N hours
	 */
	cleanup(hoursOld = 24) {
		const cutoffTime = Date.now() - (hoursOld * 60 * 60 * 1000);
		const before = this.tasks.length;

		this.tasks = this.tasks.filter(task => {
			if ((task.status === 'completed' || task.status === 'failed') && task.completedAt < cutoffTime) {
				console.log(`🗑️ Cleanup: Removed old task ${task.id}`);
				return false;
			}
			return true;
		});

		const removed = before - this.tasks.length;
		if (removed > 0) {
			console.log(`🧹 Cleanup: Removed ${removed} old tasks`);
		}
		return removed;
	}

	/**
	 * Clear all tasks (does NOT change current repo)
	 */
	clearAllTasks() {
		this.tasks = [];
		console.log(`🔄 All tasks cleared`);
	}

	/**
	 * Reset queue including repo (used for testing)
	 */
	reset() {
		this.tasks = [];
		this.currentRepo = null;
		console.log(`🔄 Queue reset`);
	}
}

export default MessageQueue;
