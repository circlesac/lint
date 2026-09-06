import { execSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
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

const readVersion = (root: string, pkg: string): string | undefined => {
	const path = join(root, "node_modules", pkg, "package.json");
	if (!existsSync(path)) return undefined;
	try {
		return (JSON.parse(readFileSync(path, "utf8")) as { version?: string })
			.version;
	} catch {
		return undefined;
	}
};

/** Minimal semver check for the ranges peerDependencies use here (`^x.y.z`, `>=x.y.z`, `x`, `*`, `||` unions). */
export function satisfiesRange(version: string, range: string): boolean {
	const parse = (v: string) =>
		v
			.replace(/^v/, "")
			.split(/[-+]/)[0]
			?.split(".")
			.map((n) => Number(n) || 0) ?? [];
	const [maj = 0, min = 0, pat = 0] = parse(version);
	const cmp = (a: number[], b: number[]) =>
		a[0] !== b[0]
			? Math.sign((a[0] ?? 0) - (b[0] ?? 0))
			: a[1] !== b[1]
				? Math.sign((a[1] ?? 0) - (b[1] ?? 0))
				: Math.sign((a[2] ?? 0) - (b[2] ?? 0));
	return range.split("||").some((part) => {
		const clause = part.trim();
		if (clause === "*" || clause === "") return true;
		const m = clause.match(
			/^(\^|~|>=|>|<=|<)?\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/,
		);
		if (!m) return false;
		const op = m[1] ?? "";
		const base = [Number(m[2]), Number(m[3] ?? 0), Number(m[4] ?? 0)];
		const current = [maj, min, pat];
		if (op === ">=") return cmp(current, base) >= 0;
		if (op === ">") return cmp(current, base) > 0;
		if (op === "<=") return cmp(current, base) <= 0;
		if (op === "<") return cmp(current, base) < 0;
		if (op === "~")
			return maj === base[0] && min === base[1] && cmp(current, base) >= 0;
		if (op === "^")
			return base[0] === 0
				? maj === 0 && min === base[1] && cmp(current, base) >= 0
				: maj === base[0] && cmp(current, base) >= 0;
		return m[3] === undefined
			? maj === base[0]
			: m[4] === undefined
				? maj === base[0] && min === base[1]
				: cmp(current, base) === 0;
	});
}

function peerRangeMismatch(root: string): string | undefined {
	const poolPath = join(
		root,
		"node_modules",
		"@cloudflare/vitest-pool-workers",
		"package.json",
	);
	if (!existsSync(poolPath)) return undefined;
	let peers: Record<string, string> = {};
	try {
		peers =
			(
				JSON.parse(readFileSync(poolPath, "utf8")) as {
					peerDependencies?: Record<string, string>;
				}
			).peerDependencies ?? {};
	} catch {
		return undefined;
	}
	const range = peers.vitest;
	const installed = readVersion(root, "vitest");
	if (!range || !installed) return undefined;
	return satisfiesRange(installed, range)
		? undefined
		: `vitest ${installed} is installed but @cloudflare/vitest-pool-workers requires ${range}; install the runner at that major (for example bun add -d vitest@4) until the pool supports the newer one`;
}

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
	const peer = peerRangeMismatch(root);
	if (peer) {
		results.push(
			result(
				"Probe: installed test runner satisfies the Workers pool's peer range",
				false,
				peer,
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
