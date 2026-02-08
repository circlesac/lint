import { defineCommand, showUsage } from "citty"
import packageJson from "../../package.json" with { type: "json" }
import { runTool, type ToolConfig } from "../utils/tools.js"

const tools: ToolConfig[] = [
	{
		name: "oxlint",
		title: "Oxlint",
		command: "npx oxlint",
		args: ["--fix"]
	},
	{
		name: "eslint",
		title: "ESLint",
		command: "npx eslint",
		args: ["--fix"],
		configArg: "--config",
		configFile: "eslint.config.mjs"
	},
	{
		name: "prettier",
		title: "Prettier",
		command: "npx prettier@latest",
		args: ["'**/*.{ts,tsx,js,jsx,json,jsonc,md,cjs,mjs,mts,yml,yaml}'", "'!**/sst-env.d.ts'", "--write"],
		configArg: "--config",
		configFile: "prettier.config.mjs",
		ignoreArg: "--ignore-path",
		ignoreFile: ".prettierignore"
	},
	{
		name: "biome",
		title: "Biome",
		command: "npx @biomejs/biome",
		args: ["check", "--write"],
		configArg: "--config-path",
		configFile: "biome.jsonc"
	},
	{
		name: "typecheck",
		title: "TypeScript",
		command: "npx tsc",
		args: ["--noEmit"]
	}
]

export const lintCommand = defineCommand({
	meta: {
		name: packageJson.name,
		version: packageJson.version,
		description: packageJson.description
	},
	args: {
		all: {
			type: "boolean",
			description: "Run all tools"
		},
		...Object.fromEntries(tools.map((tool) => [tool.name, { type: "boolean" as const, description: `Run ${tool.title}` }]))
	},
	async run({ args }) {
		console.info("🔧 Running lint tools...")

		const options = args as Record<string, boolean>

		// Validate options and determine which tools to run
		if (options.all) {
			return await runTools(tools)
		}

		const selectedTools = tools.filter((tool) => options[tool.name])
		if (selectedTools.length > 0) {
			return await runTools(selectedTools)
		}

		// No tools selected, show help and exit
		await showUsage(lintCommand)
		process.exit(0)
	}
})

async function runTools(enabledTools: ToolConfig[]) {
	const results: { tool: string; success: boolean }[] = []
	for (const tool of enabledTools) {
		results.push({
			tool: tool.name,
			success: await runTool(tool)
		})
	}

	const failedTools = results.filter((r) => !r.success).map((r) => r.tool)
	const successfulTools = results.filter((r) => r.success).map((r) => r.tool)

	if (successfulTools.length > 0) {
		console.info(`✓ Completed: ${successfulTools.join(", ")}`)
	}

	if (failedTools.length > 0) {
		console.error(`✗ Failed: ${failedTools.join(", ")}`)
		process.exitCode = 1
	}
}
