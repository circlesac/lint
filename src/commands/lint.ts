import type { ArgsDef } from "citty";
import { runTool, type ToolConfig } from "../utils/tools.js";

const tools: ToolConfig[] = [
	{
		name: "biome",
		title: "Biome",
		command: "biome",
		args: ["check"],
		fixArgs: ["--write"],
		configArg: "--config-path",
		configFile: "biome.jsonc",
	},
	{
		name: "typecheck",
		title: "TypeScript",
		command: "npx tsc",
		args: ["--noEmit"],
		requiredFile: "node_modules/typescript",
	},
];

export const lintArgs = {
	all: {
		type: "boolean",
		description: "Run every tool (Biome check, TypeScript)",
	},
	fix: {
		type: "boolean",
		default: true,
		description:
			"Apply safe fixes and formatting (use --no-fix for a read-only gate)",
	},
	...Object.fromEntries(
		tools.map((tool) => [
			tool.name,
			{ type: "boolean" as const, description: `Run ${tool.title}` },
		]),
	),
} satisfies ArgsDef;

/** Runs the selected tools. Returns false when nothing was selected so the caller can show usage. */
export async function runLint(
	options: Record<string, boolean | undefined>,
): Promise<boolean> {
	const fix = options.fix !== false;
	const selected = options.all
		? tools
		: tools.filter((tool) => options[tool.name]);
	if (selected.length === 0) return false;
	console.info(`🔧 Running lint tools${fix ? "" : " (no fixes)"}...`);
	const results: { tool: string; success: boolean }[] = [];
	for (const tool of selected) {
		results.push({ tool: tool.name, success: await runTool(tool, { fix }) });
	}
	const failed = results.filter((r) => !r.success).map((r) => r.tool);
	const succeeded = results.filter((r) => r.success).map((r) => r.tool);
	if (succeeded.length > 0)
		console.info(`✓ Completed: ${succeeded.join(", ")}`);
	if (failed.length > 0) {
		console.error(`✗ Failed: ${failed.join(", ")}`);
		process.exitCode = 1;
	}
	return true;
}
