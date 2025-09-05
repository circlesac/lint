import { BaseCommand } from "../utils/base.js"
import { runTool, type ToolConfig } from "../utils/tools.js"

const tools: ToolConfig[] = [
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
		command: "npx prettier",
		args: ["'**/*.{ts,tsx,js,jsx,json,md,cjs,mjs,mts,yml,yaml}'", "--write"],
		configArg: "--config",
		configFile: "prettier.config.mjs"
	},
	{
		name: "biome",
		title: "Biome",
		command: "npx @biomejs/biome",
		args: ["check", "--write"],
		configArg: "--config-path",
		configFile: "biome.jsonc"
	}
]

export class LintCommand extends BaseCommand {
	constructor() {
		super("lint")
		this.option("--all", "Run all tools")
		for (const tool of tools) {
			this.option(`--${tool.name}`, `Run ${tool.title}`)
		}
	}

	protected async execute(options: Record<string, boolean>) {
		console.info("🔧 Running lint tools...")

		// Validate options and determine which tools to run
		const enabledTools = this.getEnabledTools(tools, options)

		// Run enabled tools sequentially
		const results: { tool: string; success: boolean }[] = []
		for (const tool of enabledTools) {
			results.push({
				tool: tool.name,
				success: await runTool(tool)
			})
		}

		// Report results
		const failedTools = results.filter((r) => !r.success).map((r) => r.tool)
		const successfulTools = results.filter((r) => r.success).map((r) => r.tool)

		if (successfulTools.length > 0) {
			console.info(`✓ Completed: ${successfulTools.join(", ")}`)
		}

		if (failedTools.length > 0) {
			console.error(`✗ Failed: ${failedTools.join(", ")}`)
		}
	}

	private getEnabledTools(tools: ToolConfig[], options: Record<string, boolean>) {
		// If --all is specified, run all tools (regardless of individual tool options)
		if (options.all) return tools

		// Find all specified individual tool options
		const selectedTools = tools.filter((tool) => options[tool.name])
		if (selectedTools.length !== 0) return selectedTools

		this.help()
	}
}
