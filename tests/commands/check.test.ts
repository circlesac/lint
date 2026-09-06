import { execSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isWorkersProject, runChecks } from "../../src/commands/check.js";

const write = (root: string, rel: string, text: string) => {
	mkdirSync(join(root, rel, ".."), { recursive: true });
	writeFileSync(join(root, rel), text);
};

const scaffoldWorkers = (root: string) => {
	write(
		root,
		"package.json",
		JSON.stringify({
			name: "fixture",
			type: "module",
			scripts: {
				dev: "wrangler dev",
				types: "wrangler types",
				typecheck: "bun run types && tsc --noEmit",
				lint: "lint --all --no-fix",
				format: "lint --biome",
				check: "lint check",
				test: "bun run types && bun run lint && bun run check && vitest run --coverage",
				deploy: "wrangler deploy",
			},
			dependencies: { hono: "^4.0.0" },
			devDependencies: { wrangler: "^4.0.0", vitest: "^5.0.0" },
		}),
	);
	write(root, "bun.lock", "");
	write(
		root,
		"wrangler.jsonc",
		'{ "name": "fixture", "main": "src/index.ts" }',
	);
	write(root, ".gitignore", "node_modules/\nworker-configuration.d.ts\n");
	write(root, "README.md", "# Fixture\n\nDocs at /docs.\n\n## Tooling\n");
	write(
		root,
		"src/index.ts",
		"app.doc31('/openapi.json', {})\napp.get('/docs', ui())\n",
	);
	write(root, "src/controllers/index.ts", "export { users } from './users'\n");
	write(
		root,
		"src/controllers/users/schemas.ts",
		"export const A = z.object({})\n",
	);
	write(
		root,
		"src/controllers/users/index.ts",
		"class ListUsers {\n  static route = createRoute({ method: 'get', path: '/users' })\n  static handle = async (c) => c.json(c.req.valid('query'), 200)\n}\nexport const users = new App().openapi(ListUsers.route, ListUsers.handle)\n",
	);
	write(
		root,
		"tests/helpers/request.ts",
		"import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test'\nexport const client = hc<AppType>('http://x', { fetch: async (i, init) => { const ctx = createExecutionContext(); const r = await app.fetch(new Request(i, init), env, ctx); await waitOnExecutionContext(ctx); return r } })\n",
	);
	write(
		root,
		"tests/users.test.ts",
		"import { client } from './helpers/request'\n",
	);
	write(
		root,
		"vitest.config.ts",
		"export default defineConfig({ test: { pool: cloudflarePool({ wrangler: { configPath: './wrangler.jsonc' } }) } })\n",
	);
	execSync("git init -q && git add -A", { cwd: root, stdio: "pipe" });
};

