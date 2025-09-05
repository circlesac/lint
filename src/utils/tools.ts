import { execSync } from "child_process"
import { dirname, resolve } from "path"
import { readPackageUp } from "read-package-up"
import { fileURLToPath } from "url"

export interface ToolConfig {
	name: string
	title: string
	command: string
	args: string[]
	configArg: string
	configFile: string
}

export async function runTool(tool: ToolConfig): Promise<boolean> {
	const packageRoot = await getPackageRoot()
	const configPath = resolve(packageRoot, tool.configFile)

	const args = [...tool.args]
	args.push(tool.configArg, configPath)

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
		if (error instanceof Error && "stdout" in error) {
			console.error(error.stdout)
		} else if (error instanceof Error && "stderr" in error) {
			console.error(error.stderr)
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
	return resolve(result.path, "..")
}
