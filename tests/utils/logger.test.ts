import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { logger } from "../../src/utils/logger.js"

describe("Logger", () => {
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>

	beforeEach(() => {
		consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
	})

	afterEach(() => {
		consoleErrorSpy.mockRestore()
	})

	it("should log error messages", () => {
		logger.error("Test Title", "Test message")
		expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
	})

	it("should handle multiline messages", () => {
		logger.error("Test Title", "Line 1\nLine 2")
		expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
	})

	it("should be a singleton", () => {
		const logger1 = logger
		const logger2 = logger
		expect(logger1).toBe(logger2)
	})
})
