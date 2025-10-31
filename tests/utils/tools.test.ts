import { describe, expect, it } from "vitest"
import { getPackageRoot } from "../../src/utils/tools.js"

describe("tools", () => {
	describe("getPackageRoot", () => {
		it("should return the package root directory", async () => {
			const root = await getPackageRoot()
			expect(root).toBeDefined()
			expect(typeof root).toBe("string")
			expect(root).toContain("lint")
		})
	})

	// Note: runTool tests would require more complex mocking
	// of execSync and readPackageUp, which is left for future implementation
})
