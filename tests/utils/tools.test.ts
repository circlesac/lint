import { existsSync, readdirSync, readFileSync, unlinkSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { appendToGitHubStepSummary, getPackageRoot, saveFailureLog } from "../../src/utils/tools.js"

describe("tools", () => {
	const originalEnv = process.env
	const originalCwd = process.cwd()

	beforeEach(() => {
		vi.clearAllMocks()
		process.env = { ...originalEnv }
		delete process.env.GITHUB_STEP_SUMMARY
	})

	afterEach(async () => {
		process.env = originalEnv
		// Clean up test log files from CWD
		try {
			const files = readdirSync(originalCwd)
			for (const file of files) {
				if (file.startsWith("circlesac-lint-") && file.endsWith(".log")) {
					try {
						unlinkSync(join(originalCwd, file))
					} catch {
						// Ignore cleanup errors
					}
				}
			}
		} catch {
			// Ignore cleanup errors
		}
	})

	describe("getPackageRoot", () => {
		it("should return the package root directory", async () => {
			const root = await getPackageRoot()
			expect(root).toBeDefined()
			expect(typeof root).toBe("string")
			expect(root).toContain("lint")
		})
	})

	describe("saveFailureLog", () => {
		it("should save failure log to current working directory", async () => {
			const logData = {
				tool: "eslint",
				command: "npx eslint",
				args: ["--fix"],
				exitCode: 1,
				stdout: "Error: Some linting errors",
				stderr: "Failed to lint",
				workingDir: process.cwd(),
				timestamp: new Date().toISOString()
			}

			const logPath = await saveFailureLog(logData)

			expect(logPath).toBeDefined()
			if (logPath) {
				expect(logPath).toContain(process.cwd())
				expect(logPath).toMatch(/circlesac-lint-eslint-.*\.log$/)
				expect(existsSync(logPath)).toBe(true)
				const content = readFileSync(logPath, "utf8")
				expect(content).toContain("Tool: eslint")
				expect(content).toContain("Command: npx eslint")
				expect(content).toContain("Error: Some linting errors")
				expect(content).toContain("Failed to lint")
			}
		})

		it("should include all output when output is very long", async () => {
			const longOutput = Array.from({ length: 500 }, (_, i) => `Line ${i}`).join("\n")
			const logData = {
				tool: "prettier",
				command: "npx prettier",
				args: ["--check"],
				exitCode: 1,
				stdout: longOutput,
				workingDir: process.cwd(),
				timestamp: new Date().toISOString()
			}

			const logPath = await saveFailureLog(logData)

			if (logPath) {
				const content = readFileSync(logPath, "utf8")
				// Should contain all output (no truncation)
				expect(content).toContain("Line 0")
				expect(content).toContain("Line 499")
				expect(content).not.toContain("lines omitted")
				// Should contain all 500 lines
				const lineCount = content.split("\n").filter((l) => l.startsWith("Line ")).length
				expect(lineCount).toBe(500)
			}
		})

		it("should handle missing optional fields", async () => {
			const logData = {
				tool: "oxlint",
				command: "npx oxlint",
				args: ["--fix"],
				workingDir: process.cwd(),
				timestamp: new Date().toISOString()
			}

			const logPath = await saveFailureLog(logData)

			if (logPath) {
				expect(existsSync(logPath)).toBe(true)
				const content = readFileSync(logPath, "utf8")
				expect(content).toContain("Tool: oxlint")
			}
		})
	})

	describe("appendToGitHubStepSummary", () => {
		it("should append to GitHub Step Summary when GITHUB_STEP_SUMMARY is set", async () => {
			const testSummaryPath = join(tmpdir(), "test-summary.md")
			process.env.GITHUB_STEP_SUMMARY = testSummaryPath

			// Clean up any existing file
			try {
				if (existsSync(testSummaryPath)) {
					unlinkSync(testSummaryPath)
				}
			} catch {
				// Ignore
			}

			await appendToGitHubStepSummary("## Test Summary\n\nThis is a test")

			expect(existsSync(testSummaryPath)).toBe(true)
			const content = readFileSync(testSummaryPath, "utf8")
			expect(content).toContain("## Test Summary")
			expect(content).toContain("This is a test")

			// Clean up
			try {
				if (existsSync(testSummaryPath)) {
					unlinkSync(testSummaryPath)
				}
			} catch {
				// Ignore
			}
		})

		it("should not fail when GITHUB_STEP_SUMMARY is not set", async () => {
			delete process.env.GITHUB_STEP_SUMMARY

			await expect(appendToGitHubStepSummary("test")).resolves.not.toThrow()
		})
	})

	// Note: runTool tests would require more complex mocking
	// of execSync and readPackageUp, which is left for future implementation
})