describe("check", () => {
	let root: string;

	beforeEach(() => {
		root = join(
			tmpdir(),
			`lint-check-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		);
		mkdirSync(root, { recursive: true });
	});

	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it("treats a repository with wrangler.jsonc as a Workers project", () => {
		scaffoldWorkers(root);
		expect(isWorkersProject(root)).toBe(true);
	});

	it("passes a compliant Workers repository", () => {
		scaffoldWorkers(root);
		const failed = runChecks(root, { probe: false }).filter((r) => !r.ok);
		expect(failed).toEqual([]);
	});

	it("fails on the misses seen in validation runs", () => {
		scaffoldWorkers(root);
		write(root, "package-lock.json", "{}");
		write(
			root,
			"src/controllers/users/index.ts",
			"const route = createRoute({ method: 'get', path: '/users' })\napp.openapi(route, async (c) => { const body = await c.req.json(); return c.json(body as Payload) })\n",
		);
		write(
			root,
			"tests/helpers/request.ts",
			"export const client = hc<AppType>('http://localhost')\n",
		);
		write(
			root,
			"tests/users.test.ts",
			"const r = await app.request('/users')\n",
		);
		write(root, "vitest.config.ts", "export default defineConfig({})\n");
		write(
			root,
			"biome.json",
			'{ "linter": { "rules": { "suspicious": { "noExplicitAny": "off" } } } }',
		);
		const pkg = JSON.parse(
			String(require("node:fs").readFileSync(join(root, "package.json"))),
		);
		pkg.scripts.lint = "eslint . || true";
		pkg.devDependencies["@cloudflare/workers-types"] = "^4.0.0";
		pkg.devDependencies.typescript = "5.9.3";
		pkg.devDependencies["@types/bun"] = "latest";
		write(root, "package.json", JSON.stringify(pkg));
		const failed = runChecks(root, { probe: false })
			.filter((r) => !r.ok)
			.map((r) => r.name);
		expect(failed).toEqual(
			expect.arrayContaining([
				"Bun lockfile committed, no other package manager lockfile",
				"No neutralized gate in scripts",
				"No dependency on the latest tag or a wildcard",
				"No exact version pins (use the package manager's default range)",
				"Repository Biome config does not weaken noExplicitAny",
				"No published Workers type package (wrangler types supersedes it)",
				"Each controller declares routes as classes with static route = createRoute(...) and a static handle function",
				"Handlers read validated inputs only (no raw c.req.json/param/query, no casts)",
				"tests/helpers/request.ts builds the app-typed client over app.fetch with an execution context from cloudflare:test",
				"Tests call the API through the typed client, not app.request",
				"Test runner config points the Workers pool at wrangler.jsonc (no node environment)",
			]),
		);
	});

	it("rejects text-level gaming of the structure checks", () => {
		scaffoldWorkers(root);
		write(
			root,
			"src/controllers/users/index.ts",
			"// method: 'get'\nexport class ListUsers {\n  static route = '/users'\n  static handle = 'list'\n}\n",
		);
		write(
			root,
			"tests/helpers/request.ts",
			"export const createExecutionContext = () => ({})\nconst fetch = (i, init) => app.fetch(new Request(i, init), {}, createExecutionContext())\nexport const client = hc<AppType>('http://x', { fetch })\n",
		);
		write(
			root,
			"vitest.config.ts",
			"// cloudflarePool / defineWorkersConfig wrangler\nexport default defineConfig({ test: { environment: 'node' } })\n",
		);
		write(root, "wrangler.toml", "name = 'x'\n");
		const failed = runChecks(root, { probe: false })
			.filter((r) => !r.ok)
			.map((r) => r.name);
		expect(failed).toEqual(
			expect.arrayContaining([
				"wrangler.jsonc is the only Wrangler config",
				"Each controller declares routes as classes with static route = createRoute(...) and a static handle function",
				"Route method and path are declared in the controller",
				"tests/helpers/request.ts builds the app-typed client over app.fetch with an execution context from cloudflare:test",
				"Test runner config points the Workers pool at wrangler.jsonc (no node environment)",
			]),
		);
	});

	it("reports missing probe dependencies instead of running the probe", () => {
		scaffoldWorkers(root);
		const probe = runChecks(root).filter((r) => r.name.startsWith("Probe:"));
		expect(probe).toHaveLength(1);
		expect(probe[0]?.ok).toBe(false);
	});

	it("runs only the generic set outside a Workers project", () => {
		write(
			root,
			"package.json",
			JSON.stringify({
				name: "cli",
				scripts: {
					lint: "lint --all --no-fix",
					format: "lint --biome",
					check: "lint check",
					test: "bun run lint && bun run check && vitest run",
				},
				dependencies: {},
			}),
		);
		write(root, "bun.lock", "");
		execSync("git init -q && git add -A", { cwd: root, stdio: "pipe" });
		expect(isWorkersProject(root)).toBe(false);
		expect(runChecks(root, { probe: false }).filter((r) => !r.ok)).toEqual([]);
	});
});

describe("satisfiesRange", () => {
	it("matches caret, greater-or-equal, and union ranges", async () => {
		const { satisfiesRange } = await import("../../src/commands/probe.js");
		expect(satisfiesRange("4.1.11", "^4.1.0")).toBe(true);
		expect(satisfiesRange("5.0.0", "^4.1.0")).toBe(false);
		expect(satisfiesRange("5.0.0", ">=4.1.0")).toBe(true);
		expect(satisfiesRange("0.22.0", "^0.22.0")).toBe(true);
		expect(satisfiesRange("0.23.0", "^0.22.0")).toBe(false);
		expect(satisfiesRange("5.0.0", "^4.1 || ^5")).toBe(true);
	});
});
