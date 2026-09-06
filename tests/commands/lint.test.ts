import { execSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPackageRoot } from "../../src/utils/tools.js";

const run = (args: string, cwd?: string) => {
	const packageRoot = process.env.LINT_PACKAGE_ROOT ?? "";
	try {
		return {
			code: 0,
			out: execSync(`bun run ${join(packageRoot, "src/main.ts")} ${args}`, {
				cwd: cwd ?? packageRoot,
				encoding: "utf8",
				stdio: "pipe",
			}),
		};
	} catch (error) {
		const e = error as { status?: number; stdout?: string; stderr?: string };
		return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
	}
};

describe("CLI", () => {
	beforeEach(async () => {
		process.env.LINT_PACKAGE_ROOT = await getPackageRoot();
	});

	it("--help lists the tools, --no-fix, and the check subcommand", () => {
		const { out } = run("--help");
		expect(out).toContain("--all");
		expect(out).toContain("--biome");
		expect(out).toContain("--typecheck");
		expect(out).toContain("fix");
		expect(out).toContain("check");
		expect(out).not.toContain("--eslint");
		expect(out).not.toContain("--prettier");
	});

	it("--version outputs a CalVer version", () => {
		expect(run("--version").out.trim()).toMatch(/^\d+\.\d+\.\d+$/);
	});

	it("no flags shows usage and exits 0", () => {
		const { code, out } = run("");
		expect(code).toBe(0);
		expect(out).toContain("USAGE");
	});
});

describe("biome through the bundled config", () => {
	let dir: string;

	beforeEach(async () => {
		process.env.LINT_PACKAGE_ROOT = await getPackageRoot();
		dir = join(
			tmpdir(),
			`lint-biome-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		);
		mkdirSync(join(dir, ".venv"), { recursive: true });
		writeFileSync(
			join(dir, "package.json"),
			`${JSON.stringify({ name: "fixture", type: "module" }, null, "	")}
`,
		);
		writeFileSync(join(dir, ".venv", "ignored.ts"), "const   x:any = 1\n");
	});

	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it("reports explicit any as an error in --no-fix mode and ignores build directories", () => {
		writeFileSync(join(dir, "bad.ts"), "export const f = (x: any) => x\n");
		const { code, out } = run("--biome --no-fix", dir);
		expect(code).toBe(1);
		expect(out).toContain("Biome");
		expect(out).not.toContain(".venv/");
	});

	it("passes clean, formatted code in --no-fix mode", () => {
		writeFileSync(join(dir, "good.ts"), "export const f = (x: number) => x;\n");
		const { code } = run("--biome --no-fix", dir);
		expect(code).toBe(0);
	});

	it("formats in place by default", () => {
		writeFileSync(
			join(dir, "messy.ts"),
			"export const f = (x:number)=>{return x}\n",
		);
		const { code } = run("--biome", dir);
		expect(code).toBe(0);
		const { code: again } = run("--biome --no-fix", dir);
		expect(again).toBe(0);
	});
});
