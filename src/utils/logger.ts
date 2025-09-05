import chalk from "chalk"

export class Logger {
	private static instance: Logger

	static getInstance(): Logger {
		if (!Logger.instance) {
			Logger.instance = new Logger()
		}
		return Logger.instance
	}

	private constructor() {}

	error(title: string, message: string) {
		const multiline = message.includes("\n")
		if (multiline) {
			console.error(`${chalk.red(title)}:\n${message}`)
		} else {
			console.error(`${chalk.red(title)}: ${message}`)
		}
	}
}

export const logger = Logger.getInstance()
