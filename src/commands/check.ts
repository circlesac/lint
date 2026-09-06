import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { defineCommand } from "citty";

/**
 * Deterministic structure checks for Circles repositories.
 *
 * Every check states the requirement it enforces. A repository that is a Cloudflare Workers API
 * (wrangler configuration present) gets the full Workers set; other repositories get the generic set.
 * The command prints one line per check and exits 1 when any check fails, so `bun run test` can gate on it.
 */

export interface CheckResult {
	name: string;
	ok: boolean;
	detail?: string;
}

type Check = (root: string) => CheckResult;

const readText = (root: string, rel: string): string | undefined => {
	const path = join(root, rel);
	return existsSync(path) ? readFileSync(path, "utf8") : undefined;
};

const readJson = (
	root: string,
	rel: string,
): Record<string, unknown> | undefined => {
	const text = readText(root, rel);
	if (!text) return undefined;
	try {
		return JSON.parse(text) as Record<string, unknown>;
	} catch {
		return undefined;
	}
};

const listDirs = (path: string): string[] =>
	existsSync(path)
		? readdirSync(path).filter((entry) =>
				statSync(join(path, entry)).isDirectory(),
			)
		: [];

const listFiles = (
	path: string,
	filter: (name: string) => boolean,
): string[] =>
	existsSync(path)
		? readdirSync(path).filter(
				(entry) => statSync(join(path, entry)).isFile() && filter(entry),
			)
		: [];

const trackedFiles = (root: string): string[] => {
	try {
		return execSync("git ls-files", {
			cwd: root,
			encoding: "utf8",
			stdio: "pipe",
		})
			.split("\n")
			.filter(Boolean);
	} catch {
		return [];
	}
};

const result = (name: string, ok: boolean, detail?: string): CheckResult =>
	detail === undefined ? { name, ok } : { name, ok, detail };

export function isWorkersProject(root: string): boolean {
	return (
		existsSync(join(root, "wrangler.jsonc")) ||
		existsSync(join(root, "wrangler.toml")) ||
		existsSync(join(root, "wrangler.json"))
	);
}

const scriptsOf = (root: string): Record<string, string> => {
	const pkg = readJson(root, "package.json");
	const scripts = (pkg?.scripts ?? {}) as Record<string, string>;
	return scripts;
};

const dependenciesOf = (root: string): Record<string, string> => {
	const pkg = readJson(root, "package.json");
	return {
		...((pkg?.dependencies ?? {}) as Record<string, string>),
		...((pkg?.devDependencies ?? {}) as Record<string, string>),
	};
};

export const genericChecks: Check[] = [
	(root) =>
		result("package.json exists", existsSync(join(root, "package.json"))),
	(root) => {
		const bun =
			existsSync(join(root, "bun.lock")) || existsSync(join(root, "bun.lockb"));
		const others = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml"].filter(
			(f) => existsSync(join(root, f)),
		);
		return result(
			"Bun lockfile committed, no other package manager lockfile",
			bun && others.length === 0,
			others.length
				? `found ${others.join(", ")}`
				: bun
					? undefined
					: "bun.lock missing",
		);
	},
	(root) => {
		const scripts = scriptsOf(root);
		const neutralized = Object.entries(scripts).filter(
			([, cmd]) => /\|\|\s*true\b/.test(cmd) || /--no-config-lookup/.test(cmd),
		);
		return result(
			"No neutralized gate in scripts",
			neutralized.length === 0,
			neutralized.map(([k]) => k).join(", ") || undefined,
		);
	},
	(root) => {
		const deps = dependenciesOf(root);
		const latest = Object.entries(deps).filter(
			([, v]) => v === "latest" || v === "*",
		);
		return result(
			"No dependency on the latest tag or a wildcard",
			latest.length === 0,
			latest.map(([k]) => k).join(", ") || undefined,
		);
	},
	(root) => {
		const deps = dependenciesOf(root);
		const pinned = Object.entries(deps).filter(([, v]) => /^\d/.test(v));
		return result(
			"No exact version pins (use the package manager's default range)",
			pinned.length === 0,
			pinned.map(([k, v]) => `${k}@${v}`).join(", ") || undefined,
		);
	},
	(root) => {
		const scripts = scriptsOf(root);
		const missing = ["lint", "format", "check", "test"].filter(
			(s) => !scripts[s],
		);
		return result(
			"Scripts lint, format, check, test exist",
			missing.length === 0,
			missing.length ? `missing ${missing.join(", ")}` : undefined,
		);
	},
	(root) => {
		const test = scriptsOf(root).test ?? "";
		const ok =
			/\bbun run lint\b|\blint\b/.test(test) &&
			/\bbun run check\b|\bcheck\b/.test(test);
		return result(
			"test script runs lint and check before the runner",
			ok,
			ok ? undefined : `test: ${test || "(none)"}`,
		);
	},
	(root) => {
		const tracked = trackedFiles(root);
		const stray = tracked.filter((f) => f === "index.ts");
		return result(
			"No scaffold leftover at the repository root",
			stray.length === 0,
			stray.join(", ") || undefined,
		);
	},
	(root) => {
		const biome = ["biome.json", "biome.jsonc"].find((f) =>
			existsSync(join(root, f)),
		);
		if (!biome)
			return result(
				"No repository Biome config (the shared configuration applies)",
				true,
			);
		const text = readText(root, biome) ?? "";
		const weakened = /noExplicitAny"?\s*:\s*"?(off|warn)/.test(text);
		return result(
			"Repository Biome config does not weaken noExplicitAny",
			!weakened,
			weakened ? biome : undefined,
		);
	},
];

