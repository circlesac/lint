import { execSync } from "node:child_process";
import { access, appendFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readPackageUp } from "read-package-up";

export interface ToolConfig {
	name: string;
	title: string;
	/** Command to run. `biome` resolves to the bundled Biome binary. */
	command: string;
	args: string[];
	/** Extra arguments added when fixes are enabled (the default). */
	fixArgs?: string[];
	configArg?: string;
	configFile?: string;
	requiredFile?: string;
}

export interface RunOptions {
	fix: boolean;
}

interface FailureLogData {
	tool: string;
	toolVersion?: string;
	command: string;
	args: string[];
	exitCode?: number;
	stdout?: string;
	stderr?: string;
	workingDir: string;
	timestamp: string;
}

export async function runTool(
	tool: ToolConfig,
	options: RunOptions = { fix: true },
): Promise<boolean> {
	// Skip tool if required file doesn't exist in the project
	if (tool.requiredFile) {
		try {
			await access(resolve(process.cwd(), tool.requiredFile));
		} catch {
			console.info(`⏭️  Skipping ${tool.title} (no ${tool.requiredFile} found)`);
			return true;
		}
	}

	const packageRoot = await getPackageRoot();

	const args = [...tool.args];
	if (options.fix && tool.fixArgs) args.push(...tool.fixArgs);

	// Add config file if specified
	if (tool.configArg && tool.configFile) {
		const configPath = resolve(packageRoot, tool.configFile);
		args.push(tool.configArg, configPath);
	}

	try {
		const command = `${resolveCommand(tool.command)} ${args.join(" ")}`;
		console.info(`🔧 Running ${tool.title}...`);
		console.info(`   Command: ${command}`);

		// Capture output to suppress it on success
		execSync(command, {
			stdio: "pipe",
			cwd: process.cwd(),
			encoding: "utf8",
		});

		console.info(`✅ ${tool.title} completed`);
		return true;
	} catch (error) {
		// On error, capture and save failure log
		console.info(`❌ ${tool.title} failed`);

		let stdout = "";
		let stderr = "";
		let exitCode: number | undefined;
		let errorMessage = "";

		if (error && typeof error === "object") {
			const execError = error as {
				stdout?: string | Buffer;
				stderr?: string | Buffer;
				message?: string;
				status?: number;
				signal?: string;
			};
			stdout = execError.stdout?.toString() || "";
			stderr = execError.stderr?.toString() || "";
			errorMessage = execError.message || "";
			exitCode = execError.status;
		} else {
			errorMessage = String(error);
		}

		// Save failure log
		const logData: {
			tool: string;
			command: string;
			args: string[];
			exitCode?: number;
			stdout?: string;
			stderr?: string;
			workingDir: string;
			timestamp: string;
		} = {
			tool: tool.name,
			command: tool.command,
			args,
			workingDir: process.cwd(),
			timestamp: new Date().toISOString(),
		};
		if (exitCode !== undefined) {
			logData.exitCode = exitCode;
		}
		if (stdout) {
			logData.stdout = stdout;
		}
		if (stderr || errorMessage) {
			logData.stderr = stderr || errorMessage;
		}
		const logPath = await saveFailureLog(logData);

		// Show concise error output
		if (stdout || stderr || errorMessage) {
			const output = stdout || stderr || errorMessage;
			// Show first few lines only
			const lines = output.split("\n").slice(0, 5);
			console.error(lines.join("\n"));
			if (output.split("\n").length > 5) {
				console.error("...");
			}
		}

		// Show log path message
		if (logPath) {
			// Log is in tmp folder, show full path
			console.error("");
			console.error(`📄 Full failure log saved to: ${logPath}`);

			// Append to GitHub Step Summary if in CI
			await appendToGitHubStepSummary(
				`### ❌ ${tool.title} Failed\n\n` +
					`**Full log:** \`${logPath}\`\n\n` +
					`<details><summary>View error details</summary>\n\n` +
					`\`\`\`\n${(stderr || stdout || errorMessage).slice(0, 500)}\n\`\`\`\n\n` +
					`</details>`,
			);
		} else {
			console.error(stdout || stderr || errorMessage);
		}

		return false;
	}
}

// The bundled Biome is executed through its Node entry so consumers need no Biome of their own.
export function resolveCommand(command: string): string {
	if (command !== "biome") return command;
	const require = createRequire(import.meta.url);
	return `node ${JSON.stringify(require.resolve("@biomejs/biome/bin/biome"))}`;
}

// Find the package root using read-package-up
export async function getPackageRoot(): Promise<string> {
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = dirname(__filename);

	const result = await readPackageUp({ cwd: __dirname });
	if (!result) {
		throw new Error("Could not find package.json");
	}
	// result.path is the path to package.json, so get its directory
	return dirname(result.path);
}

export async function saveFailureLog(
	data: FailureLogData,
): Promise<string | null> {
	try {
		const tmpDir = tmpdir();

		// Create log entry
		const logEntry = createLogEntry(data);

		// Generate filename: circlesac-lint-<program>-<timestamp>.log
		const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
		const filename = `circlesac-lint-${data.tool}-${timestamp}.log`;
		const logPath = join(tmpDir, filename);

		// Write log file
		await writeFile(logPath, logEntry, "utf8");

		return logPath;
	} catch {
		// Silently fail if we can't write logs
		return null;
	}
}

function createLogEntry(data: FailureLogData): string {
	const lines: string[] = [];
	lines.push("=".repeat(80));
	lines.push(`Tool: ${data.tool}`);
	if (data.toolVersion) lines.push(`Version: ${data.toolVersion}`);
	lines.push(`Command: ${data.command}`);
	lines.push(`Arguments: ${JSON.stringify(data.args)}`);
	if (data.exitCode !== undefined) lines.push(`Exit Code: ${data.exitCode}`);
	lines.push(`Working Directory: ${data.workingDir}`);
	lines.push(`Timestamp: ${data.timestamp}`);
	lines.push("=".repeat(80));
	lines.push("");

	if (data.stdout) {
		const stdout = data.stdout.toString();
		lines.push("STDOUT:");
		lines.push("-".repeat(80));
		lines.push(stdout);
		lines.push("");
	}

	if (data.stderr) {
		const stderr = data.stderr.toString();
		lines.push("STDERR:");
		lines.push("-".repeat(80));
		lines.push(stderr);
		lines.push("");
	}

	return lines.join("\n");
}

export async function appendToGitHubStepSummary(
	message: string,
): Promise<void> {
	try {
		const summaryPath = process.env.GITHUB_STEP_SUMMARY;
		if (!summaryPath) return;

		// Check if file exists, then append with newline prefix if it does
		let summaryContent = "";
		try {
			await access(summaryPath);
			summaryContent = "\n";
		} catch {
			// File doesn't exist, start fresh
		}
		await appendFile(summaryPath, summaryContent + message + "\n", "utf8");
	} catch {
		// Silently fail if we can't write to GitHub summary (env var not set or other errors)
	}
}
