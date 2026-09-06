import { defineCommand, showUsage } from "citty";
import packageJson from "../../package.json" with { type: "json" };
import { checkCommand } from "./check.js";
import { lintArgs, runLint } from "./lint.js";

export const mainCommand = defineCommand({
	meta: {
		name: "lint",
		version: packageJson.version,
		description: packageJson.description,
	},
	args: lintArgs,
	subCommands: {
		check: checkCommand,
	},
	async run(context) {
		// citty runs the parent after a matched subcommand; the subcommand already handled the request.
		if (
			context.rawArgs[0] &&
			context.rawArgs[0] in (mainCommand.subCommands ?? {})
		)
			return;
		const ran = await runLint(
			context.args as Record<string, boolean | undefined>,
		);
		if (!ran) await showUsage(mainCommand);
	},
});

export { checkCommand } from "./check.js";
