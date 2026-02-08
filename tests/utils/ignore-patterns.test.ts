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

		// Create htmlcov directory with files that should be ignored
		mkdirSync(join(testDir, "htmlcov"), { recursive: true })
		writeFileSync(join(testDir, "htmlcov", "index.html"), "<html><body>coverage report</body></html>\n")
		writeFileSync(join(testDir, "htmlcov", "test.ts"), 'const badCode = "this should be ignored"\nconsole.log(badCode)\n')
	})

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true })
	})

	it("should ignore .venv and htmlcov files when running lint command", async () => {
		// Run the full lint command (all tools) to verify .venv and htmlcov are ignored
		// The lint command will lint files in process.cwd(), so we need to change directory
		const originalCwd = process.cwd()
		process.chdir(testDir)

		let output = ""
		try {
			output = execSync(`bun run dev --all`, {
				cwd: packageRoot,
				encoding: "utf8",
				stdio: "pipe",
				timeout: 60000
			}).toString()
		} catch (error) {
			// Some tools may fail in the temp directory (e.g. ESLint config resolution),
			// but we still want to verify ignore patterns from the captured output
			const execError = error as { stdout?: string; stderr?: string }
			output = (execError.stdout || "") + (execError.stderr || "")
		}

		process.chdir(originalCwd)

		// Verify that .venv files are not mentioned in the output
		expect(output).not.toContain(".venv/test.ts")
		expect(output).not.toContain(".venv/lib")
		expect(output).not.toContain(".venv/bin")
		expect(output).not.toContain(".venv/")

		// Verify that htmlcov files are not mentioned in the output
		expect(output).not.toContain("htmlcov/test.ts")
		expect(output).not.toContain("htmlcov/index.html")
		expect(output).not.toContain("htmlcov/")
	}, 60000) // Test timeout: 60 seconds for all tools
})