export const workersChecks: Check[] = [
	(root) =>
		result(
			"wrangler.jsonc is the Wrangler config",
			existsSync(join(root, "wrangler.jsonc")),
			existsSync(join(root, "wrangler.toml"))
				? "found wrangler.toml"
				: undefined,
		),
	(root) =>
		result(
			"types script is `wrangler types`",
			scriptsOf(root).types === "wrangler types",
			scriptsOf(root).types,
		),
	(root) => {
		const missing = ["types", "typecheck", "dev", "deploy"].filter(
			(s) => !scriptsOf(root)[s],
		);
		return result(
			"Scripts types, typecheck, dev, deploy exist",
			missing.length === 0,
			missing.length ? `missing ${missing.join(", ")}` : undefined,
		);
	},
	(root) => {
		const ignore = readText(root, ".gitignore") ?? "";
		const tracked = trackedFiles(root);
		const ignored = /worker-configuration\.d\.ts/.test(ignore);
		const committed = tracked.includes("worker-configuration.d.ts");
		return result(
			"worker-configuration.d.ts is gitignored and not committed",
			ignored && !committed,
			!ignored ? "not in .gitignore" : committed ? "tracked by git" : undefined,
		);
	},
	(root) =>
		result(
			"No published Workers type package (wrangler types supersedes it)",
			!("@cloudflare/workers-types" in dependenciesOf(root)),
		),
	(root) =>
		result("src/index.ts exists", existsSync(join(root, "src/index.ts"))),
	(root) => {
		const dirs = listDirs(join(root, "src/controllers"));
		const bad = dirs.filter(
			(d) =>
				!existsSync(join(root, "src/controllers", d, "index.ts")) ||
				!existsSync(join(root, "src/controllers", d, "schemas.ts")),
		);
		return result(
			"Controller directories under src/controllers/<category>/ with index.ts and schemas.ts",
			dirs.length > 0 && bad.length === 0,
			dirs.length === 0
				? "no controller directories"
				: bad.length
					? `incomplete: ${bad.join(", ")}`
					: undefined,
		);
	},
	(root) =>
		result(
			"src/controllers/index.ts re-exports controllers",
			existsSync(join(root, "src/controllers/index.ts")),
		),
	(root) => {
		const dirs = listDirs(join(root, "src/controllers"));
		const missing = dirs.filter(
			(d) =>
				!/static\s+(readonly\s+)?route\s*=/.test(
					readText(root, `src/controllers/${d}/index.ts`) ?? "",
				),
		);
		return result(
			"Each controller declares routes as classes with a static route",
			dirs.length > 0 && missing.length === 0,
			missing.join(", ") || undefined,
		);
	},
	(root) => {
		const dirs = listDirs(join(root, "src/controllers"));
		const missing = dirs.filter(
			(d) =>
				!/method:\s*["'](get|post|put|patch|delete)["']/.test(
					readText(root, `src/controllers/${d}/index.ts`) ?? "",
				),
		);
		return result(
			"Route method and path are declared in the controller",
			dirs.length > 0 && missing.length === 0,
			missing.join(", ") || undefined,
		);
	},
	(root) => {
		const dirs = listDirs(join(root, "src/controllers"));
		const offenders = dirs.filter((d) =>
			/c\.req\.(json|param|query)\(\)|\)\s+as\s+[A-Z]/.test(
				readText(root, `src/controllers/${d}/index.ts`) ?? "",
			),
		);
		return result(
			"Handlers read validated inputs only (no raw c.req.json/param/query, no casts)",
			offenders.length === 0,
			offenders.join(", ") || undefined,
		);
	},
	(root) => {
		const dirs = listDirs(join(root, "src/controllers"));
		const offenders = dirs.filter((d) =>
			/z\.object\(/.test(readText(root, `src/controllers/${d}/index.ts`) ?? ""),
		);
		return result(
			"Schemas live in schemas.ts, not in the controller",
			offenders.length === 0,
			offenders.join(", ") || undefined,
		);
	},
	(root) => {
		const entry = readText(root, "src/index.ts") ?? "";
		return result(
			"src/index.ts serves /openapi.json and /docs",
			/\/openapi\.json/.test(entry) && /["']\/docs["']/.test(entry),
		);
	},
	(root) => {
		const tests = listFiles(join(root, "tests"), (f) => /\.test\.ts$/.test(f));
		return result("tests/*.test.ts exist", tests.length > 0);
	},
	(root) => {
		const helper = readText(root, "tests/helpers/request.ts") ?? "";
		const ok =
			/hc</.test(helper) &&
			/createExecutionContext/.test(helper) &&
			/app\.fetch\(/.test(helper);
		return result(
			"tests/helpers/request.ts builds the app-typed client over app.fetch with an execution context",
			ok,
			helper ? undefined : "missing",
		);
	},
	(root) => {
		const tests = listFiles(join(root, "tests"), (f) => /\.test\.ts$/.test(f));
		const bypass = tests.filter((f) =>
			/app\.request\(|app\.fetch\(/.test(readText(root, `tests/${f}`) ?? ""),
		);
		return result(
			"Tests call the API through the typed client, not app.request",
			bypass.length === 0,
			bypass.join(", ") || undefined,
		);
	},
	(root) => {
		const config = listFiles(root, (f) =>
			/^vitest\.config\.(ts|mts|js|mjs)$/.test(f),
		)[0];
		const text = config ? (readText(root, config) ?? "") : "";
		const ok =
			/wrangler/.test(text) &&
			/(cloudflarePool|defineWorkersConfig)/.test(text);
		return result(
			"Test runner config points the Workers pool at wrangler.jsonc",
			ok,
			config ? undefined : "no vitest config",
		);
	},
	(root) => {
		const readme = readText(root, "README.md") ?? "";
		return result(
			"README links /docs and has a Tooling section",
			/\/docs/.test(readme) && /tooling/i.test(readme),
		);
	},
];

export function runChecks(root: string): CheckResult[] {
	const checks = isWorkersProject(root)
		? [...genericChecks, ...workersChecks]
		: genericChecks;
	return checks.map((check) => check(root));
}

export const checkCommand = defineCommand({
	meta: {
		name: "check",
		description:
			"Deterministic structure checks for Circles repositories (Workers API set when a Wrangler config is present)",
	},
	args: {
		cwd: {
			type: "string",
			description: "Repository root (default: current directory)",
		},
		json: { type: "boolean", description: "Print results as JSON" },
	},
	run({ args }) {
		const root = resolve(args.cwd ?? process.cwd());
		const results = runChecks(root);
		const failed = results.filter((r) => !r.ok);
		if (args.json) {
			console.info(
				JSON.stringify(
					{ root, workers: isWorkersProject(root), results },
					null,
					2,
				),
			);
		} else {
			console.info(
				`🔎 circlesac check (${isWorkersProject(root) ? "Workers API" : "generic"}) in ${root}`,
			);
			for (const r of results)
				console.info(
					`${r.ok ? "✅" : "❌"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`,
				);
			console.info(
				failed.length === 0
					? `✓ ${results.length} checks passed`
					: `✗ ${failed.length} of ${results.length} checks failed`,
			);
		}
		if (failed.length > 0) process.exitCode = 1;
	},
});
