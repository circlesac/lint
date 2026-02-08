import { execSync } from "child_process"
import { describe, expect, it } from "vitest"
import { getPackageRoot } from "../../src/utils/tools.js"

describe("CLI", () => {
	let packageRoot: string

	it("--help shows all flags", async () => {
		packageRoot = await getPackageRoot()
		const output = execSync("bun run dev --help", {
			cwd: packageRoot,
			encoding: "utf8",
			stdio: "pipe"
		})

		expect(output).toContain("--all")
		expect(output).toContain("--oxlint")
		expect(output).toContain("--eslint")
		expect(output).toContain("--prettier")
		expect(output).toContain("--biome")
		expect(output).toContain("--typecheck")
	})

	it("--version outputs version", async () => {
		packageRoot = await getPackageRoot()
		const output = execSync("bun run dev --version", {
			cwd: packageRoot,
			encoding: "utf8",
			stdio: "pipe"
		}).trim()

		expect(output).toMatch(/^\d+\.\d+\.\d+$/)
	})

	it("no flags shows usage and exits 0", async () => {
		packageRoot = await getPackageRoot()
		const output = execSync("bun run dev", {
			cwd: packageRoot,
			encoding: "utf8",
			stdio: "pipe"
		})

		expect(output).toContain("USAGE")
		expect(output).toContain("--all")
	})
})
