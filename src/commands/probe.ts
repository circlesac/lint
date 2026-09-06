import { execSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { CheckResult } from "./check.js";

/**
 * Behavioral probe for Cloudflare Workers APIs.
 *
 * Text checks can be satisfied to the letter; this probe judges behavior. It writes its own Vitest
 * configuration (Workers pool pointed at wrangler.jsonc, coverage thresholds) and its own test into a
 * temporary directory inside the repository, then runs the probe and the repository's tests under that
 * configuration. Nothing the repository's own config or scripts say can change what is measured.
 */

const probeDirName = ".circlesac-probe";

const listDirs = (path: string): string[] =>
	existsSync(path)
		? readdirSync(path).filter((entry) =>
				statSync(join(path, entry)).isDirectory(),
			)
		: [];

const result = (name: string, ok: boolean, detail?: string): CheckResult =>
	detail === undefined ? { name, ok } : { name, ok, detail };

const tail = (text: string, lines = 25): string =>
	text.split("\n").filter(Boolean).slice(-lines).join("\n");

export function runWorkersProbe(root: string): CheckResult[] {
	const results: CheckResult[] = [];
	const has = (pkg: string) => existsSync(join(root, "node_modules", pkg));
	const missing = ["vitest", "@cloudflare/vitest-pool-workers"].filter(
		(pkg) => !has(pkg),
	);
	const coverageProvider = has("@vitest/coverage-istanbul")
		? "istanbul"
		: has("@vitest/coverage-v8")
			? "v8"
			: undefined;
	if (missing.length > 0 || !coverageProvider) {
		results.push(
			result(
				"Probe: test runner, Workers pool, and a coverage provider are installed",
				false,
				[
					...missing,
					...(coverageProvider ? [] : ["@vitest/coverage-istanbul"]),
				].join(", "),
			),
		);
		return results;
	}
	if (!existsSync(join(root, "src/index.ts"))) {
		results.push(
			result("Probe: src/index.ts exports the app", false, "missing"),
		);
		return results;
	}
	const controllers = listDirs(join(root, "src/controllers")).length;
	const probeDir = join(root, probeDirName);
	rmSync(probeDir, { recursive: true, force: true });
	mkdirSync(probeDir, { recursive: true });
	const configPath = join(probeDir, "vitest.config.mts");
	writeFileSync(
		configPath,
		`import { cloudflarePool, cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";
export default defineConfig({
	test: {
		pool: cloudflarePool({ wrangler: { configPath: ${JSON.stringify(join(root, "wrangler.jsonc"))} } }),
		include: [${JSON.stringify(`${probeDirName}/**/*.test.ts`)}, "tests/**/*.test.ts", "test/**/*.test.ts"],
		exclude: ["**/node_modules/**", "**/dist/**"],
		coverage: { provider: ${JSON.stringify(coverageProvider)}, include: ["src/**"], reporter: ["text-summary"], thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 } },
	},
	plugins: [cloudflareTest({ wrangler: { configPath: ${JSON.stringify(join(root, "wrangler.jsonc"))} } })],
});
`,
	);
	writeFileSync(
		join(probeDir, "openapi.probe.test.ts"),
		`import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../src/index";

const fetchApp = async (path: string) => {
	const ctx = createExecutionContext();
	const response = await app.fetch(new Request("http://probe.local" + path), env, ctx);
	await waitOnExecutionContext(ctx);
	return response;
};

describe("circlesac probe", () => {
	it("serves the generated OpenAPI document with at least one path per controller", async () => {
		const response = await fetchApp("/openapi.json");
		expect(response.status).toBe(200);
		const document = (await response.json()) as { openapi?: string; paths?: Record<string, unknown> };
		expect(document.openapi ?? "").toMatch(/^3\\./);
		expect(Object.keys(document.paths ?? {}).length).toBeGreaterThanOrEqual(${Math.max(controllers, 1)});
	});
	it("serves the reference UI", async () => {
		const response = await fetchApp("/docs");
		expect(response.status).toBe(200);
		expect(await response.text()).toContain("openapi.json");
	});
});
`,
	);
	const vitest = join(root, "node_modules", ".bin", "vitest");
	const run = (args: string[]) => {
		try {
			return {
				code: 0,
				out: execSync(
					`${JSON.stringify(vitest)} run --root ${JSON.stringify(root)} --config ${JSON.stringify(configPath)} ${args.join(" ")}`,
					{
						cwd: root,
						encoding: "utf8",
						stdio: "pipe",
						env: { ...process.env, CI: "1", NO_COLOR: "1" },
						timeout: 600_000,
					},
				),
			};
		} catch (error) {
			const e = error as { status?: number; stdout?: string; stderr?: string };
			return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
		}
	};
	try {
		const probe = run([
			JSON.stringify(`${probeDirName}/openapi.probe.test.ts`),
		]);
		results.push(
			result(
				"Probe: app serves /openapi.json (3.x, one path per controller) and /docs under the Workers pool",
				probe.code === 0,
				probe.code === 0 ? undefined : tail(probe.out),
			),
		);
		const suite = run([
			"--coverage",
			"--exclude",
			JSON.stringify(`${probeDirName}/**`),
		]);
		results.push(
			result(
				"Probe: repository tests pass under the Workers pool with 80% coverage of src",
				suite.code === 0,
				suite.code === 0 ? undefined : tail(suite.out),
			),
		);
	} finally {
		rmSync(probeDir, { recursive: true, force: true });
	}
	return results;
}
