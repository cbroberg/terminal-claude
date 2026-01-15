import { appendFile } from 'fs/promises';
import { existsSync, unlinkSync } from 'fs';
import path from 'path';

const LOG_FILE = 'bot.log';

// Clear log file on startup
if (existsSync(LOG_FILE)) {
	unlinkSync(LOG_FILE);
}

export class Logger {
	static async log(level, message, data = null) {
		const timestamp = new Date().toISOString();
		let logEntry = `[${timestamp}] [${level}] ${message}`;
		
		if (data) {
			logEntry += `\n${JSON.stringify(data, null, 2)}`;
		}
		logEntry += '\n';

		console.log(logEntry);
		
		try {
			await appendFile(LOG_FILE, logEntry, 'utf-8');
		} catch (error) {
			console.error(`Failed to write to log file: ${error.message}`);
		}
	}

	static async info(message, data = null) {
		await this.log('INFO', message, data);
	}

	static async debug(message, data = null) {
		await this.log('DEBUG', message, data);
	}

	static async warn(message, data = null) {
		await this.log('WARN', message, data);
	}

	static async error(message, data = null) {
		await this.log('ERROR', message, data);
	}

	static async section(title) {
		const separator = '='.repeat(80);
		const message = `\n${separator}\n${title}\n${separator}`;
		console.log(message);
		try {
			await appendFile(LOG_FILE, message + '\n', 'utf-8');
		} catch (error) {
			console.error(`Failed to write to log file: ${error.message}`);
		}
	}
}

export default Logger;
