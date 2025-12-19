import { execSync } from "child_process"
import { mkdirSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { getPackageRoot } from "../../src/utils/tools.js"

describe(".venv ignore", () => {
	let testDir: string
	let packageRoot: string

	beforeEach(async () => {
		packageRoot = await getPackageRoot()

		// Create a temporary directory for testing
		testDir = join(tmpdir(), `lint-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
		mkdirSync(testDir, { recursive: true })

		// Create test files that should be linted
		writeFileSync(join(testDir, "test.ts"), 'const x = "hello"\nconsole.log(x)\n')
		writeFileSync(join(testDir, "test.js"), 'const y = "world"\nconsole.log(y)\n')

		// Create .venv directory with files that should be ignored
		mkdirSync(join(testDir, ".venv"), { recursive: true })
		mkdirSync(join(testDir, ".venv", "lib"), { recursive: true })
		mkdirSync(join(testDir, ".venv", "bin"), { recursive: true })

		// Create files in .venv that would normally trigger linting errors
		writeFileSync(join(testDir, ".venv", "lib", "bad.py"), 'import os\nprint("bad formatting")\n')
		writeFileSync(join(testDir, ".venv", "bin", "script.py"), '#!/usr/bin/env python\nprint("unformatted")\n')
		writeFileSync(join(testDir, ".venv", "test.ts"), 'const badCode = "this should be ignored"\nconsole.log(badCode)\n')
	})

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true })
	})

	it("should ignore .venv files when running lint command", async () => {
		// Run Biome check (fastest tool) to verify .venv is ignored
		// We test one tool instead of all to keep tests fast
		const biomeConfig = join(packageRoot, "biome.jsonc")
		const originalCwd = process.cwd()
		process.chdir(testDir)

		const output = execSync(
			`npx @biomejs/biome check --config-path "${biomeConfig}" .`,
			{
				cwd: testDir,
				encoding: "utf8",
				stdio: "pipe",
				timeout: 30000
			}
		).toString()

		process.chdir(originalCwd)

		// Verify that .venv files are not mentioned in the output
		expect(output).not.toContain(".venv/test.ts")
		expect(output).not.toContain(".venv/lib")
		expect(output).not.toContain(".venv/bin")
		expect(output).not.toContain(".venv/")
	})
})
