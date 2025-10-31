import { execSync } from "child_process"
import { dirname, resolve } from "path"
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
		// On error, show the actual tool output
		console.info(`❌ ${tool.title} failed`)
		if (error && typeof error === "object") {
			const execError = error as { stdout?: string | Buffer; stderr?: string | Buffer; message?: string }
			if (execError.stdout) {
				console.error(execError.stdout.toString())
			}
			if (execError.stderr) {
				console.error(execError.stderr.toString())
			}
			if (!execError.stdout && !execError.stderr && execError.message) {
				console.error(execError.message)
			}
		} else {
			console.error(String(error))
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
