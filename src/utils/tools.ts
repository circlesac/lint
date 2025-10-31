import { execSync } from "child_process"
import { access, appendFile, writeFile } from "fs/promises"
import { dirname, join, resolve } from "path"
import { readPackageUp } from "read-package-up"
import { fileURLToPath } from "url"

export interface ToolConfig {
	name: string
	title: string
	command: string
	args: string[]
	configArg?: string
	configFile?: string
	ignoreArg?: string
	ignoreFile?: string
}

interface FailureLogData {
	tool: string
	toolVersion?: string
	command: string
	args: string[]
	exitCode?: number
	stdout?: string
	stderr?: string
	workingDir: string
	timestamp: string
}

export async function runTool(tool: ToolConfig): Promise<boolean> {
	const packageRoot = await getPackageRoot()

	const args = [...tool.args]

	// Add config file if specified
	if (tool.configArg && tool.configFile) {
		const configPath = resolve(packageRoot, tool.configFile)
		args.push(tool.configArg, configPath)
	}

	// Add ignore file if specified
	if (tool.ignoreArg && tool.ignoreFile) {
		const ignorePath = resolve(packageRoot, tool.ignoreFile)
		args.push(tool.ignoreArg, ignorePath)
	}

	try {
		const command = `${tool.command} ${args.join(" ")}`
		console.info(`🔧 Running ${tool.title}...`)
		console.info(`   Command: ${command}`)

		// Capture output to suppress it on success
		execSync(command, {
			stdio: "pipe",
			cwd: process.cwd(),
			encoding: "utf8"
		})

		console.info(`✅ ${tool.title} completed`)
		return true
	} catch (error) {
		// On error, capture and save failure log
		console.info(`❌ ${tool.title} failed`)

		let stdout = ""
		let stderr = ""
		let exitCode: number | undefined
		let errorMessage = ""

		if (error && typeof error === "object") {
			const execError = error as {
				stdout?: string | Buffer
				stderr?: string | Buffer
				message?: string
				status?: number
				signal?: string
			}
			stdout = execError.stdout?.toString() || ""
			stderr = execError.stderr?.toString() || ""
			errorMessage = execError.message || ""
			exitCode = execError.status
		} else {
			errorMessage = String(error)
		}

		// Save failure log
		const logData: {
			tool: string
			command: string
			args: string[]
			exitCode?: number
			stdout?: string
			stderr?: string
			workingDir: string
			timestamp: string
		} = {
			tool: tool.name,
			command: tool.command,
			args,
			workingDir: process.cwd(),
			timestamp: new Date().toISOString()
		}
		if (exitCode !== undefined) {
			logData.exitCode = exitCode
		}
		if (stdout) {
			logData.stdout = stdout
		}
		if (stderr || errorMessage) {
			logData.stderr = stderr || errorMessage
		}
		const logPath = await saveFailureLog(logData)

		// Show concise error output
		if (stdout || stderr || errorMessage) {
			const output = stdout || stderr || errorMessage
			// Show first few lines only
			const lines = output.split("\n").slice(0, 5)
			console.error(lines.join("\n"))
			if (output.split("\n").length > 5) {
				console.error("...")
			}
		}

		// Show log path message
		if (logPath) {
			// Log is in CWD, so just show the filename
			const filename = logPath.split(/[/\\]/).pop() || logPath

			console.error("")
			console.error(`📄 Full failure log saved to: ${filename}`)

			// Append to GitHub Step Summary if in CI
			await appendToGitHubStepSummary(
				`### ❌ ${tool.title} Failed\n\n` +
					`**Full log:** \`${filename}\`\n\n` +
					`<details><summary>View error details</summary>\n\n` +
					`\`\`\`\n${(stderr || stdout || errorMessage).slice(0, 500)}\n\`\`\`\n\n` +
					`</details>`
			)
		} else {
			console.error(stdout || stderr || errorMessage)
		}

		return false
	}
}

// Find the package root using read-package-up
export async function getPackageRoot(): Promise<string> {
	const __filename = fileURLToPath(import.meta.url)
	const __dirname = dirname(__filename)

	const result = await readPackageUp({ cwd: __dirname })
	if (!result) {
		throw new Error("Could not find package.json")
	}
	// result.path is the path to package.json, so get its directory
	return dirname(result.path)
}

export async function saveFailureLog(data: FailureLogData): Promise<string | null> {
	try {
		const cwd = process.cwd()

		// Create log entry
		const logEntry = createLogEntry(data)

		// Generate filename: circlesac-lint-<program>-<timestamp>.log
		const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
		const filename = `circlesac-lint-${data.tool}-${timestamp}.log`
		const logPath = join(cwd, filename)

		// Write log file
		await writeFile(logPath, logEntry, "utf8")

		return logPath
	} catch {
		// Silently fail if we can't write logs
		return null
	}
}

function createLogEntry(data: FailureLogData): string {
	const lines: string[] = []
	lines.push("=".repeat(80))
	lines.push(`Tool: ${data.tool}`)
	if (data.toolVersion) lines.push(`Version: ${data.toolVersion}`)
	lines.push(`Command: ${data.command}`)
	lines.push(`Arguments: ${JSON.stringify(data.args)}`)
	if (data.exitCode !== undefined) lines.push(`Exit Code: ${data.exitCode}`)
	lines.push(`Working Directory: ${data.workingDir}`)
	lines.push(`Timestamp: ${data.timestamp}`)
	lines.push("=".repeat(80))
	lines.push("")

	if (data.stdout) {
		const stdout = data.stdout.toString()
		lines.push("STDOUT:")
		lines.push("-".repeat(80))
		lines.push(stdout)
		lines.push("")
	}

	if (data.stderr) {
		const stderr = data.stderr.toString()
		lines.push("STDERR:")
		lines.push("-".repeat(80))
		lines.push(stderr)
		lines.push("")
	}

	return lines.join("\n")
}

export async function appendToGitHubStepSummary(message: string): Promise<void> {
	try {
		const summaryPath = process.env.GITHUB_STEP_SUMMARY
		if (!summaryPath) return

		// Check if file exists, then append with newline prefix if it does
		let summaryContent = ""
		try {
			await access(summaryPath)
			summaryContent = "\n"
		} catch {
			// File doesn't exist, start fresh
		}
		await appendFile(summaryPath, summaryContent + message + "\n", "utf8")
	} catch {
		// Silently fail if we can't write to GitHub summary (env var not set or other errors)
	}
}
